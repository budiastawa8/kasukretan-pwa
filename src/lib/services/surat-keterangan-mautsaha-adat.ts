import { getDb } from "../db/client";
import { hitungBerlakuSampai } from "../masa-berlaku";
import { allocateNomorSuratMautsahaAdat } from "../penomoran-ipma";
import { SEKTOR_SWASTA_KOMERSIAL } from "../lembaga-badan-options";
import type { DesaAdat, KramaDetail, MautsahaAdatStatus } from "../types";
import { today, uuid } from "../utils";
import { kartuNikAnggota } from "../kartu-krama-utils";
import { getDesaAdat } from "./desa";
import { getKramaDetail } from "./krama";
import { getLembagaBadanById } from "./lembaga-badan";
import { catatBiayaAdministrasiIlikita } from "./tarif-administrasi-ilikita";
import { formatAlamatSuratKeteranganKrama } from "./surat-keterangan-krama";

import { computeMautsahaStatus } from "../mautsaha-status";

export type SuratKeteranganMautsahaAdatRow = {
  id: string;
  lembaga_badan_id: string;
  nomor_surat: string;
  tahun: number;
  bulan_terbit: number;
  tanggal_terbit: string;
  tanggal_berlaku_sampai: string;
  jenis: "terbit_baru" | "perpanjangan";
  snapshot_json: string;
  tarif_nominal: number;
  transaksi_pemasukan_id: string | null;
  akun_keuangan_id: string | null;
  created_at: string;
};

export type SuratKeteranganMautsahaAdatSnapshot = {
  nama_desa_adat: string;
  alamat_desa_adat: string;
  pararem_nomor: string;
  pararem_tahun: string;
  pararem_judul: string;
  bandesa_nama: string;
  bandesa_jabatan: string;
  bandesa_ttd_url?: string | null;
  lembaga_nama: string;
  lembaga_alamat: string;
  lembaga_bentuk_hukum: string;
  lembaga_nomor_legalitas: string;
  lembaga_fokus_bidang: string;
  pj_nama: string;
  pj_nik_nika: string;
  pj_tempat_lahir: string;
  pj_tanggal_lahir: string;
  pj_jenis_kelamin: string;
  pj_agama: string;
  pj_klasifikasi_nama: string;
  pj_jenis_nama: string;
  pj_pekerjaan: string;
  pj_alamat_asal: string;
  pj_alamat_sekarang: string;
  pj_foto_url?: string | null;
  tampilkan_ttd_bandesa?: boolean;
};

export type SuratMautsahaAdatListRow = SuratKeteranganMautsahaAdatRow & {
  lembaga_nama: string;
  lembaga_sektor: string;
};

export type SuratMautsahaAdatFilter = {
  q?: string;
  tanggalDari?: string;
  tanggalSampai?: string;
};

export type MautsahaAdatStatusInfo = {
  status: MautsahaAdatStatus;
  nomor_surat: string | null;
  tanggal_berlaku_sampai: string | null;
};

function parseTanggalIso(tanggal: string): string {
  const t = tanggal.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error("Tanggal terbit tidak valid");
  return t;
}

const IPMA_MASA_BERLAKU_TAHUN = 1;

export function assertDesaSiapSuratMautsahaAdat(desa: DesaAdat | null): void {
  if (!desa?.kode_desa_adat?.trim() || desa.kode_desa_adat.trim().length !== 4) {
    throw new Error("Kode desa adat belum lengkap. Lengkapi di Pengaturan → Setup Wilayah.");
  }
  if (!desa.nama_desa_adat?.trim()) {
    throw new Error("Nama desa adat belum diisi. Lengkapi di Master Data → Profil Desa Adat.");
  }
  if (!desa.bandesa_nama?.trim()) {
    throw new Error("Nama Bandesa belum diisi. Lengkapi di Master Data → Profil Desa Adat.");
  }
  if (!desa.pararem_nomor?.trim() || !desa.pararem_tahun?.trim() || !desa.pararem_judul?.trim()) {
    throw new Error(
      "Data Pararem belum lengkap. Lengkapi di Master Data → Profil Desa Adat."
    );
  }
}

function resolvePenanggungJawabAnggota(krama: KramaDetail) {
  const kepala = krama.anggota_aktif.find((a) => a.penduduk_id === krama.kepala.id);
  return kepala ?? krama.anggota_aktif[0] ?? null;
}

function buildAlamatAsalKrama(krama: KramaDetail): string {
  const parts: string[] = [];
  if (krama.asal_desa_adat?.trim()) parts.push(krama.asal_desa_adat.trim());
  if (krama.asal_kecamatan?.trim()) parts.push(krama.asal_kecamatan.trim());
  if (krama.asal_kabupaten?.trim()) parts.push(krama.asal_kabupaten.trim());
  if (krama.asal_provinsi?.trim()) parts.push(krama.asal_provinsi.trim());
  return parts.join(", ");
}

function buildSnapshot(
  lembaga: NonNullable<Awaited<ReturnType<typeof getLembagaBadanById>>>,
  krama: KramaDetail,
  desa: DesaAdat,
  tampilkanTtdBandesa: boolean
): SuratKeteranganMautsahaAdatSnapshot {
  const anggota = resolvePenanggungJawabAnggota(krama);
  const nikNika =
    krama.klasifikasi_kode === "MIPIL"
      ? anggota?.nika?.trim() || krama.kepala.nik_atau_nika?.trim() || ""
      : kartuNikAnggota(anggota ?? krama.kepala);

  return {
    nama_desa_adat: desa.nama_desa_adat?.trim() || "",
    alamat_desa_adat: desa.alamat_desa_adat?.trim() || "",
    pararem_nomor: desa.pararem_nomor?.trim() || "",
    pararem_tahun: desa.pararem_tahun?.trim() || "",
    pararem_judul: desa.pararem_judul?.trim() || "",
    bandesa_nama: desa.bandesa_nama?.trim() || "",
    bandesa_jabatan: desa.bandesa_jabatan?.trim() || "Bandesa Adat",
    bandesa_ttd_url: desa.bandesa_ttd_url,
    lembaga_nama: lembaga.nama,
    lembaga_alamat: lembaga.alamat?.trim() || "",
    lembaga_bentuk_hukum: lembaga.bentuk_hukum,
    lembaga_nomor_legalitas: lembaga.nomor_legalitas?.trim() || "",
    lembaga_fokus_bidang: lembaga.fokus_bidang,
    pj_nama: anggota?.nama_lengkap || krama.kepala.nama_lengkap,
    pj_nik_nika: nikNika,
    pj_tempat_lahir: anggota?.tempat_lahir?.trim() || krama.kepala.tempat_lahir?.trim() || "",
    pj_tanggal_lahir: anggota?.tanggal_lahir?.trim() || krama.kepala.tanggal_lahir?.trim() || "",
    pj_jenis_kelamin: anggota?.jenis_kelamin || krama.kepala.jenis_kelamin || "",
    pj_agama: anggota?.agama?.trim() || krama.kepala.agama?.trim() || "",
    pj_klasifikasi_nama: krama.klasifikasi_nama,
    pj_jenis_nama: krama.jenis_nama?.trim() || krama.klasifikasi_nama,
    pj_pekerjaan: anggota?.pekerjaan?.trim() || krama.kepala.pekerjaan?.trim() || "",
    pj_alamat_asal: buildAlamatAsalKrama(krama),
    pj_alamat_sekarang: formatAlamatSuratKeteranganKrama(krama, desa),
    pj_foto_url: anggota?.foto_url || krama.kepala.foto_url,
    tampilkan_ttd_bandesa: tampilkanTtdBandesa,
  };
}

async function assertLembagaSiapIpma(lembagaId: string): Promise<{
  lembaga: NonNullable<Awaited<ReturnType<typeof getLembagaBadanById>>>;
  krama: KramaDetail;
  desa: DesaAdat;
}> {
  const desa = await getDesaAdat();
  assertDesaSiapSuratMautsahaAdat(desa);
  if (!desa) throw new Error("Data desa adat belum ada.");

  const lembaga = await getLembagaBadanById(lembagaId);
  if (!lembaga || lembaga.aktif !== 1) {
    throw new Error("Lembaga/badan tidak ditemukan atau tidak aktif");
  }
  if (lembaga.sektor_utama !== SEKTOR_SWASTA_KOMERSIAL) {
    throw new Error("Surat IPMA hanya untuk lembaga Swasta Komersial");
  }
  if (!lembaga.penanggung_jawab_krama_id?.trim()) {
    throw new Error("Penanggung jawab krama belum ditautkan pada lembaga ini");
  }

  const krama = await getKramaDetail(lembaga.penanggung_jawab_krama_id);
  if (!krama) throw new Error("Data krama penanggung jawab tidak ditemukan");
  if (krama.status_krama !== "aktif") {
    throw new Error("Krama penanggung jawab harus aktif");
  }

  return { lembaga, krama, desa };
}

async function insertSurat(params: {
  lembagaBadanId: string;
  tanggalTerbit: string;
  jenis: "terbit_baru" | "perpanjangan";
  snapshot: SuratKeteranganMautsahaAdatSnapshot;
  tarifNominal: number;
  transaksiId: string | null;
  akunId: string | null;
}): Promise<SuratKeteranganMautsahaAdatRow> {
  const desa = await getDesaAdat();
  if (!desa) throw new Error("Data desa adat belum ada.");

  const tanggalTerbit = parseTanggalIso(params.tanggalTerbit);
  const tanggalBerlakuSampai =
    hitungBerlakuSampai(tanggalTerbit, IPMA_MASA_BERLAKU_TAHUN) ?? tanggalTerbit;
  const tahun = new Date(tanggalTerbit).getFullYear();
  const bulanTerbit = new Date(tanggalTerbit).getMonth() + 1;
  const nomorSurat = await allocateNomorSuratMautsahaAdat(desa.id, tanggalTerbit);
  const id = uuid();

  const db = await getDb();
  await db.execute(
    `INSERT INTO surat_keterangan_mautsaha_adat (
      id, lembaga_badan_id, nomor_surat, tahun, bulan_terbit, tanggal_terbit,
      tanggal_berlaku_sampai, jenis, snapshot_json, tarif_nominal,
      transaksi_pemasukan_id, akun_keuangan_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.lembagaBadanId,
      nomorSurat,
      tahun,
      bulanTerbit,
      tanggalTerbit,
      tanggalBerlakuSampai,
      params.jenis,
      JSON.stringify(params.snapshot),
      params.tarifNominal,
      params.transaksiId,
      params.akunId,
    ]
  );

  const surat = await getSuratMautsahaById(id);
  if (!surat) throw new Error("Gagal menyimpan surat IPMA");
  return surat;
}

export async function terbitSuratMautsahaAdat(input: {
  lembagaBadanId: string;
  tanggalTerbit?: string;
  tampilkanTtdBandesa?: boolean;
}): Promise<SuratKeteranganMautsahaAdatRow> {
  const { lembaga, krama, desa } = await assertLembagaSiapIpma(input.lembagaBadanId);
  const aktif = await getSuratMautsahaAktif(lembaga.id);
  if (aktif) {
    throw new Error("Lembaga ini masih memiliki surat IPMA yang berlaku. Gunakan perpanjangan.");
  }

  const tanggalTerbit = parseTanggalIso(input.tanggalTerbit ?? today());
  const tampilkanTtdBandesa = input.tampilkanTtdBandesa !== false;
  const snapshot = buildSnapshot(lembaga, krama, desa, tampilkanTtdBandesa);

  const biaya = await catatBiayaAdministrasiIlikita({
    jenis: "ipma_terbit_baru",
    tanggal: tanggalTerbit,
    keterangan: `IPMA terbit baru — ${lembaga.nama}`,
  });

  return insertSurat({
    lembagaBadanId: lembaga.id,
    tanggalTerbit,
    jenis: "terbit_baru",
    snapshot,
    tarifNominal: biaya?.nominal ?? 0,
    transaksiId: biaya?.transaksiId ?? null,
    akunId: biaya?.akunId ?? null,
  });
}

export async function perpanjangSuratMautsahaAdat(input: {
  lembagaBadanId: string;
  tanggalTerbit?: string;
  tampilkanTtdBandesa?: boolean;
}): Promise<SuratKeteranganMautsahaAdatRow> {
  const { lembaga, krama, desa } = await assertLembagaSiapIpma(input.lembagaBadanId);
  const tanggalTerbit = parseTanggalIso(input.tanggalTerbit ?? today());
  const tampilkanTtdBandesa = input.tampilkanTtdBandesa !== false;
  const snapshot = buildSnapshot(lembaga, krama, desa, tampilkanTtdBandesa);

  const biaya = await catatBiayaAdministrasiIlikita({
    jenis: "ipma_perpanjangan",
    tanggal: tanggalTerbit,
    keterangan: `IPMA perpanjangan — ${lembaga.nama}`,
  });

  return insertSurat({
    lembagaBadanId: lembaga.id,
    tanggalTerbit,
    jenis: "perpanjangan",
    snapshot,
    tarifNominal: biaya?.nominal ?? 0,
    transaksiId: biaya?.transaksiId ?? null,
    akunId: biaya?.akunId ?? null,
  });
}

export async function getSuratMautsahaById(id: string): Promise<SuratKeteranganMautsahaAdatRow | null> {
  const db = await getDb();
  const rows = await db.select<SuratKeteranganMautsahaAdatRow[]>(
    `SELECT * FROM surat_keterangan_mautsaha_adat WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getSuratMautsahaAktif(
  lembagaBadanId: string
): Promise<SuratKeteranganMautsahaAdatRow | null> {
  const db = await getDb();
  const hari = today();
  const rows = await db.select<SuratKeteranganMautsahaAdatRow[]>(
    `SELECT * FROM surat_keterangan_mautsaha_adat
     WHERE lembaga_badan_id = ? AND tanggal_berlaku_sampai >= ?
     ORDER BY tanggal_terbit DESC, created_at DESC
     LIMIT 1`,
    [lembagaBadanId, hari]
  );
  return rows[0] ?? null;
}

export async function getStatusMautsahaAdat(
  lembagaBadanId: string
): Promise<MautsahaAdatStatusInfo> {
  const db = await getDb();
  const latest = await db.select<
    { nomor_surat: string; tanggal_berlaku_sampai: string }[]
  >(
    `SELECT nomor_surat, tanggal_berlaku_sampai FROM surat_keterangan_mautsaha_adat
     WHERE lembaga_badan_id = ?
     ORDER BY tanggal_terbit DESC, created_at DESC
     LIMIT 1`,
    [lembagaBadanId]
  );
  const row = latest[0];
  const aktif = await getSuratMautsahaAktif(lembagaBadanId);
  const berlakuSampai = aktif?.tanggal_berlaku_sampai ?? row?.tanggal_berlaku_sampai ?? null;
  return {
    status: computeMautsahaStatus(berlakuSampai, !!row),
    nomor_surat: aktif?.nomor_surat ?? row?.nomor_surat ?? null,
    tanggal_berlaku_sampai: berlakuSampai,
  };
}

export async function listSuratMautsahaAdat(
  filter?: SuratMautsahaAdatFilter
): Promise<SuratMautsahaAdatListRow[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

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
    clauses.push(`(lb.nama LIKE ? OR s.nomor_surat LIKE ?)`);
    params.push(q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  return db.select<SuratMautsahaAdatListRow[]>(
    `SELECT s.*, lb.nama as lembaga_nama, lb.sektor_utama as lembaga_sektor
     FROM surat_keterangan_mautsaha_adat s
     JOIN lembaga_badan lb ON lb.id = s.lembaga_badan_id
     ${where}
     ORDER BY s.tanggal_terbit DESC, s.created_at DESC`,
    params
  );
}

export function parseSuratMautsahaSnapshot(json: string): SuratKeteranganMautsahaAdatSnapshot {
  const raw = JSON.parse(json) as SuratKeteranganMautsahaAdatSnapshot;
  return { ...raw, tampilkan_ttd_bandesa: raw.tampilkan_ttd_bandesa !== false };
}

export async function deleteSuratMautsahaAdat(id: string): Promise<void> {
  const db = await getDb();
  const row = await getSuratMautsahaById(id);
  if (!row) throw new Error("Surat IPMA tidak ditemukan");
  await db.execute(`DELETE FROM surat_keterangan_mautsaha_adat WHERE id = ?`, [id]);
}
