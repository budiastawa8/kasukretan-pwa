import type { SortAccessors } from "./table-sort";
import type { PaturunanKramaRow } from "./services/paturunan";
import type { DudukanKramaRow, DudukanKramaSearchRow } from "./services/dudukan";
import type { LembagaBadanListItem } from "./types";
import type { LaporanPemasihRow } from "./services/laporan-pemasih";
import type { CapaianPaturunanTempekRow } from "./services/laporan-capaian-paturunan-tempek";

type KramaListRow = {
  nomor_kartu: string;
  kepala_nama: string;
  jenis_nama?: string | null;
  banjar_nama?: string | null;
  tempek_nama?: string | null;
  arahan_nama?: string | null;
  alamat?: string | null;
  kepala_tanggal_lahir?: string | null;
  alasan_tidak_aktif?: string | null;
  tanggal_tidak_aktif?: string | null;
  klasifikasi_nama?: string | null;
  status_pipil?: string | null;
  tanggal_terdaftar?: string | null;
  rt_btn?: string | null;
};

export const PATURUNAN_SORT: SortAccessors<PaturunanKramaRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  jenis_nama: (r) => r.jenis_nama,
  tempek_nama: (r) => r.tempek_nama,
  tagihan: (r) => r.tagihan ?? 0,
  dibayar: (r) => r.dibayar ?? 0,
  sisa: (r) => r.sisa ?? 0,
  punia: (r) => r.punia ?? 0,
  arahan_nama: (r) => r.arahan_nama,
  banjar_nama: (r) => r.banjar_nama,
};

export const DUDUKAN_SORT: SortAccessors<DudukanKramaSearchRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  alamat: (r) => r.alamat,
  jenis_nama: (r) => r.jenis_nama,
  tarif_bulanan: (r) => r.tarif_bulanan,
  tunggakan_bulan: (r) => r.tunggakan_bulan,
  total_sisa: (r) => r.total_sisa,
  banjar_nama: (r) => r.banjar_nama,
};

export const KRAMA_MIPIL_SORT: SortAccessors<KramaListRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  kepala_tanggal_lahir: (r) => r.kepala_tanggal_lahir,
  jenis_nama: (r) => r.jenis_nama,
  banjar_nama: (r) => r.banjar_nama,
  tempek_nama: (r) => r.tempek_nama,
  arahan_nama: (r) => r.arahan_nama,
  alasan_tidak_aktif: (r) => r.alasan_tidak_aktif,
  tanggal_tidak_aktif: (r) => r.tanggal_tidak_aktif,
  status_pipil: (r) => r.status_pipil,
  tanggal_terdaftar: (r) => r.tanggal_terdaftar,
};

export const KRAMA_PEMASIH_SORT: SortAccessors<KramaListRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  alamat: (r) => r.alamat,
  jenis_nama: (r) => r.jenis_nama,
  banjar_nama: (r) => r.banjar_nama,
  rt_btn: (r) => r.rt_btn,
  klasifikasi_nama: (r) => r.klasifikasi_nama,
  alasan_tidak_aktif: (r) => r.alasan_tidak_aktif,
  tanggal_tidak_aktif: (r) => r.tanggal_tidak_aktif,
};

export const LAPORAN_DUDUKAN_SORT: SortAccessors<DudukanKramaRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  jenis_nama: (r) => r.jenis_nama,
  banjar_nama: (r) => r.banjar_nama,
  tarif: (r) => r.tarif,
  dibayar: (r) => r.dibayar,
  diterima_periode: (r) => r.diterima_periode ?? 0,
  keringanan: (r) => r.keringanan,
  sisa: (r) => r.sisa,
};

export const LAPORAN_PEMASIH_SORT: SortAccessors<LaporanPemasihRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  alamat: (r) => r.alamat,
  banjar_nama: (r) => r.banjar_nama,
  tempek_nama: (r) => r.tempek_nama,
  status_label: (r) => r.status_label,
  berlaku_sampai: (r) => r.berlaku_sampai,
};

export const TUNGGAKAN_PATURUNAN_SORT: SortAccessors<PaturunanKramaRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  jenis_nama: (r) => r.jenis_nama,
  sisa: (r) => r.sisa ?? 0,
};

export const CAPAIAN_PATURUNAN_TEMPEK_SORT: SortAccessors<CapaianPaturunanTempekRow> = {
  banjar_nama: (r) => r.banjar_nama,
  tempek_nama: (r) => r.tempek_nama,
  tagihan: (r) => r.tagihan,
  dibayar: (r) => r.dibayar,
  sisa: (r) => r.sisa,
  punia: (r) => r.punia,
  pct_dibayar: (r) => r.pct_dibayar ?? -1,
  pct_sisa: (r) => r.pct_sisa ?? -1,
};

export const LEMBAGA_BADAN_SORT: SortAccessors<LembagaBadanListItem> = {
  nama: (r) => r.nama,
  sektor_utama: (r) => r.sektor_utama,
  nama_penanggung_jawab: (r) => r.nama_penanggung_jawab,
};

export type PemasihPerhatianRow = {
  nomor_kartu: string;
  kepala_nama: string;
  jenis_nama?: string | null;
  banjar_nama?: string | null;
  status_label?: string | null;
  berlaku_sampai?: string | null;
};

export const PEMASIH_PERHATIAN_SORT: SortAccessors<PemasihPerhatianRow> = {
  nomor_kartu: (r) => r.nomor_kartu,
  kepala_nama: (r) => r.kepala_nama,
  jenis_nama: (r) => r.jenis_nama,
  banjar_nama: (r) => r.banjar_nama,
  status_label: (r) => r.status_label,
  berlaku_sampai: (r) => r.berlaku_sampai,
};
