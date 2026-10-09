import type { AnggotaDraft, KlasifikasiKode } from "../types";
import type { NyadaManualInput } from "./nyada-otomatis";

export interface KramaKepalaInput {
  nama_lengkap: string;
  jenis_kelamin: string;
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

export interface CreateKramaInput {
  klasifikasiKode: KlasifikasiKode;
  banjarId: string;
  banjarKode: string;
  tempekId?: string;
  arahanId?: string;
  alamat?: string;
  keterangan?: string;
  rtBtn?: string;
  asalDesaAdat?: string;
  asalKecamatan?: string;
  asalKabupaten?: string;
  asalProvinsi?: string;
  jenisMipilId?: string;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  nomorKontak?: string;
  statusKrama?: string;
  alasanTidakAktif?: string;
  tanggalTidakAktif?: string;
  keteranganTidakAktif?: string;
  /** Pipil / Krama Tamiu / Tamiu — tanggal pencatatan kartu (ISO YYYY-MM-DD). */
  tanggalTerdaftar?: string;
  /** Daftar anggota (form baru). Untuk MIPIL, wajib sertakan kepalaAnggotaClientId. */
  anggota?: AnggotaDraft[];
  /** clientId anggota yang menjadi Pengarep (MIPIL) — status keluarganya tidak diubah */
  kepalaAnggotaClientId?: string;
  kepala: KramaKepalaInput;
  /** MIPIL: jenis sebelum otomatis menjadi jenis Cerai Mati/Cerai Hidup (undefined = tidak diubah). */
  jenisSebelumCeraiId?: string | null;
  /** MIPIL: alasan & tanggal bila jenis diubah ke Nyada sebelum batas umur. */
  nyadaManual?: NyadaManualInput | null;
}

export interface UpdateKramaInput extends CreateKramaInput {
  kramaId: string;
}

export interface AddAnggotaInput {
  kramaId: string;
  penduduk: KramaKepalaInput;
  statusKeluarga: string;
  tanggalPencatatan?: string;
}

export interface UpdateAnggotaInput {
  kramaId: string;
  anggotaId: string;
  statusKeluarga?: string;
  penduduk: KramaKepalaInput;
}
