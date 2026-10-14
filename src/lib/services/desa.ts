import { getDb } from "../db/client";
import { parseIsoDateString } from "../date-iso";
import type { DesaAdat, PrajuruDesaAdatInput } from "../types";
import { uuid } from "../utils";

export const DESA_ADAT_UPDATED_EVENT = "desa-adat-updated";

/** Baris desa_adat memuat logo & TTD (gambar base64, ratusan KB) dan dibaca di banyak tempat. */
const DESA_CACHE_TTL_MS = 5 * 60 * 1000;
let desaCache: { at: number; promise: Promise<DesaAdat | null> } | null = null;

export function invalidateDesaAdatCache(): void {
  desaCache = null;
}

if (typeof window !== "undefined") {
  window.addEventListener(DESA_ADAT_UPDATED_EVENT, invalidateDesaAdatCache);
}

async function loadDesaAdat(): Promise<DesaAdat | null> {
  const db = await getDb();
  const rows = await db.select<DesaAdat[]>(`SELECT * FROM desa_adat LIMIT 1`);
  return rows[0] ?? null;
}

export async function getDesaAdat(): Promise<DesaAdat | null> {
  if (!desaCache || Date.now() - desaCache.at > DESA_CACHE_TTL_MS) {
    const promise = loadDesaAdat();
    desaCache = { at: Date.now(), promise };
    promise.catch(() => {
      if (desaCache?.promise === promise) desaCache = null;
    });
  }
  const desa = await desaCache.promise;
  return desa ? { ...desa } : null;
}

export async function hasAnyKrama(): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(`SELECT COUNT(*) as c FROM krama`);
  return (rows[0]?.c ?? 0) > 0;
}

export function isDesaConfigured(desa: DesaAdat | null): boolean {
  if (!desa) return false;
  return !!(
    desa.kode_kabupaten?.length === 2 &&
    desa.kode_kecamatan?.length === 2 &&
    desa.kode_desa_adat?.length === 4 &&
    desa.nama_desa_adat
  );
}

export async function upsertDesaAdat(
  data: Omit<DesaAdat, "id"> & { id?: string }
): Promise<DesaAdat> {
  const db = await getDb();
  const existing = await getDesaAdat();
  const hasKrama = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama`
  );

  const nyadaUmur =
    data.jenis_umur_nyada != null && Number.isFinite(Number(data.jenis_umur_nyada))
      ? Number(data.jenis_umur_nyada)
      : null;
  const nyadaJenisId = data.jenis_krama_mipil_id?.trim() || null;

  if (existing && hasKrama[0]?.c > 0) {
    await db.execute(
      `UPDATE desa_adat SET
        nama_kabupaten = ?, nama_kecamatan = ?, nama_desa_adat = ?,
        logo_url = ?, logo_mda_url = ?, jenis_umur_nyada = ?, jenis_krama_mipil_id = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        data.nama_kabupaten,
        data.nama_kecamatan,
        data.nama_desa_adat,
        data.logo_url ?? null,
        data.logo_mda_url ?? null,
        Number.isFinite(nyadaUmur) ? nyadaUmur : null,
        nyadaJenisId,
        existing.id,
      ]
    );
    invalidateDesaAdatCache();
  return (await getDesaAdat())!;
  }

  const id = existing?.id ?? uuid();
  if (existing) {
    await db.execute(
      `UPDATE desa_adat SET
        kode_kabupaten = ?, nama_kabupaten = ?, kode_kecamatan = ?, nama_kecamatan = ?,
        kode_desa_adat = ?, nama_desa_adat = ?, logo_url = ?, logo_mda_url = ?,
        jenis_umur_nyada = ?, jenis_krama_mipil_id = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
      [
        data.kode_kabupaten,
        data.nama_kabupaten,
        data.kode_kecamatan,
        data.nama_kecamatan,
        data.kode_desa_adat,
        data.nama_desa_adat,
        data.logo_url ?? null,
        data.logo_mda_url ?? null,
        Number.isFinite(nyadaUmur) ? nyadaUmur : null,
        nyadaJenisId,
        id,
      ]
    );
  } else {
    await db.execute(
      `INSERT INTO desa_adat (
        id, kode_kabupaten, nama_kabupaten, kode_kecamatan, nama_kecamatan,
        kode_desa_adat, nama_desa_adat, logo_url, logo_mda_url, jenis_umur_nyada, jenis_krama_mipil_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.kode_kabupaten,
        data.nama_kabupaten,
        data.kode_kecamatan,
        data.nama_kecamatan,
        data.kode_desa_adat,
        data.nama_desa_adat,
        data.logo_url ?? null,
        data.logo_mda_url ?? null,
        Number.isFinite(nyadaUmur) ? nyadaUmur : null,
        nyadaJenisId,
      ]
    );
  }
  invalidateDesaAdatCache();
  return (await getDesaAdat())!;
}

function trimOrNull(value?: string): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export async function updatePrajuruDesaAdat(data: PrajuruDesaAdatInput): Promise<DesaAdat> {
  const existing = await getDesaAdat();
  if (!existing) {
    throw new Error("Konfigurasi desa adat belum ada. Lengkapi Pengaturan → Setup Wilayah terlebih dahulu.");
  }
  const db = await getDb();
  await db.execute(
    `UPDATE desa_adat SET
      bandesa_nama = ?, bandesa_jabatan = ?,
      bandesa_nik = ?,
      bandesa_ttd_url = ?, call_center = ?,
      panyarikan_nama = ?, panyarikan_jabatan = ?, panyarikan_ttd_url = ?,
      patengen_nama = ?, patengen_jabatan = ?,
      updated_at = datetime('now')
    WHERE id = ?`,
    [
      trimOrNull(data.bandesa_nama),
      trimOrNull(data.bandesa_jabatan),
      trimOrNull(data.bandesa_nik),
      trimOrNull(data.bandesa_ttd_url ?? undefined),
      trimOrNull(data.call_center ?? undefined),
      trimOrNull(data.panyarikan_nama),
      trimOrNull(data.panyarikan_jabatan),
      trimOrNull(data.panyarikan_ttd_url ?? undefined),
      trimOrNull(data.patengen_nama),
      trimOrNull(data.patengen_jabatan),
      existing.id,
    ]
  );
  invalidateDesaAdatCache();
  return (await getDesaAdat())!;
}

export type ProfilDesaAdatInput = PrajuruDesaAdatInput & {
  alamat_desa_adat?: string;
  logo_url?: string | null;
  logo_mda_url?: string | null;
  jenis_umur_nyada?: number | null;
  nyada_berlaku_mulai?: string | null;
  jenis_krama_mipil_id?: string | null;
  jenis_cerai_mati_mipil_id?: string | null;
  jenis_cerai_hidup_mipil_id?: string | null;
  krama_dapukan_aktif?: boolean;
  krama_dapukan_berlaku_mulai?: string | null;
  batas_umur_dapukan?: number | null;
  jenis_dapukan_mipil_id?: string | null;
  jenis_balu_dapukan_mipil_id?: string | null;
  jenis_balu_nglintik_mipil_id?: string | null;
  yowana_umur_min?: number | null;
  yowana_umur_max?: number | null;
  pararem_nomor?: string;
  pararem_tahun?: string;
  pararem_judul?: string;
};

function parseOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function trimIdOrNull(value?: string | null): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/** Logo, ketentuan nyada/luput, dan prajuru — dikelola di Master Data → Profil Desa. */
export async function updateProfilDesaAdat(data: ProfilDesaAdatInput): Promise<DesaAdat> {
  const existing = await getDesaAdat();
  if (!existing) {
    throw new Error("Konfigurasi desa adat belum ada. Lengkapi Pengaturan → Setup Wilayah terlebih dahulu.");
  }

  const nyadaUmur = parseOptionalInt(data.jenis_umur_nyada);
  const nyadaBerlakuMulai = parseIsoDateString(data.nyada_berlaku_mulai);
  const nyadaJenisId = trimIdOrNull(data.jenis_krama_mipil_id);
  const ceraiMatiId = trimIdOrNull(data.jenis_cerai_mati_mipil_id);
  const ceraiHidupId = trimIdOrNull(data.jenis_cerai_hidup_mipil_id);
  const yowanaMin = parseOptionalInt(data.yowana_umur_min);
  const yowanaMax = parseOptionalInt(data.yowana_umur_max);

  const dapukanAktif = !!data.krama_dapukan_aktif;
  const dapukanMulai = parseIsoDateString(data.krama_dapukan_berlaku_mulai);
  const dapukanUmur = parseOptionalInt(data.batas_umur_dapukan);
  const dapukanJenisId = trimIdOrNull(data.jenis_dapukan_mipil_id);
  const baluDapukanJenisId = trimIdOrNull(data.jenis_balu_dapukan_mipil_id);
  const nglintikJenisId = trimIdOrNull(data.jenis_balu_nglintik_mipil_id);
  if (dapukanAktif) {
    if (!dapukanMulai) throw new Error("Isi tanggal mulai Krama Dapukan");
    if (!dapukanJenisId) throw new Error("Pilih Jenis Krama Dapukan");
    if (!nyadaBerlakuMulai || nyadaUmur == null || !nyadaJenisId) {
      throw new Error("Krama Dapukan memerlukan Nyada otomatis (batas umur, tanggal mulai, dan jenis Nyada)");
    }
    if (dapukanUmur != null && dapukanUmur <= nyadaUmur) {
      throw new Error("Batas umur Krama Dapukan harus lebih besar dari batas umur Nyada");
    }
  }
  const jenisDapukanDipakai = [dapukanJenisId, baluDapukanJenisId, nglintikJenisId].filter(Boolean);
  if (
    (nyadaJenisId && jenisDapukanDipakai.includes(nyadaJenisId)) ||
    new Set(jenisDapukanDipakai).size !== jenisDapukanDipakai.length
  ) {
    throw new Error("Jenis Nyada, Dapukan, Balu Dapukan, dan Balu Nglintik harus berbeda");
  }

  const db = await getDb();
  await db.execute(
    `UPDATE desa_adat SET
      logo_url = ?, logo_mda_url = ?,
      alamat_desa_adat = ?,
      jenis_umur_nyada = ?, nyada_berlaku_mulai = ?, jenis_krama_mipil_id = ?,
      jenis_cerai_mati_mipil_id = ?, jenis_cerai_hidup_mipil_id = ?,
      krama_dapukan_aktif = ?, krama_dapukan_berlaku_mulai = ?, batas_umur_dapukan = ?,
      jenis_dapukan_mipil_id = ?, jenis_balu_dapukan_mipil_id = ?, jenis_balu_nglintik_mipil_id = ?,
      yowana_umur_min = ?, yowana_umur_max = ?,
      pararem_nomor = ?, pararem_tahun = ?, pararem_judul = ?,
      bandesa_nama = ?, bandesa_jabatan = ?,
      bandesa_nik = ?,
      bandesa_ttd_url = ?, call_center = ?,
      panyarikan_nama = ?, panyarikan_jabatan = ?, panyarikan_ttd_url = ?,
      patengen_nama = ?, patengen_jabatan = ?,
      updated_at = datetime('now')
    WHERE id = ?`,
    [
      trimOrNull(data.logo_url ?? undefined),
      trimOrNull(data.logo_mda_url ?? undefined),
      trimOrNull(data.alamat_desa_adat),
      nyadaUmur,
      nyadaBerlakuMulai,
      nyadaJenisId,
      ceraiMatiId,
      ceraiHidupId,
      dapukanAktif ? 1 : 0,
      dapukanMulai,
      dapukanUmur,
      dapukanJenisId,
      baluDapukanJenisId,
      nglintikJenisId,
      yowanaMin,
      yowanaMax,
      trimOrNull(data.pararem_nomor),
      trimOrNull(data.pararem_tahun),
      trimOrNull(data.pararem_judul),
      trimOrNull(data.bandesa_nama),
      trimOrNull(data.bandesa_jabatan),
      trimOrNull(data.bandesa_nik),
      trimOrNull(data.bandesa_ttd_url ?? undefined),
      trimOrNull(data.call_center ?? undefined),
      trimOrNull(data.panyarikan_nama),
      trimOrNull(data.panyarikan_jabatan),
      trimOrNull(data.panyarikan_ttd_url ?? undefined),
      trimOrNull(data.patengen_nama),
      trimOrNull(data.patengen_jabatan),
      existing.id,
    ]
  );
  invalidateDesaAdatCache();
  return (await getDesaAdat())!;
}
