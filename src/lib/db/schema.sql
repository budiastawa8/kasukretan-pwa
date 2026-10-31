-- Kasukretan Krama schema

CREATE TABLE IF NOT EXISTS desa_adat (
  id TEXT PRIMARY KEY,
  kode_kabupaten TEXT NOT NULL,
  nama_kabupaten TEXT NOT NULL,
  kode_kecamatan TEXT NOT NULL,
  nama_kecamatan TEXT NOT NULL,
  kode_desa_adat TEXT NOT NULL,
  nama_desa_adat TEXT NOT NULL,
  alamat_desa_adat TEXT,
  logo_url TEXT,
  logo_mda_url TEXT,
  jenis_umur_nyada INTEGER,
  nyada_berlaku_mulai TEXT,
  jenis_krama_mipil_id TEXT,
  jenis_cerai_mati_mipil_id TEXT,
  jenis_cerai_hidup_mipil_id TEXT,
  krama_dapukan_aktif INTEGER NOT NULL DEFAULT 0,
  krama_dapukan_berlaku_mulai TEXT,
  batas_umur_dapukan INTEGER,
  jenis_dapukan_mipil_id TEXT,
  jenis_balu_dapukan_mipil_id TEXT, -- deprecated; selalu NULL setelah migrasi UI
  jenis_balu_nglintik_mipil_id TEXT,
  yowana_umur_min INTEGER,
  yowana_umur_max INTEGER,
  bandesa_nama TEXT,
  bandesa_jabatan TEXT,
  bandesa_ttd_url TEXT,
  bandesa_nik TEXT,
  call_center TEXT,
  panyarikan_nama TEXT,
  panyarikan_jabatan TEXT,
  panyarikan_ttd_url TEXT,
  patengen_nama TEXT,
  patengen_jabatan TEXT,
  pararem_nomor TEXT,
  pararem_tahun TEXT,
  pararem_judul TEXT,
  auto_perpanjang_pemasih INTEGER NOT NULL DEFAULT 0,
  auto_perpanjang_pemasih_tamiu INTEGER NOT NULL DEFAULT 0,
  enforce_masa_berlaku_pipil INTEGER NOT NULL DEFAULT 1,
  tim_bantuan_aktif INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS banjar (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  nama TEXT NOT NULL,
  kode TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(desa_adat_id, kode)
);

CREATE TABLE IF NOT EXISTS tempek (
  id TEXT PRIMARY KEY,
  banjar_id TEXT NOT NULL REFERENCES banjar(id),
  nama TEXT NOT NULL,
  kode TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS arahan (
  id TEXT PRIMARY KEY,
  tempek_id TEXT NOT NULL REFERENCES tempek(id),
  nama TEXT NOT NULL,
  kode TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS klasifikasi_krama (
  id TEXT PRIMARY KEY,
  kode TEXT NOT NULL UNIQUE,
  nama_tampilan TEXT NOT NULL,
  gelar_kepala TEXT NOT NULL,
  prefix_kartu TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jenis_krama_mipil (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT,
  paturunan_persen REAL NOT NULL,
  masa_berlaku_tahun INTEGER,
  keterangan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS iuran_paturunan (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  nominal REAL NOT NULL,
  tanggal_target TEXT,
  keterangan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paturunan_lunas_krama (
  krama_id TEXT NOT NULL REFERENCES krama(id),
  iuran_id TEXT NOT NULL REFERENCES iuran_paturunan(id),
  lunas INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (krama_id, iuran_id)
);

CREATE TABLE IF NOT EXISTS akun_keuangan (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  jenis TEXT NOT NULL,
  keterangan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0,
  parent_akun_id TEXT REFERENCES akun_keuangan(id),
  is_kelompok INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pos_biaya (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  keterangan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pos_pemasukan (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  keterangan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  urutan INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kas_dudukan_alokasi (
  id TEXT PRIMARY KEY,
  pos_biaya_id TEXT NOT NULL UNIQUE REFERENCES pos_biaya(id),
  persen REAL NOT NULL,
  urutan INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Uang dari petugas yang diterima bendahara. Pembayaran baru masuk buku kas
-- setelah tanggal_setor terisi (setor langsung atau lewat setoran).
CREATE TABLE IF NOT EXISTS setoran (
  id TEXT PRIMARY KEY,
  petugas_id TEXT REFERENCES tim_kasukretan(id),
  tanggal TEXT NOT NULL,
  total REAL NOT NULL,
  keterangan TEXT,
  diterima_oleh TEXT REFERENCES user(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paturunan_pembayaran (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  iuran_id TEXT NOT NULL REFERENCES iuran_paturunan(id),
  jenis TEXT NOT NULL DEFAULT 'wajib',
  jumlah REAL NOT NULL,
  tanggal TEXT NOT NULL,
  petugas_id TEXT REFERENCES tim_kasukretan(id),
  akun_keuangan_id TEXT REFERENCES akun_keuangan(id),
  keterangan TEXT,
  setoran_id TEXT REFERENCES setoran(id),
  tanggal_setor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dudukan_pembayaran (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  tahun INTEGER NOT NULL,
  bulan INTEGER NOT NULL,
  jumlah REAL NOT NULL,
  tanggal TEXT NOT NULL,
  petugas_id TEXT REFERENCES tim_kasukretan(id),
  akun_keuangan_id TEXT REFERENCES akun_keuangan(id),
  keterangan TEXT,
  jenis_krama_tamiu_id TEXT REFERENCES jenis_krama_tamiu(id),
  jenis_tamiu_id TEXT REFERENCES jenis_tamiu(id),
  jenis_nama TEXT,
  setoran_id TEXT REFERENCES setoran(id),
  tanggal_setor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaksi_pengeluaran (
  id TEXT PRIMARY KEY,
  akun_keuangan_id TEXT NOT NULL REFERENCES akun_keuangan(id),
  tanggal TEXT NOT NULL,
  keterangan TEXT,
  created_by TEXT REFERENCES user(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaksi_pengeluaran_pos (
  id TEXT PRIMARY KEY,
  transaksi_id TEXT NOT NULL REFERENCES transaksi_pengeluaran(id) ON DELETE CASCADE,
  pos_biaya_id TEXT NOT NULL REFERENCES pos_biaya(id),
  jumlah REAL NOT NULL,
  keterangan TEXT
);

CREATE TABLE IF NOT EXISTS transaksi_pemasukan (
  id TEXT PRIMARY KEY,
  akun_keuangan_id TEXT NOT NULL REFERENCES akun_keuangan(id),
  tanggal TEXT NOT NULL,
  keterangan TEXT,
  created_by TEXT REFERENCES user(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transaksi_pemasukan_pos (
  id TEXT PRIMARY KEY,
  transaksi_id TEXT NOT NULL REFERENCES transaksi_pemasukan(id) ON DELETE CASCADE,
  pos_pemasukan_id TEXT NOT NULL REFERENCES pos_pemasukan(id),
  jumlah REAL NOT NULL,
  keterangan TEXT
);

CREATE TABLE IF NOT EXISTS transaksi_transfer (
  id TEXT PRIMARY KEY,
  akun_asal_id TEXT NOT NULL REFERENCES akun_keuangan(id),
  akun_tujuan_id TEXT NOT NULL REFERENCES akun_keuangan(id),
  jumlah REAL NOT NULL,
  tanggal TEXT NOT NULL,
  keterangan TEXT,
  created_by TEXT REFERENCES user(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (akun_asal_id != akun_tujuan_id)
);

CREATE INDEX IF NOT EXISTS idx_dudukan_pembayaran_periode
  ON dudukan_pembayaran (tahun, bulan, krama_id);

CREATE TABLE IF NOT EXISTS dudukan_keringanan (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  tahun INTEGER NOT NULL,
  bulan INTEGER NOT NULL,
  jumlah REAL NOT NULL,
  tanggal TEXT NOT NULL,
  petugas_id TEXT REFERENCES tim_kasukretan(id),
  keterangan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (krama_id, tahun, bulan)
);

CREATE INDEX IF NOT EXISTS idx_dudukan_keringanan_periode
  ON dudukan_keringanan (tahun, bulan, krama_id);

CREATE TABLE IF NOT EXISTS jenis_krama_tamiu (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT,
  dudukan_nominal REAL,
  masa_berlaku_tahun INTEGER,
  auto_perpanjang INTEGER NOT NULL DEFAULT 0,
  keterangan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jenis_tamiu (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT,
  dudukan_nominal REAL,
  masa_berlaku_tahun INTEGER,
  auto_perpanjang INTEGER NOT NULL DEFAULT 0,
  keterangan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS penduduk (
  id TEXT PRIMARY KEY,
  nama_lengkap TEXT NOT NULL,
  jenis_kelamin TEXT NOT NULL,
  tempat_lahir TEXT,
  tanggal_lahir TEXT,
  status_kawin TEXT,
  pekerjaan TEXT,
  nama_ibu TEXT,
  nama_ayah TEXT,
  nik_kependudukan TEXT,
  nik_atau_nika TEXT,
  nama_gelar TEXT,
  agama TEXT,
  alamat_domisili TEXT,
  no_hp TEXT,
  status_hidup TEXT NOT NULL DEFAULT 'hidup',
  foto_url TEXT,
  catatan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS krama (
  id TEXT PRIMARY KEY,
  nomor_kartu TEXT NOT NULL UNIQUE,
  nomor_kartu_norm TEXT,
  jenis_kartu TEXT NOT NULL,
  nomor_kartu_diterbitkan_pada TEXT NOT NULL DEFAULT (datetime('now')),
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  banjar_id TEXT NOT NULL REFERENCES banjar(id),
  tempek_id TEXT REFERENCES tempek(id),
  arahan_id TEXT REFERENCES arahan(id),
  alamat TEXT,
  keterangan TEXT,
  rt_btn TEXT,
  asal_desa_adat TEXT,
  asal_kecamatan TEXT,
  asal_kabupaten TEXT,
  asal_provinsi TEXT,
  klasifikasi_krama_id TEXT NOT NULL REFERENCES klasifikasi_krama(id),
  jenis_krama_mipil_id TEXT REFERENCES jenis_krama_mipil(id),
  nyada_sejak TEXT,
  nyada_sampai TEXT,
  jenis_sebelum_nyada_id TEXT REFERENCES jenis_krama_mipil(id),
  alasan_nyada TEXT,
  keterangan_nyada TEXT,
  dapukan_batas TEXT,
  balu_dapukan_sejak TEXT,
  jenis_sebelum_cerai_id TEXT,
  jenis_krama_tamiu_id TEXT REFERENCES jenis_krama_tamiu(id),
  jenis_tamiu_id TEXT REFERENCES jenis_tamiu(id),
  kepala_penduduk_id TEXT NOT NULL REFERENCES penduduk(id),
  tanggal_terdaftar TEXT NOT NULL,
  nomor_kontak TEXT,
  status_krama TEXT NOT NULL DEFAULT 'aktif',
  status_pipil TEXT NOT NULL DEFAULT 'aktif',
  status_pemasih TEXT NOT NULL DEFAULT 'aktif',
  tanggal_berlaku_mulai_pemasih TEXT,
  alasan_tidak_aktif TEXT,
  tanggal_tidak_aktif TEXT,
  keterangan_tidak_aktif TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS anggota_keluarga (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  penduduk_id TEXT NOT NULL REFERENCES penduduk(id),
  status_keluarga TEXT NOT NULL,
  urut_dalam_keluarga INTEGER,
  nika TEXT UNIQUE,
  nrkt TEXT UNIQUE,
  nrt TEXT UNIQUE,
  tanggal_pencatatan TEXT,
  nomor_induk_diterbitkan_pada TEXT,
  masuk_pada TEXT NOT NULL,
  keluar_pada TEXT,
  status TEXT NOT NULL DEFAULT 'aktif'
);

CREATE TABLE IF NOT EXISTS penomoran_kartu_counter (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  banjar_id TEXT NOT NULL UNIQUE REFERENCES banjar(id),
  urutan_terakhir INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS penomoran_nrkt_counter (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  tahun INTEGER NOT NULL,
  urutan_terakhir INTEGER NOT NULL DEFAULT 0,
  UNIQUE(desa_adat_id, tahun)
);

CREATE TABLE IF NOT EXISTS penomoran_nrt_counter (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  tahun INTEGER NOT NULL,
  urutan_terakhir INTEGER NOT NULL DEFAULT 0,
  UNIQUE(desa_adat_id, tahun)
);

CREATE TABLE IF NOT EXISTS penomoran_sp_counter (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  tahun INTEGER NOT NULL,
  urutan_terakhir INTEGER NOT NULL DEFAULT 0,
  UNIQUE(desa_adat_id, tahun)
);

CREATE TABLE IF NOT EXISTS surat_penagihan_dudukan (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  nomor_surat TEXT NOT NULL UNIQUE,
  tahun INTEGER NOT NULL,
  bulan_terbit INTEGER NOT NULL,
  tanggal_terbit TEXT NOT NULL,
  tunggakan_bulan INTEGER NOT NULL,
  total_sisa REAL NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(krama_id, tahun, bulan_terbit)
);

CREATE INDEX IF NOT EXISTS idx_surat_penagihan_krama_tahun_bulan
  ON surat_penagihan_dudukan (krama_id, tahun, bulan_terbit);

CREATE TABLE IF NOT EXISTS penomoran_skk_counter (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  tahun INTEGER NOT NULL,
  urutan_terakhir INTEGER NOT NULL DEFAULT 0,
  UNIQUE(desa_adat_id, tahun)
);

CREATE TABLE IF NOT EXISTS surat_keterangan_krama (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  anggota_id TEXT REFERENCES anggota_keluarga(id),
  nomor_surat TEXT NOT NULL UNIQUE,
  tahun INTEGER NOT NULL,
  bulan_terbit INTEGER NOT NULL,
  tanggal_terbit TEXT NOT NULL,
  tujuan TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_surat_keterangan_krama_tanggal
  ON surat_keterangan_krama (tanggal_terbit, krama_id);

CREATE TABLE IF NOT EXISTS penomoran_skp_counter (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  tahun INTEGER NOT NULL,
  urutan_terakhir INTEGER NOT NULL DEFAULT 0,
  UNIQUE(desa_adat_id, tahun)
);

CREATE TABLE IF NOT EXISTS surat_keterangan_pindah (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  anggota_id TEXT REFERENCES anggota_keluarga(id),
  jenis TEXT NOT NULL CHECK (jenis IN ('keluarga', 'anggota')),
  nomor_surat TEXT NOT NULL UNIQUE,
  tahun INTEGER NOT NULL,
  bulan_terbit INTEGER NOT NULL,
  tanggal_terbit TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_surat_keterangan_pindah_tanggal
  ON surat_keterangan_pindah (tanggal_terbit, krama_id);

CREATE TABLE IF NOT EXISTS pemasih_perpanjangan_riwayat (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  nomor_kartu TEXT NOT NULL,
  tanggal_perpanjangan TEXT NOT NULL,
  tanggal_berlaku_akhir_sebelum TEXT,
  jenis TEXT NOT NULL CHECK (jenis IN ('manual', 'otomatis')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pemasih_perpanjangan_riwayat_created
  ON pemasih_perpanjangan_riwayat (created_at DESC, krama_id);

CREATE TABLE IF NOT EXISTS krama_portal (
  krama_id TEXT PRIMARY KEY REFERENCES krama(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS petugas_akun (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  tim_kasukretan_id TEXT NOT NULL REFERENCES tim_kasukretan(id),
  nama TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS krama_riwayat_klasifikasi (
  id TEXT PRIMARY KEY,
  krama_id TEXT NOT NULL REFERENCES krama(id),
  klasifikasi_lama TEXT NOT NULL,
  klasifikasi_baru TEXT NOT NULL,
  nomor_kartu_lama TEXT,
  nomor_kartu_baru TEXT,
  berlaku_mulai TEXT NOT NULL,
  alasan TEXT,
  disetujui_oleh TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tim_kasukretan (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  banjar_id TEXT NOT NULL REFERENCES banjar(id),
  jabatan TEXT NOT NULL,
  nomor_kontak TEXT,
  /** banjar = petugas biasa; bantuan = Tim Bantuan (hanya Dudukan, 1 banjar) */
  tipe TEXT NOT NULL DEFAULT 'banjar',
  /** Nomor anggota kartu petugas (unik, mis. 001) */
  nomor_pengenal TEXT,
  /** Foto untuk kartu tanda pengenal (data URL) */
  foto_url TEXT,
  /** 1 = aktif (QR sah); 0 = nonaktif (QR tidak terdeteksi) */
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  peran TEXT NOT NULL,
  nama TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  tim_kasukretan_id TEXT REFERENCES tim_kasukretan(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lembaga_badan (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  nama TEXT NOT NULL,
  alamat TEXT,
  sektor_utama TEXT NOT NULL,
  bentuk_hukum TEXT NOT NULL,
  fokus_bidang TEXT NOT NULL,
  nomor_legalitas TEXT,
  nama_penanggung_jawab TEXT NOT NULL,
  no_kontak TEXT,
  penanggung_jawab_krama_id TEXT REFERENCES krama(id),
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lembaga_badan_desa ON lembaga_badan(desa_adat_id);
CREATE INDEX IF NOT EXISTS idx_lembaga_badan_nama ON lembaga_badan(nama);

-- Punia Kasukretan & Dana Kerjasama: diterima petugas, masuk buku kas setelah setor.
CREATE TABLE IF NOT EXISTS penerimaan_dana_lain (
  id TEXT PRIMARY KEY,
  jenis TEXT NOT NULL,
  pos_pemasukan_id TEXT NOT NULL REFERENCES pos_pemasukan(id),
  jumlah REAL NOT NULL,
  tanggal TEXT NOT NULL,
  petugas_id TEXT REFERENCES tim_kasukretan(id),
  akun_keuangan_id TEXT REFERENCES akun_keuangan(id),
  keterangan TEXT,
  sumber_tipe TEXT NOT NULL,
  krama_id TEXT REFERENCES krama(id),
  lembaga_badan_id TEXT REFERENCES lembaga_badan(id),
  sumber_nama TEXT,
  kegiatan TEXT,
  mitra_jenis TEXT,
  jumlah_orang INTEGER,
  satuan_waktu TEXT,
  lama REAL,
  tarif_satuan REAL,
  setoran_id TEXT REFERENCES setoran(id),
  tanggal_setor TEXT,
  created_by TEXT REFERENCES user(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_penerimaan_dana_lain_setor ON penerimaan_dana_lain (setoran_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_dana_lain_tanggal_setor ON penerimaan_dana_lain (tanggal_setor);
CREATE INDEX IF NOT EXISTS idx_penerimaan_dana_lain_petugas ON penerimaan_dana_lain (petugas_id);
CREATE INDEX IF NOT EXISTS idx_penerimaan_dana_lain_tanggal ON penerimaan_dana_lain (tanggal);

CREATE TABLE IF NOT EXISTS penomoran_ipma_counter (
  id TEXT PRIMARY KEY,
  desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
  tahun INTEGER NOT NULL,
  urutan_terakhir INTEGER NOT NULL DEFAULT 0,
  UNIQUE(desa_adat_id, tahun)
);

CREATE TABLE IF NOT EXISTS surat_keterangan_mautsaha_adat (
  id TEXT PRIMARY KEY,
  lembaga_badan_id TEXT NOT NULL REFERENCES lembaga_badan(id),
  nomor_surat TEXT NOT NULL UNIQUE,
  tahun INTEGER NOT NULL,
  bulan_terbit INTEGER NOT NULL,
  tanggal_terbit TEXT NOT NULL,
  tanggal_berlaku_sampai TEXT NOT NULL,
  jenis TEXT NOT NULL CHECK (jenis IN ('terbit_baru', 'perpanjangan')),
  snapshot_json TEXT NOT NULL,
  tarif_nominal REAL NOT NULL DEFAULT 0,
  transaksi_pemasukan_id TEXT REFERENCES transaksi_pemasukan(id) ON DELETE SET NULL,
  akun_keuangan_id TEXT REFERENCES akun_keuangan(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sk_mautsaha_lembaga
  ON surat_keterangan_mautsaha_adat (lembaga_badan_id, tanggal_terbit);

CREATE TABLE IF NOT EXISTS tarif_administrasi_ilikita (
  jenis TEXT PRIMARY KEY CHECK (jenis IN (
    'ipma_terbit_baru', 'ipma_perpanjangan',
    'pemasih_terbit_baru', 'pemasih_perpanjangan'
  )),
  nominal REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
