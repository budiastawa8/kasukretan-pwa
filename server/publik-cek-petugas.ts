/**
 * Endpoint publik (tanpa login) untuk verifikasi kartu petugas Tim Kasukretan.
 */

import { dbSelect } from "./db.js";
import { HttpError } from "./auth.js";

type Send = (status: number, data: unknown) => void;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: {
  headers: { "x-forwarded-for"?: string | string[]; "x-real-ip"?: string | string[] };
  socket?: { remoteAddress?: string };
}): string {
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

function normalizeNomorKey(raw: string): string {
  return raw.trim().replace(/-/g, "").toLowerCase();
}

async function loadDesaNama(): Promise<string> {
  const rows = await dbSelect(`SELECT nama_desa_adat FROM desa_adat LIMIT 1`);
  return String(rows[0]?.nama_desa_adat ?? "Desa Adat");
}

async function findPetugasByNomor(nomorRaw: string) {
  const key = normalizeNomorKey(nomorRaw);
  if (!key || key.length < 2) {
    throw new HttpError(400, "Nomor anggota tidak valid.");
  }

  const rows = await dbSelect(
    `SELECT t.id, t.nama, t.jabatan, t.nomor_pengenal, t.tipe,
            COALESCE(t.aktif, 1) AS aktif,
            b.nama AS banjar_nama, b.kode AS banjar_kode
     FROM tim_kasukretan t
     JOIN banjar b ON b.id = t.banjar_id
     WHERE lower(replace(COALESCE(t.nomor_pengenal, ''), '-', '')) = ?
     LIMIT 1`,
    [key]
  );
  const row = rows[0];
  const desaNama = await loadDesaNama();
  if (!row || !Number(row.aktif)) {
    return { sah: false as const, desa_nama: desaNama };
  }

  return {
    sah: true as const,
    desa_nama: desaNama,
    petugas: {
      id: String(row.id),
      nama: String(row.nama ?? ""),
      jabatan: String(row.jabatan ?? ""),
      nomor_pengenal: String(row.nomor_pengenal ?? ""),
      tipe: String(row.tipe ?? "banjar"),
      banjar_nama: String(row.banjar_nama ?? ""),
      banjar_kode: String(row.banjar_kode ?? ""),
    },
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
export async function handlePublikCekPetugasRoute(
  path: string,
  method: string,
  req: PublikReq,
  send: Send
): Promise<boolean> {
  if (!path.startsWith("publik/cek-petugas")) return false;

  assertRateLimit(clientKey(req));

  if (path === "publik/cek-petugas/status" && method === "GET") {
    send(200, { ok: true, nama_desa_adat: await loadDesaNama() });
    return true;
  }

  if (path === "publik/cek-petugas/verifikasi" && method === "GET") {
    const url = new URL(req.url ?? "/", "http://localhost");
    const q = String(url.searchParams.get("q") ?? "").trim();
    if (!q) throw new HttpError(400, "Masukkan nomor anggota atau hasil scan QR.");
    send(200, { ok: true, ...(await findPetugasByNomor(q)) });
    return true;
  }

  throw new HttpError(404, `Endpoint tidak ditemukan: ${method} /api/${path}`);
}
