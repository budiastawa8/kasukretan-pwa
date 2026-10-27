/**
 * Endpoint publik (tanpa login) untuk cek tunggakan Paturunan.
 * Dijaga oleh flag desa_adat.cek_tunggakan_paturunan_publik.
 */

import { dbSelect } from "./db.js";
import { HttpError } from "./auth.js";

type Send = (status: number, data: unknown) => void;

/** Salinan ringan dari paturunan-hitung — hindari tarik utils/clsx ke bundle API. */
function hitungTagihanPaturunan(nominal: number, persen: number): number {
  const n = Number(nominal);
  const p = Number(persen);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.round((n * p) / 100);
}

function hitungSisaPaturunan(tagihan: number, dibayarWajib: number): number {
  return Math.max(0, Math.round(Number(tagihan) || 0) - Math.round(Number(dibayarWajib) || 0));
}

function resolvePersenPaturunanIuran(params: {
  persen: number | null | undefined;
  persenSebelumNyada?: number | null;
  nyadaSejak?: string | null;
  persenNyada?: number | null;
  nyadaSampai?: string | null;
  tanggalTarget?: string | null;
}): number {
  const persen = Number(params.persen) || 0;
  const target = params.tanggalTarget?.trim().slice(0, 10) || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return persen;
  const sejak = params.nyadaSejak?.trim().slice(0, 10) || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(sejak) && target < sejak) {
    return params.persenSebelumNyada == null ? persen : Number(params.persenSebelumNyada) || 0;
  }
  const sampai = params.nyadaSampai?.trim().slice(0, 10) || "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(sampai) && target < sampai && params.persenNyada != null) {
    return Number(params.persenNyada) || 0;
  }
  return persen;
}

const MIN_QUERY_LEN = 3;
const SEARCH_LIMIT = 25;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: { headers: { "x-forwarded-for"?: string | string[]; "x-real-ip"?: string | string[] }; socket?: { remoteAddress?: string } }): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0]!.trim();
  const xr = req.headers["x-real-ip"];
  if (typeof xr === "string" && xr.trim()) return xr.trim();
  return req.socket?.remoteAddress ?? "unknown";
}

function assertRateLimit(key: string): void {
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX) {
    throw new HttpError(429, "Terlalu banyak permintaan. Coba lagi sebentar.");
  }
}

function statusTagihan(tagihan: number, dibayar: number): string {
  const sisa = Math.max(0, tagihan - dibayar);
  if (tagihan <= 0) return "Tidak wajib";
  if (sisa <= 0) return "Lunas";
  if (dibayar > 0) return "Sebagian";
  return "Belum bayar";
}

async function loadFiturStatus(): Promise<{
  aktif: boolean;
  nama_desa_adat: string;
}> {
  const rows = await dbSelect(
    `SELECT nama_desa_adat, COALESCE(cek_tunggakan_paturunan_publik, 0) AS aktif
     FROM desa_adat LIMIT 1`
  );
  const row = rows[0];
  return {
    aktif: !!Number(row?.aktif ?? 0),
    nama_desa_adat: String(row?.nama_desa_adat ?? "Desa Adat"),
  };
}

async function requireFiturAktif(): Promise<{ nama_desa_adat: string }> {
  const status = await loadFiturStatus();
  if (!status.aktif) {
    throw new HttpError(
      403,
      "Pencarian tunggakan Paturunan sedang ditutup oleh pengurus desa adat."
    );
  }
  return { nama_desa_adat: status.nama_desa_adat };
}

async function searchKrama(q: string) {
  const like = `%${q}%`;
  const rows = await dbSelect(
    `SELECT k.id, k.nomor_kartu, p.nama_lengkap AS kepala_nama,
            b.nama AS banjar_nama,
            t.nama AS tempek_nama,
            jm.nama AS jenis_nama
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tempek t ON t.id = k.tempek_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     WHERE kk.kode = 'MIPIL' AND k.status_krama = 'aktif'
       AND (
         p.nama_lengkap LIKE ? COLLATE NOCASE
         OR k.nomor_kartu LIKE ? COLLATE NOCASE
         OR COALESCE(k.nomor_kartu_norm, '') LIKE ? COLLATE NOCASE
       )
     ORDER BY p.nama_lengkap COLLATE NOCASE, k.nomor_kartu
     LIMIT ?`,
    [like, like, like.replace(/[^a-zA-Z0-9%]/g, "").toLowerCase() || like, SEARCH_LIMIT]
  );

  return rows.map((r) => ({
    id: String(r.id),
    nomor_kartu: String(r.nomor_kartu ?? ""),
    kepala_nama: String(r.kepala_nama ?? ""),
    banjar_nama: String(r.banjar_nama ?? ""),
    tempek_nama: r.tempek_nama != null ? String(r.tempek_nama) : null,
    jenis_nama: r.jenis_nama != null ? String(r.jenis_nama) : null,
  }));
}

async function loadDetail(kramaId: string) {
  const kramaRows = await dbSelect(
    `SELECT k.id, k.nomor_kartu, p.nama_lengkap AS kepala_nama,
            b.nama AS banjar_nama, t.nama AS tempek_nama,
            jm.nama AS jenis_nama,
            jm.paturunan_persen AS persen,
            jprev.paturunan_persen AS persen_sebelum_nyada,
            k.nyada_sejak, k.nyada_sampai,
            jny.paturunan_persen AS persen_nyada
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tempek t ON t.id = k.tempek_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     LEFT JOIN jenis_krama_mipil jprev ON jprev.id = k.jenis_sebelum_nyada_id
     LEFT JOIN desa_adat d ON d.id = k.desa_adat_id
     LEFT JOIN jenis_krama_mipil jny ON jny.id = d.jenis_krama_mipil_id
     WHERE k.id = ? AND kk.kode = 'MIPIL' AND k.status_krama = 'aktif'`,
    [kramaId]
  );
  const krama = kramaRows[0];
  if (!krama) throw new HttpError(404, "Krama Mipil tidak ditemukan");

  const iuranRows = await dbSelect(
    `SELECT i.id, i.nama, COALESCE(i.nominal, 0) AS nominal, i.tanggal_target,
            COALESCE(SUM(CASE
              WHEN pp.id IS NULL THEN 0
              WHEN COALESCE(pp.jenis, 'wajib') = 'punia' THEN 0
              ELSE pp.jumlah
            END), 0) AS wajib,
            COALESCE(SUM(CASE
              WHEN pp.id IS NULL THEN 0
              WHEN COALESCE(pp.jenis, 'wajib') = 'punia' THEN pp.jumlah
              ELSE 0
            END), 0) AS punia
     FROM iuran_paturunan i
     LEFT JOIN paturunan_pembayaran pp
       ON pp.iuran_id = i.id AND pp.krama_id = ?
     WHERE i.aktif = 1
     GROUP BY i.id, i.nama, i.nominal, i.tanggal_target
     ORDER BY i.tanggal_target DESC, i.nama`,
    [kramaId]
  );

  const iuran = iuranRows.map((i) => {
    const persen = resolvePersenPaturunanIuran({
      persen: Number(krama.persen) || 0,
      persenSebelumNyada:
        krama.persen_sebelum_nyada == null ? null : Number(krama.persen_sebelum_nyada),
      nyadaSejak: krama.nyada_sejak != null ? String(krama.nyada_sejak) : null,
      persenNyada: krama.persen_nyada == null ? null : Number(krama.persen_nyada),
      nyadaSampai: krama.nyada_sampai != null ? String(krama.nyada_sampai) : null,
      tanggalTarget: i.tanggal_target != null ? String(i.tanggal_target) : null,
    });
    const tagihan = hitungTagihanPaturunan(Number(i.nominal) || 0, persen);
    const dibayarWajib = Number(i.wajib) || 0;
    const punia = Number(i.punia) || 0;
    const sisa = hitungSisaPaturunan(tagihan, dibayarWajib);
    return {
      iuran_id: String(i.id),
      iuran_nama: String(i.nama),
      tagihan,
      dibayar_wajib: dibayarWajib,
      punia,
      sisa,
      status: statusTagihan(tagihan, dibayarWajib),
    };
  });

  const totalSisa = iuran.reduce((s, row) => s + row.sisa, 0);
  const totalPunia = iuran.reduce((s, row) => s + row.punia, 0);

  return {
    krama: {
      id: String(krama.id),
      nomor_kartu: String(krama.nomor_kartu ?? ""),
      kepala_nama: String(krama.kepala_nama ?? ""),
      banjar_nama: String(krama.banjar_nama ?? ""),
      tempek_nama: krama.tempek_nama != null ? String(krama.tempek_nama) : null,
      jenis_nama: krama.jenis_nama != null ? String(krama.jenis_nama) : null,
    },
    total_sisa: totalSisa,
    total_punia: totalPunia,
    iuran,
  };
}

type PublikReq = {
  headers: {
    authorization?: string | string[];
    "x-forwarded-for"?: string | string[];
    "x-real-ip"?: string | string[];
  };
  socket?: { remoteAddress?: string };
  url?: string;
};

/** Endpoint publik tanpa auth. Return true jika path ditangani. */
export async function handlePublikCekTunggakanRoute(
  path: string,
  method: string,
  req: PublikReq,
  send: Send
): Promise<boolean> {
  if (!path.startsWith("publik/cek-tunggakan")) return false;

  assertRateLimit(clientKey(req));

  if (path === "publik/cek-tunggakan/status" && method === "GET") {
    const status = await loadFiturStatus();
    send(200, {
      ok: true,
      aktif: status.aktif,
      nama_desa_adat: status.nama_desa_adat,
    });
    return true;
  }

  if (path === "publik/cek-tunggakan/cari" && method === "GET") {
    await requireFiturAktif();
    // Vercel rewrite: /api/publik/...?q= → /api?path=publik/...&q=
    const url = new URL(req.url ?? "/", "http://localhost");
    const q = String(url.searchParams.get("q") ?? "").trim();
    if (q.length < MIN_QUERY_LEN) {
      throw new HttpError(400, `Ketik minimal ${MIN_QUERY_LEN} huruf untuk mencari.`);
    }
    send(200, { ok: true, results: await searchKrama(q) });
    return true;
  }

  const detailMatch = /^publik\/cek-tunggakan\/([^/]+)$/.exec(path);
  if (detailMatch && method === "GET") {
    await requireFiturAktif();
    const kramaId = decodeURIComponent(detailMatch[1]!);
    if (!kramaId || kramaId === "status" || kramaId === "cari") {
      throw new HttpError(404, "Endpoint tidak ditemukan");
    }
    send(200, { ok: true, data: await loadDetail(kramaId) });
    return true;
  }

  throw new HttpError(404, `Endpoint tidak ditemukan: ${method} /api/${path}`);
}
