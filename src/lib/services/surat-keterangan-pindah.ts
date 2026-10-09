import { getDb } from "../db/client";
import { allocateNomorSuratKeteranganPindah } from "../penomoran-skp";
import { normalizeKramaStatus } from "../krama-status";
import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../types";
import {
  formatJenisKelamin,
  formatTanggalLahir,
  formatTempatTanggalLahir,
  hitungUmur,
  today,
  uuid,
} from "../utils";
import { getDesaAdat } from "./desa";
import { getKramaDetail } from "./krama";
import { resolveAnggotaKrama } from "./surat-keterangan-krama";

export type SkpJenis = "keluarga" | "anggota";

export type SuratKeteranganPindahRow = {
  id: string;
  krama_id: string;
  anggota_id: string | null;
  jenis: SkpJenis;
  nomor_surat: string;
  tahun: number;
  bulan_terbit: number;
  tanggal_terbit: string;
  snapshot_json: string;
  created_at: string;
};

export type SuratKeteranganPindahSnapshot = {
  jenis: SkpJenis;
  nama_subjek: string;
  tempat_lahir: string;
  tanggal_lahir: string;
  jenis_kelamin: string;
  umur: string;
  pekerjaan: string;
  alamat: string;
  tempek_nama: string;
  banjar_nama: string;
  nama_desa_adat: string;
  kecamatan_asal: string;
  kabupaten_asal: string;
  pipil_nomor?: string;
  nika?: string;
  pengarep_nama?: string;
  anggota_aktif?: {
    nama: string;
    nika: string;
    status_keluarga: string;
  }[];
  alamat_tujuan: string;
  desa_adat_tujuan: string;
  kecamatan_tujuan: string;
  kabupaten_tujuan: string;
  provinsi_tujuan: string;
  alasan_pindah: string;
  bandesa_nama: string;
  bandesa_jabatan: string;
  bandesa_nik: string;
  tampilkan_ttd_bandesa?: boolean;
  /** Metadata alur keluar Pipil intra desa (opsional). */
  jenis_alur?: "keluar_saja" | "pecah" | "gabung";
  krama_tujuan_id?: string;
  krama_tujuan_nomor?: string;
  status_keluarga_di_tujuan?: string;
};

export type SkpSnapshotMeta = Pick<
  SuratKeteranganPindahSnapshot,
  "jenis_alur" | "krama_tujuan_id" | "krama_tujuan_nomor" | "status_keluarga_di_tujuan"
>;

export type SuratKeteranganPindahListRow = SuratKeteranganPindahRow & {
  nomor_kartu: string;
  nama_subjek: string;
  banjar_nama: string;
};

export type SuratKeteranganPindahFilter = {
  q?: string;
  jenis?: SkpJenis;
  banjarId?: string;
  tanggalDari?: string;
  tanggalSampai?: string;
};

export type SkpTujuanInput = {
  alamatTujuan: string;
  desaAdatTujuan: string;
  kecamatanTujuan: string;
  kabupatenTujuan: string;
  provinsiTujuan: string;
  alasanPindah: string;
};

function parseTanggalIso(tanggal: string): string {
  const t = tanggal.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error("Tanggal terbit tidak valid");
  return t;
}

export function assertDesaSiapSuratKeteranganPindah(desa: DesaAdat | null): void {
  if (!desa?.kode_desa_adat?.trim() || desa.kode_desa_adat.trim().length !== 4) {
    throw new Error("Kode desa adat belum lengkap. Lengkapi di Pengaturan → Setup Wilayah.");
  }
  if (!desa.bandesa_nama?.trim()) {
    throw new Error("Nama Bandesa belum diisi. Lengkapi di Master Data → Profil Desa Adat.");
  }
  const nik = desa.bandesa_nik?.trim() || "";
  if (!/^\d{16}$/.test(nik)) {
    throw new Error("NIK Bandesa wajib 16 digit. Lengkapi di Master Data → Profil Desa Adat.");
  }
}

function assertTujuan(input: SkpTujuanInput): void {
  if (!input.desaAdatTujuan.trim()) throw new Error("Desa adat tujuan wajib diisi.");
  if (!input.alamatTujuan.trim()) throw new Error("Alamat tujuan wajib diisi.");
  if (!input.kecamatanTujuan.trim()) throw new Error("Kecamatan tujuan wajib diisi.");
  if (!input.kabupatenTujuan.trim()) throw new Error("Kabupaten tujuan wajib diisi.");
  if (!input.provinsiTujuan.trim()) throw new Error("Provinsi tujuan wajib diisi.");
  if (!input.alasanPindah.trim()) throw new Error("Alasan pindah wajib diisi.");
}

function subjekFromPenduduk(p: {
  nama_lengkap: string;
  tempat_lahir?: string | null;
  tanggal_lahir?: string | null;
  jenis_kelamin: string;
  pekerjaan?: string | null;
}): Pick<
  SuratKeteranganPindahSnapshot,
  "nama_subjek" | "tempat_lahir" | "tanggal_lahir" | "jenis_kelamin" | "umur" | "pekerjaan"
> {
  const umur = hitungUmur(p.tanggal_lahir);
  return {
    nama_subjek: p.nama_lengkap,
    tempat_lahir: p.tempat_lahir?.trim() || "—",
    tanggal_lahir: formatTanggalLahir(p.tanggal_lahir) || "—",
    jenis_kelamin: formatJenisKelamin(p.jenis_kelamin) || "—",
    umur: umur != null ? String(umur) : "—",
    pekerjaan: p.pekerjaan?.trim() || "—",
  };
}

function buildSnapshotBase(
  krama: KramaDetail,
  desa: DesaAdat,
  tujuan: SkpTujuanInput,
  tampilkanTtdBandesa: boolean
): Omit<SuratKeteranganPindahSnapshot, "jenis" | "pipil_nomor" | "nika" | "pengarep_nama" | "anggota_aktif"> {
  return {
    alamat: krama.alamat?.trim() || "—",
    tempek_nama: krama.tempek_nama?.trim() || "—",
    banjar_nama: krama.banjar_nama?.trim() || "—",
    nama_desa_adat: desa.nama_desa_adat?.trim() || "—",
    kecamatan_asal: desa.nama_kecamatan?.trim() || "—",
    kabupaten_asal: desa.nama_kabupaten?.trim() || "—",
    alamat_tujuan: tujuan.alamatTujuan.trim(),
    desa_adat_tujuan: tujuan.desaAdatTujuan.trim(),
    kecamatan_tujuan: tujuan.kecamatanTujuan.trim(),
    kabupaten_tujuan: tujuan.kabupatenTujuan.trim(),
    provinsi_tujuan: tujuan.provinsiTujuan.trim(),
    alasan_pindah: tujuan.alasanPindah.trim(),
    bandesa_nama: desa.bandesa_nama?.trim() || "",
    bandesa_jabatan: desa.bandesa_jabatan?.trim() || "Bandesa Adat",
    bandesa_nik: desa.bandesa_nik?.trim() || "",
    tampilkan_ttd_bandesa: tampilkanTtdBandesa,
    nama_subjek: "",
    tempat_lahir: "",
    tanggal_lahir: "",
    jenis_kelamin: "",
    umur: "",
    pekerjaan: "",
  };
}

function buildSnapshotKeluarga(
  krama: KramaDetail,
  desa: DesaAdat,
  tujuan: SkpTujuanInput,
  tampilkanTtdBandesa: boolean
): SuratKeteranganPindahSnapshot {
  const base = buildSnapshotBase(krama, desa, tujuan, tampilkanTtdBandesa);
  const subjek = subjekFromPenduduk(krama.kepala);
  return {
    ...base,
    ...subjek,
    jenis: "keluarga",
    pipil_nomor: krama.nomor_kartu,
    pengarep_nama: krama.kepala.nama_lengkap,
    anggota_aktif: krama.anggota_aktif.map((a) => ({
      nama: a.nama_lengkap,
      nika: a.nika?.trim() || "—",
      status_keluarga: a.status_keluarga,
    })),
  };
}

function buildSnapshotAnggota(
  krama: KramaDetail,
  anggota: AnggotaKeluarga,
  desa: DesaAdat,
  tujuan: SkpTujuanInput,
  tampilkanTtdBandesa: boolean,
  meta?: SkpSnapshotMeta
): SuratKeteranganPindahSnapshot {
  const base = buildSnapshotBase(krama, desa, tujuan, tampilkanTtdBandesa);
  const subjek = subjekFromPenduduk(anggota);
  const nika = anggota.nika?.trim();
  if (!nika) throw new Error(`NIKA ${anggota.nama_lengkap} belum terisi.`);
  return {
    ...base,
    ...subjek,
    jenis: "anggota",
    nika,
    pengarep_nama: krama.kepala.nama_lengkap,
    ...meta,
  };
}

export function buildSkpPernyataan(snapshot: SuratKeteranganPindahSnapshot): string {
  const tujuanParts = [
    snapshot.alamat_tujuan,
    `Desa Adat ${snapshot.desa_adat_tujuan}`,
    `Kecamatan ${snapshot.kecamatan_tujuan}`,
    `Kabupaten ${snapshot.kabupaten_tujuan}`,
    `Provinsi ${snapshot.provinsi_tujuan}`,
  ];
  const tujuanText = tujuanParts.join(", ");
  const bersamaKeluarga = snapshot.jenis === "keluarga" ? " bersama keluarga" : "";
  return `Memang benar yang bersangkutan${bersamaKeluarga} telah mengajukan pindah alamat ke ${tujuanText} karena ${snapshot.alasan_pindah}.`;
}

export function formatSkpAlamatBaris(snapshot: SuratKeteranganPindahSnapshot): string {
  const parts: string[] = [];
  if (snapshot.alamat && snapshot.alamat !== "—") parts.push(snapshot.alamat);
  if (snapshot.tempek_nama && snapshot.tempek_nama !== "—") {
    parts.push(`Tempek ${snapshot.tempek_nama}`);
  }
  if (snapshot.banjar_nama && snapshot.banjar_nama !== "—") {
    parts.push(`Banjar Adat ${snapshot.banjar_nama}`);
  }
  parts.push(`Desa Adat ${snapshot.nama_desa_adat}`);
  return parts.join(", ");
}

export function parseSkpSnapshot(json: string): SuratKeteranganPindahSnapshot {
  const raw = JSON.parse(json) as SuratKeteranganPindahSnapshot;
  return {
    ...raw,
    tampilkan_ttd_bandesa: raw.tampilkan_ttd_bandesa !== false,
  };
}

async function insertSurat(
  kramaId: string,
  anggotaId: string | null,
  jenis: SkpJenis,
  tanggalTerbit: string,
  snapshot: SuratKeteranganPindahSnapshot,
  desaId: string
): Promise<SuratKeteranganPindahRow> {
  const nomorSurat = await allocateNomorSuratKeteranganPindah(desaId, tanggalTerbit);
  const tahun = new Date(tanggalTerbit).getFullYear();
  const bulanTerbit = new Date(tanggalTerbit).getMonth() + 1;
  const id = uuid();
  const db = await getDb();
  await db.execute(
    `INSERT INTO surat_keterangan_pindah (
      id, krama_id, anggota_id, jenis, nomor_surat, tahun, bulan_terbit, tanggal_terbit, snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, kramaId, anggotaId, jenis, nomorSurat, tahun, bulanTerbit, tanggalTerbit, JSON.stringify(snapshot)]
  );
  const surat = await getSuratKeteranganPindahById(id);
  if (!surat) throw new Error("Gagal menyimpan surat keterangan pindah.");
  return surat;
}

export async function issueSkpKeluarga(
  kramaId: string,
  input: {
    tanggalTerbit?: string;
    tujuan: SkpTujuanInput;
    tampilkanTtdBandesa?: boolean;
  }
): Promise<{ surat: SuratKeteranganPindahRow; krama: KramaDetail }> {
  const desa = await getDesaAdat();
  assertDesaSiapSuratKeteranganPindah(desa);
  if (!desa) throw new Error("Data desa adat belum ada.");

  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan.");
  if (krama.klasifikasi_kode !== "MIPIL") {
    throw new Error("Surat Keterangan Pindah hanya untuk Krama Mipil.");
  }
  if (normalizeKramaStatus(krama.status_krama) !== "aktif") {
    throw new Error("Krama tidak aktif — SKP keluarga hanya untuk krama aktif.");
  }
  if (!krama.anggota_aktif.length) {
    throw new Error("Tidak ada anggota aktif pada krama ini.");
  }
  if (!krama.banjar_nama?.trim()) throw new Error("Banjar krama belum terisi.");
  assertTujuan(input.tujuan);

  const tanggalTerbit = parseTanggalIso(input.tanggalTerbit ?? today());
  const tampilkanTtd = input.tampilkanTtdBandesa !== false;
  const snapshot = buildSnapshotKeluarga(krama, desa, input.tujuan, tampilkanTtd);
  const surat = await insertSurat(kramaId, null, "keluarga", tanggalTerbit, snapshot, desa.id);
  return { surat, krama };
}

export async function issueSkpAnggota(
  kramaId: string,
  input: {
    anggotaId: string;
    tanggalTerbit?: string;
    tujuan: SkpTujuanInput;
    tampilkanTtdBandesa?: boolean;
    snapshotMeta?: SkpSnapshotMeta;
  }
): Promise<{ surat: SuratKeteranganPindahRow; krama: KramaDetail }> {
  const desa = await getDesaAdat();
  assertDesaSiapSuratKeteranganPindah(desa);
  if (!desa) throw new Error("Data desa adat belum ada.");

  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan.");
  if (krama.klasifikasi_kode !== "MIPIL") {
    throw new Error("Surat Keterangan Pindah hanya untuk Krama Mipil.");
  }
  if (normalizeKramaStatus(krama.status_krama) !== "aktif") {
    throw new Error("Krama tidak aktif.");
  }

  const anggota = resolveAnggotaKrama(krama, input.anggotaId);
  assertTujuan(input.tujuan);

  const tanggalTerbit = parseTanggalIso(input.tanggalTerbit ?? today());
  const tampilkanTtd = input.tampilkanTtdBandesa !== false;
  const snapshot = buildSnapshotAnggota(
    krama,
    anggota,
    desa,
    input.tujuan,
    tampilkanTtd,
    input.snapshotMeta
  );
  const surat = await insertSurat(
    kramaId,
    anggota.anggota_id,
    "anggota",
    tanggalTerbit,
    snapshot,
    desa.id
  );
  return { surat, krama };
}

/** Prefill tujuan SKP intra desa dari data desa adat. */
export function skpTujuanIntraDesaFromDesa(
  desa: DesaAdat,
  alamatTujuan: string,
  alasanPindah: string
): SkpTujuanInput {
  return {
    alamatTujuan,
    desaAdatTujuan: desa.nama_desa_adat?.trim() || "",
    kecamatanTujuan: desa.nama_kecamatan?.trim() || "",
    kabupatenTujuan: desa.nama_kabupaten?.trim() || "",
    provinsiTujuan: "",
    alasanPindah,
  };
}

/** Prefill tujuan SKP dari kartu Mipil tujuan. */
export function skpTujuanFromKramaTujuan(
  desa: DesaAdat,
  target: KramaDetail,
  alasanPindah: string
): SkpTujuanInput {
  return skpTujuanIntraDesaFromDesa(
    desa,
    target.alamat?.trim() || "—",
    alasanPindah
  );
}

export async function getSuratKeteranganPindahById(
  id: string
): Promise<SuratKeteranganPindahRow | null> {
  const db = await getDb();
  const rows = await db.select<SuratKeteranganPindahRow[]>(
    `SELECT * FROM surat_keterangan_pindah WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listSuratKeteranganPindah(
  filter?: SuratKeteranganPindahFilter
): Promise<SuratKeteranganPindahListRow[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter?.jenis) {
    clauses.push("s.jenis = ?");
    params.push(filter.jenis);
  }
  if (filter?.banjarId) {
    clauses.push("k.banjar_id = ?");
    params.push(filter.banjarId);
  }
  if (filter?.tanggalDari) {
    clauses.push("s.tanggal_terbit >= ?");
    params.push(filter.tanggalDari.trim().slice(0, 10));
  }
  if (filter?.tanggalSampai) {
    clauses.push("s.tanggal_terbit <= ?");
    params.push(filter.tanggalSampai.trim().slice(0, 10));
  }
  if (filter?.q?.trim()) {
    const q = `%${filter.q.trim()}%`;
    clauses.push(
      `(json_extract(s.snapshot_json, '$.nama_subjek') LIKE ?
        OR s.nomor_surat LIKE ? OR k.nomor_kartu LIKE ?)`
    );
    params.push(q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return db.select<SuratKeteranganPindahListRow[]>(
    `SELECT s.*,
            k.nomor_kartu,
            json_extract(s.snapshot_json, '$.nama_subjek') as nama_subjek,
            b.nama as banjar_nama
     FROM surat_keterangan_pindah s
     JOIN krama k ON k.id = s.krama_id
     JOIN banjar b ON b.id = k.banjar_id
     ${where}
     ORDER BY s.tanggal_terbit DESC, s.created_at DESC`,
    params
  );
}

export async function listSkpByKramaId(kramaId: string): Promise<SuratKeteranganPindahRow[]> {
  const db = await getDb();
  return db.select<SuratKeteranganPindahRow[]>(
    `SELECT * FROM surat_keterangan_pindah WHERE krama_id = ? ORDER BY tanggal_terbit DESC`,
    [kramaId]
  );
}

export async function updateSuratKeteranganPindah(
  id: string,
  input: {
    tanggalTerbit: string;
    tujuan: SkpTujuanInput;
    tampilkanTtdBandesa?: boolean;
  }
): Promise<SuratKeteranganPindahRow> {
  const existing = await getSuratKeteranganPindahById(id);
  if (!existing) throw new Error("Surat keterangan pindah tidak ditemukan.");

  assertTujuan(input.tujuan);
  const tanggalTerbit = parseTanggalIso(input.tanggalTerbit);
  const tahun = new Date(tanggalTerbit).getFullYear();
  const bulanTerbit = new Date(tanggalTerbit).getMonth() + 1;

  const snapshot = parseSkpSnapshot(existing.snapshot_json);
  snapshot.alamat_tujuan = input.tujuan.alamatTujuan.trim();
  snapshot.desa_adat_tujuan = input.tujuan.desaAdatTujuan.trim();
  snapshot.kecamatan_tujuan = input.tujuan.kecamatanTujuan.trim();
  snapshot.kabupaten_tujuan = input.tujuan.kabupatenTujuan.trim();
  snapshot.provinsi_tujuan = input.tujuan.provinsiTujuan.trim();
  snapshot.alasan_pindah = input.tujuan.alasanPindah.trim();
  snapshot.tampilkan_ttd_bandesa = input.tampilkanTtdBandesa !== false;

  const db = await getDb();
  await db.execute(
    `UPDATE surat_keterangan_pindah SET
      tahun = ?, bulan_terbit = ?, tanggal_terbit = ?, snapshot_json = ?
     WHERE id = ?`,
    [tahun, bulanTerbit, tanggalTerbit, JSON.stringify(snapshot), id]
  );

  const updated = await getSuratKeteranganPindahById(id);
  if (!updated) throw new Error("Gagal memperbarui surat keterangan pindah.");
  return updated;
}

export async function deleteSuratKeteranganPindah(id: string): Promise<void> {
  const existing = await getSuratKeteranganPindahById(id);
  if (!existing) throw new Error("Surat keterangan pindah tidak ditemukan.");
  const db = await getDb();
  await db.execute(`DELETE FROM surat_keterangan_pindah WHERE id = ?`, [id]);
}

/** Subjek TTL untuk pratinjau dialog */
export function skpSubjekTtlLabel(anggota: {
  tempat_lahir?: string | null;
  tanggal_lahir?: string | null;
}): string {
  return formatTempatTanggalLahir(anggota.tempat_lahir, anggota.tanggal_lahir) || "—";
}
