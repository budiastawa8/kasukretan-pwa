import { getDb } from "../db/client";
import { uuid } from "../utils";
import type { SumberPembayaran } from "./setoran";

export const ALASAN_HAPUS_PEMBAYARAN_OPTIONS = [
  { value: "salah_krama", label: "Salah krama" },
  { value: "salah_nominal_periode", label: "Salah nominal / periode" },
  { value: "dobel_input", label: "Dobel input" },
  { value: "uji_coba", label: "Uji coba / latihan" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export type AlasanHapusPembayaranKode =
  (typeof ALASAN_HAPUS_PEMBAYARAN_OPTIONS)[number]["value"];

export type AlasanHapusPembayaran = {
  kode: AlasanHapusPembayaranKode | string;
  /** Teks bebas wajib jika kode = lainnya; selain itu diisi label opsi. */
  teks?: string;
  dihapusOlehPetugasId?: string | null;
  dihapusOlehUserId?: string | null;
};

export type PembayaranHapusLogRow = {
  id: string;
  sumber: SumberPembayaran;
  pembayaran_id: string;
  tanggal_transaksi: string;
  jumlah: number;
  uraian: string | null;
  krama_id: string | null;
  nomor_kartu: string | null;
  kepala_nama: string | null;
  petugas_id: string | null;
  petugas_nama: string | null;
  alasan_kode: string;
  alasan_teks: string;
  dihapus_oleh_petugas_id: string | null;
  dihapus_oleh_user_id: string | null;
  dihapus_oleh_nama: string | null;
  created_at: string;
};

type SnapshotPembayaran = {
  pembayaran_id: string;
  tanggal_transaksi: string;
  jumlah: number;
  uraian: string;
  krama_id: string | null;
  nomor_kartu: string | null;
  kepala_nama: string | null;
  petugas_id: string | null;
  petugas_nama: string | null;
};

export function labelAlasanHapusPembayaran(kode: string): string {
  return (
    ALASAN_HAPUS_PEMBAYARAN_OPTIONS.find((o) => o.value === kode)?.label ?? kode
  );
}

export function normalizeAlasanHapusPembayaran(
  alasan: AlasanHapusPembayaran
): { kode: string; teks: string } {
  const kode = String(alasan.kode || "").trim();
  if (!kode) throw new Error("Alasan hapus wajib dipilih");
  const known = ALASAN_HAPUS_PEMBAYARAN_OPTIONS.find((o) => o.value === kode);
  if (!known) throw new Error("Alasan hapus tidak valid");
  const teks =
    kode === "lainnya"
      ? String(alasan.teks || "").trim()
      : String(alasan.teks || "").trim() || known.label;
  if (kode === "lainnya" && !teks) {
    throw new Error("Jelaskan alasan hapus (Lainnya)");
  }
  return { kode, teks };
}

async function loadSnapshot(
  sumber: SumberPembayaran,
  id: string
): Promise<SnapshotPembayaran | null> {
  const db = await getDb();
  if (sumber === "paturunan") {
    const rows = await db.select<SnapshotPembayaran[]>(
      `SELECT p.id as pembayaran_id, p.tanggal as tanggal_transaksi, p.jumlah,
              'Paturunan ' || i.nama ||
                CASE WHEN COALESCE(p.jenis, 'wajib') = 'punia' THEN ' (punia)' ELSE '' END as uraian,
              p.krama_id as krama_id, k.nomor_kartu, pd.nama_lengkap as kepala_nama,
              p.petugas_id, t.nama as petugas_nama
       FROM paturunan_pembayaran p
       JOIN krama k ON k.id = p.krama_id
       JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
       JOIN iuran_paturunan i ON i.id = p.iuran_id
       LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
       WHERE p.id = ?`,
      [id]
    );
    return rows[0] ?? null;
  }
  if (sumber === "dudukan") {
    const rows = await db.select<SnapshotPembayaran[]>(
      `SELECT p.id as pembayaran_id, p.tanggal as tanggal_transaksi, p.jumlah,
              'Dudukan ' || printf('%02d', p.bulan) || '/' || p.tahun as uraian,
              p.krama_id as krama_id, k.nomor_kartu, pd.nama_lengkap as kepala_nama,
              p.petugas_id, t.nama as petugas_nama
       FROM dudukan_pembayaran p
       JOIN krama k ON k.id = p.krama_id
       JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
       LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
       WHERE p.id = ?`,
      [id]
    );
    return rows[0] ?? null;
  }
  const rows = await db.select<SnapshotPembayaran[]>(
    `SELECT p.id as pembayaran_id, p.tanggal as tanggal_transaksi, p.jumlah,
            CASE p.jenis
              WHEN 'punia_kasukretan' THEN 'Punia Kasukretan'
              ELSE 'Dana Kerjasama Kasukretan'
            END ||
            CASE
              WHEN TRIM(COALESCE(p.kegiatan, '')) != '' THEN ' · ' || TRIM(p.kegiatan)
              ELSE ''
            END as uraian,
            p.krama_id as krama_id,
            COALESCE(k.nomor_kartu, '—') as nomor_kartu,
            COALESCE(
              NULLIF(TRIM(p.sumber_nama), ''),
              pd.nama_lengkap,
              lb.nama,
              '—'
            ) as kepala_nama,
            p.petugas_id, t.nama as petugas_nama
     FROM penerimaan_dana_lain p
     LEFT JOIN krama k ON k.id = p.krama_id
     LEFT JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
     LEFT JOIN lembaga_badan lb ON lb.id = p.lembaga_badan_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE p.id = ?`,
    [id]
  );
  return rows[0] ?? null;
}

async function resolveDihapusOlehNama(
  petugasId: string | null | undefined,
  userId: string | null | undefined
): Promise<string | null> {
  const db = await getDb();
  if (petugasId) {
    const rows = await db.select<{ nama: string }[]>(
      `SELECT nama FROM tim_kasukretan WHERE id = ?`,
      [petugasId]
    );
    if (rows[0]?.nama) return rows[0].nama;
  }
  if (userId) {
    const rows = await db.select<{ nama: string }[]>(
      `SELECT nama FROM user WHERE id = ?`,
      [userId]
    );
    if (rows[0]?.nama) return rows[0].nama;
  }
  return null;
}

/** Simpan jejak sebelum baris pembayaran dihapus permanen. */
export async function catatHapusPembayaran(
  sumber: SumberPembayaran,
  id: string,
  alasan: AlasanHapusPembayaran
): Promise<void> {
  const { kode, teks } = normalizeAlasanHapusPembayaran(alasan);
  const snap = await loadSnapshot(sumber, id);
  if (!snap) throw new Error("Pembayaran tidak ditemukan");

  const dihapusOlehPetugasId = alasan.dihapusOlehPetugasId?.trim() || null;
  const dihapusOlehUserId = alasan.dihapusOlehUserId?.trim() || null;
  const dihapusOlehNama = await resolveDihapusOlehNama(
    dihapusOlehPetugasId,
    dihapusOlehUserId
  );

  const db = await getDb();
  await db.execute(
    `INSERT INTO pembayaran_hapus_log (
       id, sumber, pembayaran_id, tanggal_transaksi, jumlah, uraian,
       krama_id, nomor_kartu, kepala_nama, petugas_id, petugas_nama,
       alasan_kode, alasan_teks,
       dihapus_oleh_petugas_id, dihapus_oleh_user_id, dihapus_oleh_nama,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      uuid(),
      sumber,
      snap.pembayaran_id,
      snap.tanggal_transaksi,
      Math.round(Number(snap.jumlah) || 0),
      snap.uraian || null,
      snap.krama_id,
      snap.nomor_kartu,
      snap.kepala_nama,
      snap.petugas_id,
      snap.petugas_nama,
      kode,
      teks,
      dihapusOlehPetugasId,
      dihapusOlehUserId,
      dihapusOlehNama,
    ]
  );
}

export async function listPembayaranHapusLog(params?: {
  dari?: string;
  sampai?: string;
  sumber?: SumberPembayaran | "";
  petugasId?: string;
  q?: string;
  limit?: number;
}): Promise<PembayaranHapusLogRow[]> {
  const db = await getDb();
  const where: string[] = ["1=1"];
  const args: unknown[] = [];

  if (params?.dari) {
    where.push("date(h.created_at) >= date(?)");
    args.push(params.dari);
  }
  if (params?.sampai) {
    where.push("date(h.created_at) <= date(?)");
    args.push(params.sampai);
  }
  if (params?.sumber) {
    where.push("h.sumber = ?");
    args.push(params.sumber);
  }
  if (params?.petugasId) {
    where.push("(h.petugas_id = ? OR h.dihapus_oleh_petugas_id = ?)");
    args.push(params.petugasId, params.petugasId);
  }
  const q = params?.q?.trim();
  if (q) {
    where.push(
      `(h.kepala_nama LIKE ? OR h.nomor_kartu LIKE ? OR h.uraian LIKE ? OR h.alasan_teks LIKE ? OR h.dihapus_oleh_nama LIKE ? OR h.petugas_nama LIKE ?)`
    );
    const like = `%${q}%`;
    args.push(like, like, like, like, like, like);
  }

  const limit = Math.min(Math.max(params?.limit ?? 500, 1), 2000);
  const rows = await db.select<PembayaranHapusLogRow[]>(
    `SELECT h.*
     FROM pembayaran_hapus_log h
     WHERE ${where.join(" AND ")}
     ORDER BY h.created_at DESC
     LIMIT ${limit}`,
    args
  );
  return rows.map((r) => ({
    ...r,
    jumlah: Math.round(Number(r.jumlah) || 0),
  }));
}
