import { HttpError, type PublicUser } from "./auth.js";
import { dbSelect } from "./db.js";
import { isFonnteConfigured, sendFonnteText } from "./fonnte.js";

type PetugasUangRow = {
  petugas_id: string;
  petugas_nama: string;
  petugas_nomor_kontak: string | null;
  jumlah_transaksi: number;
  total: number;
  tanggal_tertua: string;
};

/** Cooldown per petugas (hindari spam sekali klik berulang). */
const COOLDOWN_MS = 60_000;
const lastSentAt = new Map<string, number>();

function formatRp(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function formatTanggalId(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function hariSejak(tanggalIso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(tanggalIso.trim());
  if (!m) return 0;
  const t0 = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const t1 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((t1 - t0) / 86_400_000));
}

function buildPesan(row: PetugasUangRow): string {
  const hari = hariSejak(row.tanggal_tertua);
  return [
    `Halo ${row.petugas_nama},`,
    "",
    `Anda masih memegang uang setoran sebesar ${formatRp(row.total)} (${row.jumlah_transaksi} transaksi) sejak ${formatTanggalId(row.tanggal_tertua)} (${hari} hari).`,
    "Mohon segera disetorkan ke bendahara agar masuk buku kas desa.",
    "",
    "Terima kasih.",
  ].join("\n");
}

async function loadPetugasUangBelumDisetor(petugasId: string): Promise<PetugasUangRow | null> {
  const rows = await dbSelect(
    `SELECT x.petugas_id,
            COALESCE(t.nama, 'Tanpa petugas') as petugas_nama,
            t.nomor_kontak as petugas_nomor_kontak,
            COUNT(*) as jumlah_transaksi,
            COALESCE(SUM(x.jumlah), 0) as total,
            MIN(x.tanggal) as tanggal_tertua
     FROM (
       SELECT petugas_id, jumlah, tanggal FROM paturunan_pembayaran WHERE tanggal_setor IS NULL
       UNION ALL
       SELECT petugas_id, jumlah, tanggal FROM dudukan_pembayaran WHERE tanggal_setor IS NULL
       UNION ALL
       SELECT petugas_id, jumlah, tanggal FROM penerimaan_dana_lain WHERE tanggal_setor IS NULL
     ) x
     LEFT JOIN tim_kasukretan t ON t.id = x.petugas_id
     WHERE x.petugas_id = ?
     GROUP BY x.petugas_id`,
    [petugasId]
  );
  const r = rows[0];
  if (!r) return null;
  const kontak = r.petugas_nomor_kontak;
  return {
    petugas_id: String(r.petugas_id ?? ""),
    petugas_nama: String(r.petugas_nama ?? "Tanpa petugas"),
    petugas_nomor_kontak: typeof kontak === "string" && kontak.trim() ? kontak.trim() : null,
    jumlah_transaksi: Math.round(Number(r.jumlah_transaksi) || 0),
    total: Math.round(Number(r.total) || 0),
    tanggal_tertua: String(r.tanggal_tertua ?? ""),
  };
}

function assertBolehIngatkan(user: PublicUser): void {
  if (user.peran !== "admin" && user.peran !== "keuangan") {
    throw new HttpError(403, "Hanya admin atau keuangan yang boleh mengingatkan petugas.");
  }
}

export function setoranIngatStatus(): { configured: boolean } {
  return { configured: isFonnteConfigured() };
}

/**
 * Kirim pengingat setor via Fonnte ke satu petugas yang masih pegang uang.
 */
const MAX_MESSAGE_CHARS = 4000;

export async function ingatPetugasSetor(
  user: PublicUser,
  petugasIdRaw: string,
  messageOverride?: string | null
): Promise<{ ok: true; petugas_nama: string; target: string; detail?: string }> {
  assertBolehIngatkan(user);

  if (!isFonnteConfigured()) {
    throw new HttpError(
      503,
      "Fonnte belum dikonfigurasi. Isi FONNTE_TOKEN di environment server (Vercel / .env.local)."
    );
  }

  const petugasId = petugasIdRaw.trim();
  if (!petugasId) throw new HttpError(400, "petugasId wajib.");

  const last = lastSentAt.get(petugasId) ?? 0;
  const menunggu = COOLDOWN_MS - (Date.now() - last);
  if (menunggu > 0) {
    throw new HttpError(
      429,
      `Tunggu ${Math.ceil(menunggu / 1000)} detik sebelum mengingatkan petugas yang sama lagi.`
    );
  }

  const row = await loadPetugasUangBelumDisetor(petugasId);
  if (!row || row.total <= 0) {
    throw new HttpError(400, "Petugas ini tidak punya uang yang belum disetor.");
  }
  if (!row.petugas_nomor_kontak) {
    throw new HttpError(
      400,
      "Nomor kontak petugas belum diisi. Lengkapi di Master → Tim Kasukretan."
    );
  }

  const custom = typeof messageOverride === "string" ? messageOverride.trim() : "";
  if (custom.length > MAX_MESSAGE_CHARS) {
    throw new HttpError(400, `Pesan terlalu panjang (maks. ${MAX_MESSAGE_CHARS} karakter).`);
  }
  const message = custom || buildPesan(row);

  const result = await sendFonnteText({
    target: row.petugas_nomor_kontak,
    message,
  });

  lastSentAt.set(petugasId, Date.now());

  return {
    ok: true,
    petugas_nama: row.petugas_nama,
    target: result.target,
    detail: result.detail,
  };
}
