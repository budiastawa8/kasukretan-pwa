import { getDb } from "../db/client";
import { kartuNikAnggota } from "../kartu-krama-utils";
import { allocateNomorSuratKeteranganKrama } from "../penomoran-skk";
import type { AnggotaKeluarga, DesaAdat, KlasifikasiKode, KramaDetail } from "../types";
import { today, uuid } from "../utils";
import { normalizeKramaStatus } from "../krama-status";
import { getDesaAdat } from "./desa";
import { getKramaDetail } from "./krama";

export type SuratKeteranganKramaRow = {
  id: string;
  krama_id: string;
  anggota_id: string | null;
  nomor_surat: string;
  tahun: number;
  bulan_terbit: number;
  tanggal_terbit: string;
  tujuan: string;
  snapshot_json: string;
  created_at: string;
};

export type SuratKeteranganKramaSnapshot = {
  nama_anggota: string;
  /** Arsip lama sebelum dukungan semua anggota */
  kepala_nama?: string;
  identitas_label: "NIKA" | "NIK/NIKA";
  identitas_nilai: string;
  alamat_lengkap: string;
  jenis_nama: string;
  klasifikasi_nama: string;
  /** Arsip lama mungkin belum menyimpan kode klasifikasi */
  klasifikasi_kode?: KlasifikasiKode;
  banjar_nama: string;
  nomor_kartu: string;
  bandesa_nama: string;
  bandesa_jabatan: string;
  bandesa_nik: string;
  nama_desa_adat: string;
  tujuan: string;
  /** Tampilkan gambar tanda tangan Bandesa di blok penutup */
  tampilkan_ttd_bandesa?: boolean;
};

export type SuratKeteranganKramaListRow = SuratKeteranganKramaRow & {
  nama_anggota: string;
  banjar_nama: string;
  klasifikasi_nama: string;
  klasifikasi_kode: KlasifikasiKode;
  nomor_kartu: string;
};

export type SuratKeteranganKramaFilter = {
  q?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  tanggalDari?: string;
  tanggalSampai?: string;
};

function parseTanggalIso(tanggal: string): string {
  const t = tanggal.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error("Tanggal terbit tidak valid");
  return t;
}

export function assertDesaSiapSuratKeteranganKrama(desa: DesaAdat | null): void {
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

export function suratKeteranganIdentitasAnggota(
  klasifikasiKode: KlasifikasiKode,
  anggota: AnggotaKeluarga
): { label: "NIKA" | "NIK/NIKA"; nilai: string } {
  if (klasifikasiKode === "MIPIL") {
    return { label: "NIKA", nilai: anggota.nika?.trim() || "" };
  }
  return { label: "NIK/NIKA", nilai: kartuNikAnggota(anggota) };
}

/** @deprecated Gunakan suratKeteranganIdentitasAnggota dengan anggota terpilih */
export function suratKeteranganIdentitasKrama(
  krama: KramaDetail
): { label: "NIKA" | "NIK/NIKA"; nilai: string } {
  const anggota = resolveAnggotaKrama(krama, defaultAnggotaId(krama));
  return suratKeteranganIdentitasAnggota(krama.klasifikasi_kode, anggota);
}

export function defaultAnggotaId(krama: KramaDetail): string {
  const kepala = krama.anggota_aktif.find((a) => a.penduduk_id === krama.kepala.id);
  return kepala?.anggota_id ?? krama.anggota_aktif[0]?.anggota_id ?? "";
}

export function resolveAnggotaKrama(krama: KramaDetail, anggotaId: string): AnggotaKeluarga {
  const id = anggotaId.trim();
  if (!id) throw new Error("Pilih anggota krama untuk surat keterangan.");
  const anggota = krama.anggota_aktif.find((a) => a.anggota_id === id);
  if (!anggota) throw new Error("Anggota krama tidak ditemukan atau tidak aktif.");
  return anggota;
}

export function formatAlamatSuratKeteranganKrama(krama: KramaDetail, desa: DesaAdat): string {
  const parts: string[] = [];
  if (krama.alamat?.trim()) parts.push(krama.alamat.trim());
  if (krama.tempek_nama?.trim()) parts.push(`Tempek ${krama.tempek_nama.trim()}`);
  if (krama.banjar_nama?.trim()) parts.push(`Banjar Adat ${krama.banjar_nama.trim()}`);
  const desaNama = desa.nama_desa_adat?.trim();
  if (desaNama) parts.push(`Desa Adat ${desaNama}`);
  return parts.join(", ");
}

function assertAnggotaSiapSuratKeterangan(
  krama: KramaDetail,
  anggota: AnggotaKeluarga,
  desa: DesaAdat,
  tujuan: string
): void {
  if (normalizeKramaStatus(krama.status_krama) !== "aktif") {
    throw new Error("Krama tidak aktif — surat keterangan hanya untuk krama aktif.");
  }
  const tujuanTrim = tujuan.trim();
  if (!tujuanTrim) throw new Error("Tujuan surat wajib diisi.");

  const identitas = suratKeteranganIdentitasAnggota(krama.klasifikasi_kode, anggota);
  if (!identitas.nilai) {
    throw new Error(
      krama.klasifikasi_kode === "MIPIL"
        ? `NIKA ${anggota.nama_lengkap} belum terisi.`
        : `NIK/NIKA ${anggota.nama_lengkap} belum terisi.`
    );
  }

  if (!krama.banjar_nama?.trim()) {
    throw new Error("Banjar krama belum terisi.");
  }
  if (!desa.nama_desa_adat?.trim()) {
    throw new Error("Nama desa adat belum lengkap.");
  }
}

function buildSnapshot(
  krama: KramaDetail,
  anggota: AnggotaKeluarga,
  desa: DesaAdat,
  tujuan: string,
  tampilkanTtdBandesa: boolean
): SuratKeteranganKramaSnapshot {
  const identitas = suratKeteranganIdentitasAnggota(krama.klasifikasi_kode, anggota);
  return {
    nama_anggota: anggota.nama_lengkap,
    identitas_label: identitas.label,
    identitas_nilai: identitas.nilai,
    alamat_lengkap: formatAlamatSuratKeteranganKrama(krama, desa),
    jenis_nama: krama.jenis_nama?.trim() || krama.klasifikasi_nama,
    klasifikasi_nama: krama.klasifikasi_nama,
    klasifikasi_kode: krama.klasifikasi_kode,
    banjar_nama: krama.banjar_nama,
    nomor_kartu: krama.nomor_kartu,
    bandesa_nama: desa.bandesa_nama?.trim() || "",
    bandesa_jabatan: desa.bandesa_jabatan?.trim() || "Bandesa Adat",
    bandesa_nik: desa.bandesa_nik?.trim() || "",
    nama_desa_adat: desa.nama_desa_adat?.trim() || "",
    tujuan: tujuan.trim(),
    tampilkan_ttd_bandesa: tampilkanTtdBandesa,
  };
}

export async function issueSuratKeteranganKrama(
  kramaId: string,
  input: {
    anggotaId: string;
    tanggalTerbit?: string;
    tujuan: string;
    tampilkanTtdBandesa?: boolean;
  }
): Promise<{ surat: SuratKeteranganKramaRow; krama: KramaDetail }> {
  const desa = await getDesaAdat();
  assertDesaSiapSuratKeteranganKrama(desa);
  if (!desa) throw new Error("Data desa adat belum ada.");

  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan.");
  if (!krama.anggota_aktif.length) {
    throw new Error("Tidak ada anggota aktif pada krama ini.");
  }

  const anggota = resolveAnggotaKrama(krama, input.anggotaId);
  assertAnggotaSiapSuratKeterangan(krama, anggota, desa, input.tujuan);

  const tanggalTerbit = parseTanggalIso(input.tanggalTerbit ?? today());
  const tahun = new Date(tanggalTerbit).getFullYear();
  const bulanTerbit = new Date(tanggalTerbit).getMonth() + 1;
  const nomorSurat = await allocateNomorSuratKeteranganKrama(desa.id, tanggalTerbit);
  const tampilkanTtdBandesa = input.tampilkanTtdBandesa !== false;
  const snapshot = buildSnapshot(krama, anggota, desa, input.tujuan, tampilkanTtdBandesa);
  const id = uuid();

  const db = await getDb();
  await db.execute(
    `INSERT INTO surat_keterangan_krama (
      id, krama_id, anggota_id, nomor_surat, tahun, bulan_terbit, tanggal_terbit, tujuan, snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      kramaId,
      anggota.anggota_id,
      nomorSurat,
      tahun,
      bulanTerbit,
      tanggalTerbit,
      snapshot.tujuan,
      JSON.stringify(snapshot),
    ]
  );

  const surat = await getSuratKeteranganById(id);
  if (!surat) throw new Error("Gagal menyimpan surat keterangan krama.");
  return { surat, krama };
}

export async function getSuratKeteranganById(id: string): Promise<SuratKeteranganKramaRow | null> {
  const db = await getDb();
  const rows = await db.select<SuratKeteranganKramaRow[]>(
    `SELECT * FROM surat_keterangan_krama WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function listSuratKeteranganKrama(
  filter?: SuratKeteranganKramaFilter
): Promise<SuratKeteranganKramaListRow[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter?.banjarId) {
    clauses.push("k.banjar_id = ?");
    params.push(filter.banjarId);
  }
  if (filter?.klasifikasi) {
    clauses.push("kk.kode = ?");
    params.push(filter.klasifikasi);
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
      `(COALESCE(json_extract(s.snapshot_json, '$.nama_anggota'), json_extract(s.snapshot_json, '$.kepala_nama'), pa.nama_lengkap, p.nama_lengkap) LIKE ?
        OR s.nomor_surat LIKE ? OR k.nomor_kartu LIKE ? OR s.tujuan LIKE ?)`
    );
    params.push(q, q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return db.select<SuratKeteranganKramaListRow[]>(
    `SELECT s.*,
            COALESCE(
              json_extract(s.snapshot_json, '$.nama_anggota'),
              json_extract(s.snapshot_json, '$.kepala_nama'),
              pa.nama_lengkap,
              p.nama_lengkap
            ) as nama_anggota,
            b.nama as banjar_nama,
            kk.nama_tampilan as klasifikasi_nama,
            kk.kode as klasifikasi_kode,
            k.nomor_kartu
     FROM surat_keterangan_krama s
     JOIN krama k ON k.id = s.krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     LEFT JOIN anggota_keluarga ak ON ak.id = s.anggota_id
     LEFT JOIN penduduk pa ON pa.id = ak.penduduk_id
     JOIN banjar b ON b.id = k.banjar_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     ${where}
     ORDER BY s.tanggal_terbit DESC, s.created_at DESC`,
    params
  );
}

export function parseSuratKeteranganSnapshot(json: string): SuratKeteranganKramaSnapshot {
  const raw = JSON.parse(json) as SuratKeteranganKramaSnapshot;
  const snapshot: SuratKeteranganKramaSnapshot = {
    ...raw,
    tampilkan_ttd_bandesa: raw.tampilkan_ttd_bandesa !== false,
  };
  if (!snapshot.nama_anggota && snapshot.kepala_nama) {
    return { ...snapshot, nama_anggota: snapshot.kepala_nama };
  }
  return snapshot;
}

export async function updateSuratKeteranganKrama(
  id: string,
  input: {
    tanggalTerbit: string;
    tujuan: string;
    tampilkanTtdBandesa?: boolean;
  }
): Promise<SuratKeteranganKramaRow> {
  const existing = await getSuratKeteranganById(id);
  if (!existing) throw new Error("Surat keterangan krama tidak ditemukan.");

  const tanggalTerbit = parseTanggalIso(input.tanggalTerbit);
  const tujuan = input.tujuan.trim();
  if (!tujuan) throw new Error("Tujuan surat wajib diisi.");

  const tahun = new Date(tanggalTerbit).getFullYear();
  const bulanTerbit = new Date(tanggalTerbit).getMonth() + 1;
  const snapshot = parseSuratKeteranganSnapshot(existing.snapshot_json);
  snapshot.tujuan = tujuan;
  snapshot.tampilkan_ttd_bandesa = input.tampilkanTtdBandesa !== false;

  const db = await getDb();
  await db.execute(
    `UPDATE surat_keterangan_krama SET
      tahun = ?, bulan_terbit = ?, tanggal_terbit = ?, tujuan = ?, snapshot_json = ?
     WHERE id = ?`,
    [tahun, bulanTerbit, tanggalTerbit, tujuan, JSON.stringify(snapshot), id]
  );

  const updated = await getSuratKeteranganById(id);
  if (!updated) throw new Error("Gagal memperbarui surat keterangan krama.");
  return updated;
}

export async function deleteSuratKeteranganKrama(id: string): Promise<void> {
  const existing = await getSuratKeteranganById(id);
  if (!existing) throw new Error("Surat keterangan krama tidak ditemukan.");
  const db = await getDb();
  await db.execute(`DELETE FROM surat_keterangan_krama WHERE id = ?`, [id]);
}

export function snapshotNamaAnggota(snapshot: SuratKeteranganKramaSnapshot): string {
  return snapshot.nama_anggota?.trim() || snapshot.kepala_nama?.trim() || "";
}

function suratKeteranganNomorKartuLabel(
  snapshot: Pick<SuratKeteranganKramaSnapshot, "klasifikasi_kode" | "klasifikasi_nama">
): string {
  if (snapshot.klasifikasi_kode === "MIPIL") return "Pipil";
  if (snapshot.klasifikasi_kode === "KRAMA_TAMIU" || snapshot.klasifikasi_kode === "TAMIU") {
    return "Pemasih";
  }
  const nama = snapshot.klasifikasi_nama?.trim().toLowerCase() ?? "";
  if (nama.includes("mipil")) return "Pipil";
  return "Pemasih";
}

export function buildSuratKeteranganPernyataan(
  snapshot: SuratKeteranganKramaSnapshot,
  desaNama: string
): string {
  const nomorLabel = suratKeteranganNomorKartuLabel(snapshot);
  return `Adalah benar yang bersangkutan merupakan Krama Desa Adat ${desaNama} dan tercatat dalam sistem Kasukretan Krama Desa Adat sebagai ${snapshot.klasifikasi_nama} yaitu ${snapshot.jenis_nama} dengan nomor ${nomorLabel} : ${snapshot.nomor_kartu}.`;
}
