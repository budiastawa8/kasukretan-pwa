/** Hasil baca satu baris anggota dari Kartu Keluarga. */
export type KkOcrMember = {
  nik?: string;
  nama_lengkap: string;
  jenis_kelamin?: "L" | "P";
  tempat_lahir?: string;
  /** ISO YYYY-MM-DD bila berhasil diurai. */
  tanggal_lahir?: string;
  agama?: string;
  /** Kode status kawin aplikasi (kawin, belum_kawin, …) bila terpetakan. */
  status_kawin?: string;
  pekerjaan?: string;
  /** Status hubungan mentah dari KK (Kepala Keluarga, Istri, …). */
  status_hubungan_kk?: string;
  nama_ayah?: string;
  nama_ibu?: string;
  /** Default false untuk pembantu / baris yang tidak relevan. */
  selected: boolean;
};
