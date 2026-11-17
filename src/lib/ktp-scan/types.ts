/** Hasil baca satu KTP (satu orang). */
export type KtpOcrPerson = {
  nik?: string;
  nama_lengkap: string;
  jenis_kelamin?: "L" | "P";
  tempat_lahir?: string;
  /** ISO YYYY-MM-DD bila berhasil diurai. */
  tanggal_lahir?: string;
  agama?: string;
  /** Kode status kawin aplikasi bila terpetakan, atau teks mentah. */
  status_kawin?: string;
  pekerjaan?: string;
  alamat?: string;
};
