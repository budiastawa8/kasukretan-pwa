export type JenisKartu = "NPK" | "NPKT" | "NPT";
export type KlasifikasiKode = "MIPIL" | "KRAMA_TAMIU" | "TAMIU";
export type Peran = "admin" | "operator" | "keuangan" | "prajuru";

export interface DesaAdat {
  id: string;
  kode_kabupaten: string;
  nama_kabupaten: string;
  kode_kecamatan: string;
  nama_kecamatan: string;
  kode_desa_adat: string;
  nama_desa_adat: string;
  /** Alamat desa adat untuk kop surat dinas */
  alamat_desa_adat?: string | null;
  /** Logo Desa Adat (data URL atau path) */
  logo_url?: string | null;
  /** Logo MDA */
  logo_mda_url?: string | null;
  /** Batas umur nyada/luput (tahun) */
  jenis_umur_nyada?: number | null;
  /** Tanggal mulai Nyada otomatis berdasarkan umur Pengarep (YYYY-MM-DD). Kosong = tidak otomatis. */
  nyada_berlaku_mulai?: string | null;
  /** Jenis Krama Mipil acuan ketentuan nyada/luput */
  jenis_krama_mipil_id?: string | null;
  /** Jenis krama untuk Pengarep Cerai Mati */
  jenis_cerai_mati_mipil_id?: string | null;
  /** Jenis krama untuk Pengarep Cerai Hidup */
  jenis_cerai_hidup_mipil_id?: string | null;
  /** 1 = desa menerapkan Krama Dapukan (Pengarep usia Nyada yang masih punya Anak belum kawin). */
  krama_dapukan_aktif?: number | null;
  /** Tanggal mulai Krama Dapukan (YYYY-MM-DD); krama yang Nyada sebelumnya tidak berubah. */
  krama_dapukan_berlaku_mulai?: string | null;
  /** Batas umur Pengarep Dapukan; setelahnya otomatis Nyada. Kosong = tanpa batas. */
  batas_umur_dapukan?: number | null;
  jenis_dapukan_mipil_id?: string | null;
  /** @deprecated Tidak dipakai lagi; kolom DB dipertahankan untuk migrasi. */
  jenis_balu_dapukan_mipil_id?: string | null;
  /** Nyada setelah Pengarep Dapukan tanpa pasangan tinggal sendirian di Pipil. */
  jenis_balu_nglintik_mipil_id?: string | null;
  /** Usia minimum Yowana (tahun) */
  yowana_umur_min?: number | null;
  /** Usia maksimum Yowana (tahun) */
  yowana_umur_max?: number | null;
  bandesa_nama?: string | null;
  bandesa_jabatan?: string | null;
  /** NIK Bandesa (16 digit) — surat keterangan krama */
  bandesa_nik?: string | null;
  /** Gambar tanda tangan Bandesa (PNG, data URL) — kartu belakang */
  bandesa_ttd_url?: string | null;
  /** Nomor call center desa adat — kartu belakang */
  call_center?: string | null;
  panyarikan_nama?: string | null;
  panyarikan_jabatan?: string | null;
  /** Gambar tanda tangan Panyarikan (PNG, data URL) */
  panyarikan_ttd_url?: string | null;
  patengen_nama?: string | null;
  patengen_jabatan?: string | null;
  /** Pararem desa adat — rujukan surat penagihan dudukan */
  pararem_nomor?: string | null;
  pararem_tahun?: string | null;
  pararem_judul?: string | null;
  /** 1 = perpanjang Pemasih Krama Tamiu otomatis saat masa habis */
  auto_perpanjang_pemasih?: number | null;
  /** 1 = perpanjang Pemasih Tamiu otomatis saat masa habis */
  auto_perpanjang_pemasih_tamiu?: number | null;
  /** 1 = masa berlaku Pipil menurunkan status & ditampilkan di cetak (default 1) */
  enforce_masa_berlaku_pipil?: number | null;
  /** 1 = kenakan biaya administrasi saat pendaftaran/perpanjangan Pemasih */
  charge_biaya_admin_pemasih?: number | null;
}

export type PrajuruDesaAdatInput = {
  bandesa_nama?: string;
  bandesa_jabatan?: string;
  bandesa_nik?: string;
  bandesa_ttd_url?: string | null;
  call_center?: string | null;
  panyarikan_nama?: string;
  panyarikan_jabatan?: string;
  panyarikan_ttd_url?: string | null;
  patengen_nama?: string;
  patengen_jabatan?: string;
  pararem_nomor?: string;
  pararem_tahun?: string;
  pararem_judul?: string;
};

export interface KlasifikasiKrama {
  id: string;
  kode: KlasifikasiKode;
  nama_tampilan: string;
  gelar_kepala: string;
  prefix_kartu: JenisKartu;
}

export interface Banjar {
  id: string;
  desa_adat_id: string;
  nama: string;
  kode: string;
  aktif: number;
  created_at?: string;
}

export interface Tempek {
  id: string;
  banjar_id: string;
  nama: string;
  kode?: string | null;
  aktif: number;
  created_at?: string;
}

export interface Arahan {
  id: string;
  tempek_id: string;
  nama: string;
  kode?: string | null;
  aktif: number;
  created_at?: string;
}

export interface TimKasukretan {
  id: string;
  nama: string;
  banjar_id: string;
  jabatan: string;
  banjar_nama: string;
  banjar_kode: string;
  created_at?: string;
  updated_at?: string;
}

export interface Penduduk {
  id: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  tempat_lahir?: string | null;
  tanggal_lahir?: string | null;
  status_kawin?: string | null;
  pekerjaan?: string | null;
  nama_ibu?: string | null;
  nama_ayah?: string | null;
  nik_kependudukan?: string | null;
  nik_atau_nika?: string | null;
  agama?: string | null;
  foto_url?: string | null;
}

export interface AnggotaKeluarga extends Penduduk {
  anggota_id: string;
  penduduk_id: string;
  status_keluarga: string;
  nika?: string | null;
  nrkt?: string | null;
  nrt?: string | null;
  urut_dalam_keluarga?: number | null;
  tanggal_pencatatan?: string | null;
  masuk_pada?: string | null;
}

export interface KramaDetail {
  id: string;
  nomor_kartu: string;
  jenis_kartu: JenisKartu;
  klasifikasi_kode: KlasifikasiKode;
  klasifikasi_nama: string;
  gelar_kepala: string;
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  tempek_id?: string | null;
  arahan_id?: string | null;
  jenis_krama_mipil_id?: string | null;
  /** Tanggal efektif Nyada (otomatis/berlaku mulai). Kosong pada Nyada lama = berlaku untuk semua iuran. */
  nyada_sejak?: string | null;
  /** Jenis sebelum menjadi Nyada — tagihan iuran yang jatuh tempo sebelum `nyada_sejak`. */
  jenis_sebelum_nyada_id?: string | null;
  /** Akhir masa Nyada (jenis diganti ke non-Nyada); iuran jatuh tempo sebelum ini tetap persen Nyada. */
  nyada_sampai?: string | null;
  /** umur | cacat | keputusan | lama | pengganti | dapukan */
  alasan_nyada?: string | null;
  keterangan_nyada?: string | null;
  /** Tanggal krama Dapukan otomatis Nyada karena batas umur (ulang tahun Pengarep Dapukan). */
  dapukan_batas?: string | null;
  /** Tanggal Dapukan tanpa pasangan (untuk jalur Balu Nglintik). */
  balu_dapukan_sejak?: string | null;
  /** Jenis sebelum otomatis menjadi jenis Cerai Mati/Cerai Hidup — dipulihkan saat Pengarep kawin lagi. */
  jenis_sebelum_cerai_id?: string | null;
  jenis_krama_tamiu_id?: string | null;
  jenis_tamiu_id?: string | null;
  tempek_nama?: string | null;
  arahan_nama?: string | null;
  alamat?: string | null;
  keterangan?: string | null;
  rt_btn?: string | null;
  asal_desa_adat?: string | null;
  asal_kecamatan?: string | null;
  asal_kabupaten?: string | null;
  asal_provinsi?: string | null;
  jenis_nama?: string | null;
  paturunan_persen?: number | null;
  dudukan_nominal?: number | null;
  masa_berlaku_tahun?: number | null;
  /** 1 = jenis Pemasih ini diperpanjang otomatis. */
  auto_perpanjang_pemasih?: number | null;
  tanggal_terdaftar: string;
  nomor_kontak?: string | null;
  status_krama: string;
  status_pipil?: string | null;
  status_pemasih?: string | null;
  tanggal_berlaku_mulai_pemasih?: string | null;
  alasan_tidak_aktif?: string | null;
  tanggal_tidak_aktif?: string | null;
  keterangan_tidak_aktif?: string | null;
  kepala: Penduduk;
  anggota_aktif: AnggotaKeluarga[];
}

export interface RekapItem {
  label: string;
  count: number;
}

export interface JenisKramaMipilRow {
  id: string;
  nama: string;
  kode?: string | null;
  paturunan_persen: number;
  masa_berlaku_tahun?: number | null;
  keterangan?: string | null;
  aktif: number;
}

export type AkunKeuanganJenis =
  | "kas_dudukan"
  | "kas_paturunan"
  | "dana_kasukretan_lainnya"
  | "bank"
  | "ewallet";

export interface AkunKeuanganRow {
  id: string;
  nama: string;
  jenis: AkunKeuanganJenis;
  keterangan?: string | null;
  aktif: number;
  urutan: number;
  /** Induk kelompok Dana Dudukan / Dana Paturunan / Dana Kasukretan Lainnya; null = akun mandiri atau induk kelompok. */
  parent_akun_id?: string | null;
  /** 1 = akun induk kelompok (ringkasan, tanpa transaksi langsung). */
  is_kelompok?: number;
  created_at?: string;
}

export type AkunKeuanganKelompok =
  | "kas_dudukan"
  | "kas_paturunan"
  | "dana_kasukretan_lainnya";

export interface PosBiayaRow {
  id: string;
  nama: string;
  keterangan?: string | null;
  aktif: number;
  urutan: number;
  kelompok_akun?: string | null;
  is_system?: number;
  created_at?: string;
}

export interface PosPemasukanRow {
  id: string;
  nama: string;
  keterangan?: string | null;
  aktif: number;
  urutan: number;
  kelompok_akun?: string | null;
  is_system?: number;
  created_at?: string;
}

export interface KasDudukanAlokasiRow {
  id: string;
  pos_biaya_id: string;
  pos_biaya_nama?: string;
  persen: number;
  urutan: number;
}

export interface PlafonAlokasiDudukanRow {
  pos_biaya_id: string;
  pos_biaya_nama: string;
  persen: number;
  plafon: number;
  terpakai: number;
  sisa: number;
}

export interface TransaksiPengeluaranPosRow {
  id: string;
  transaksi_id: string;
  pos_biaya_id: string;
  pos_biaya_nama?: string;
  jumlah: number;
  keterangan?: string | null;
}

export interface TransaksiPengeluaranRow {
  id: string;
  akun_keuangan_id: string;
  akun_keuangan_nama?: string;
  tanggal: string;
  keterangan?: string | null;
  /** Gabungan keterangan baris pos (untuk pencarian daftar). */
  pos_keterangan?: string | null;
  created_by?: string | null;
  created_by_nama?: string | null;
  created_at?: string;
  total_jumlah?: number;
  pos?: TransaksiPengeluaranPosRow[];
}

export interface TransaksiPemasukanPosRow {
  id: string;
  transaksi_id: string;
  pos_pemasukan_id: string;
  pos_pemasukan_nama?: string;
  jumlah: number;
  keterangan?: string | null;
}

export interface TransaksiPemasukanRow {
  id: string;
  akun_keuangan_id: string;
  akun_keuangan_nama?: string;
  tanggal: string;
  keterangan?: string | null;
  /** Gabungan keterangan baris pos (untuk pencarian daftar). */
  pos_keterangan?: string | null;
  created_by?: string | null;
  created_by_nama?: string | null;
  created_at?: string;
  total_jumlah?: number;
  pos?: TransaksiPemasukanPosRow[];
}

export type BukuKasJenisTransaksi =
  | "paturunan"
  | "dudukan"
  | "pemasukan_lain"
  | "transfer_masuk"
  | "transfer_keluar"
  | "pengeluaran";

export interface TransaksiTransferRow {
  id: string;
  akun_asal_id: string;
  akun_tujuan_id: string;
  akun_asal_nama?: string;
  akun_tujuan_nama?: string;
  jumlah: number;
  tanggal: string;
  keterangan?: string | null;
  created_by?: string | null;
  created_by_nama?: string | null;
  created_at?: string;
}

export interface BukuKasBaris {
  id: string;
  tanggal: string;
  uraian: string;
  masuk: number;
  keluar: number;
  jenis: BukuKasJenisTransaksi;
  ref_id: string;
  created_at: string;
  saldo_berjalan?: number;
}

/** Ringkasan saldo akhir per sub-akun (laporan Dana kelompok). */
export interface LaporanBukuKasSubSaldo {
  nama: string;
  saldo_akhir: number;
}

/** Baris laporan buku kas — pemasukan/pengeluaran terpisah, penerimaan dikelompokkan. */
export interface LaporanBukuKasBaris {
  id: string;
  tanggal: string;
  uraian: string;
  pemasukan: number;
  pengeluaran: number;
  jenis: BukuKasJenisTransaksi;
  created_at: string;
  saldo_berjalan?: number;
}

export type LaporanKasRekapPerPosBarisKind =
  | "saldo_awal"
  | "data"
  | "jumlah"
  | "saldo"
  | "total";

/** Baris laporan kas rekap per pos — pos pemasukan di atas, pos pengeluaran di bawah. */
export interface LaporanKasRekapPerPosBaris {
  no?: number;
  pos: string;
  pemasukan: number;
  pengeluaran: number;
  kind: LaporanKasRekapPerPosBarisKind;
}

export type PaturunanPembayaranJenis = "wajib" | "punia";

/** Satu cicilan pembayaran paturunan per kartu Pipil. */
export interface PaturunanPembayaranRow {
  id: string;
  krama_id: string;
  iuran_id: string;
  jenis: PaturunanPembayaranJenis;
  jumlah: number;
  tanggal: string;
  petugas_id?: string | null;
  petugas_nama?: string | null;
  petugas_jabatan?: string | null;
  akun_keuangan_id?: string | null;
  akun_keuangan_nama?: string | null;
  keterangan?: string | null;
  /** Terisi bila uang diterima lewat setoran petugas. */
  setoran_id?: string | null;
  /** Tanggal masuk buku kas; kosong = uang masih dipegang petugas. */
  tanggal_setor?: string | null;
  created_at?: string;
}

/** Penghapusan sisa tagihan dudukan per periode (keputusan pengurus). */
export interface DudukanKeringananRow {
  id: string;
  krama_id: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  tanggal: string;
  petugas_id?: string | null;
  petugas_nama?: string | null;
  petugas_jabatan?: string | null;
  keterangan?: string | null;
  created_at?: string;
}

/** Satu pembayaran / cicilan dudukan bulanan per krama pemasih. */
export interface DudukanPembayaranRow {
  id: string;
  krama_id: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  tanggal: string;
  petugas_id?: string | null;
  petugas_nama?: string | null;
  petugas_jabatan?: string | null;
  akun_keuangan_id?: string | null;
  akun_keuangan_nama?: string | null;
  keterangan?: string | null;
  /** Snapshot jenis krama tamiu saat pembayaran dicatat. */
  jenis_krama_tamiu_id?: string | null;
  /** Snapshot jenis tamiu saat pembayaran dicatat. */
  jenis_tamiu_id?: string | null;
  /** Nama jenis tampilan saat pembayaran dicatat. */
  jenis_nama?: string | null;
  /** Terisi bila uang diterima lewat setoran petugas. */
  setoran_id?: string | null;
  /** Tanggal masuk buku kas; kosong = uang masih dipegang petugas. */
  tanggal_setor?: string | null;
  created_at?: string;
}

/** Iuran paturunan (kampanye) dengan nominal dasar Rp. */
export interface IuranPaturunanRow {
  id: string;
  nama: string;
  nominal: number;
  tanggal_target?: string | null;
  keterangan?: string | null;
  aktif: number;
  created_at?: string;
  updated_at?: string;
}

export interface JenisKramaTamiuRow {
  id: string;
  nama: string;
  kode?: string | null;
  dudukan_nominal?: number | null;
  masa_berlaku_tahun?: number | null;
  auto_perpanjang?: number | null;
  keterangan?: string | null;
  aktif: number;
}

export interface JenisTamiuRow {
  id: string;
  nama: string;
  kode?: string | null;
  dudukan_nominal?: number | null;
  masa_berlaku_tahun?: number | null;
  auto_perpanjang?: number | null;
  keterangan?: string | null;
  aktif: number;
}

/** Anggota sementara saat form pendaftaran krama baru */
export interface AnggotaDraft {
  clientId: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  status_keluarga: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  status_kawin?: string;
  pekerjaan?: string;
  nama_ibu?: string;
  nama_ayah?: string;
  nik_atau_nika?: string;
  agama?: string;
  foto_url?: string;
}

export interface KramaListItem {
  id: string;
  nomor_kartu: string;
  jenis_kartu: string;
  status_krama: string;
  status_pipil?: string | null;
  status_pemasih?: string | null;
  tanggal_berlaku_mulai_pemasih?: string | null;
  masa_berlaku_tahun?: number | null;
  auto_perpanjang_pemasih?: number | null;
  tanggal_terdaftar: string;
  klasifikasi_kode: string;
  klasifikasi_nama: string;
  kepala_nama: string;
  kepala_tanggal_lahir?: string | null;
  jenis_krama_mipil_id?: string | null;
  alasan_nyada?: string | null;
  jenis_nama?: string | null;
  alamat?: string | null;
  rt_btn?: string | null;
  banjar_nama: string;
  banjar_kode?: string;
  tempek_nama?: string | null;
  tempek_created_at?: string | null;
  arahan_nama?: string | null;
  arahan_created_at?: string | null;
  nomor_kontak?: string | null;
  alasan_tidak_aktif?: string | null;
  tanggal_tidak_aktif?: string | null;
  keterangan_tidak_aktif?: string | null;
}

export type TarifAdministrasiIlikitaJenis =
  | "ipma_terbit_baru"
  | "ipma_perpanjangan"
  | "pemasih_terbit_baru"
  | "pemasih_perpanjangan";

export interface TarifAdministrasiIlikitaRow {
  jenis: TarifAdministrasiIlikitaJenis;
  nominal: number;
  updated_at?: string;
}

export interface LembagaBadanRow {
  id: string;
  desa_adat_id: string;
  nama: string;
  alamat?: string | null;
  sektor_utama: string;
  bentuk_hukum: string;
  fokus_bidang: string;
  nomor_legalitas?: string | null;
  nama_penanggung_jawab: string;
  no_kontak?: string | null;
  penanggung_jawab_krama_id?: string | null;
  aktif: number;
  created_at?: string;
  updated_at?: string;
}

export type MautsahaAdatStatus = "belum_terbit" | "berlaku" | "perlu_perpanjang" | "kedaluwarsa";

export interface LembagaBadanListItem extends LembagaBadanRow {
  mautsaha_status?: MautsahaAdatStatus;
  mautsaha_nomor_surat?: string | null;
  mautsaha_berlaku_sampai?: string | null;
}
