import { dateToIsoLocal, parseIsoDateString } from "./date-iso";
import { isKepalaPenduduk } from "./status-keluarga";
import type { AnggotaDraft, DesaAdat, KlasifikasiKode, KramaDetail } from "./types";
import { hitungUmur } from "./utils";

export function parseBatasUmurNyada(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export type AlasanNyada = "umur" | "cacat" | "keputusan" | "lama" | "pengganti" | "dapukan";

/** Alasan yang dipilih petugas saat Nyada ditetapkan manual sebelum batas umur. */
export const ALASAN_NYADA_MANUAL_OPTIONS: { value: AlasanNyada; label: string }[] = [
  { value: "cacat", label: "Cacat tetap" },
  { value: "keputusan", label: "Keputusan desa lainnya" },
];

const ALASAN_NYADA_LABEL: Record<AlasanNyada, string> = {
  umur: "Umur",
  cacat: "Cacat tetap",
  keputusan: "Keputusan desa",
  lama: "Nyada lama",
  pengganti: "Pengganti Pengarep",
  dapukan: "Selesai Dapukan",
};

export function normalizeAlasanNyada(value?: string | null): AlasanNyada | null {
  const v = value?.trim().toLowerCase();
  return v && v in ALASAN_NYADA_LABEL ? (v as AlasanNyada) : null;
}

export function formatAlasanNyada(value?: string | null): string {
  const kode = normalizeAlasanNyada(value);
  return kode ? ALASAN_NYADA_LABEL[kode] : "";
}

/** Alasan Nyada yang perlu ditonjolkan di daftar (bukan karena umur). */
export function labelAlasanNyadaKhusus(value?: string | null): string {
  const kode = normalizeAlasanNyada(value);
  return kode === "cacat" || kode === "keputusan" ? ALASAN_NYADA_LABEL[kode] : "";
}

/** Jenis bila pengganti tidak meneruskan Nyada: Ngarep Balu (Cerai Mati), atau jenis sebelum Nyada. */
export function resolveJenisSetelahLepasNyada(
  krama: Pick<KramaDetail, "jenis_sebelum_nyada_id"> | null | undefined,
  desa: Pick<DesaAdat, "jenis_cerai_mati_mipil_id"> | null | undefined
): string | null {
  return desa?.jenis_cerai_mati_mipil_id?.trim() || krama?.jenis_sebelum_nyada_id?.trim() || null;
}

/** Nyada, termasuk Krama Balu Nglintik (Nyada setelah Dapukan tanpa pasangan tinggal sendirian). */
export function isKramaNyada(
  jenisMipilId: string | null | undefined,
  desa: Pick<DesaAdat, "jenis_krama_mipil_id" | "jenis_balu_nglintik_mipil_id"> | null | undefined
): boolean {
  const cur = jenisMipilId?.trim();
  if (!cur) return false;
  const nyada = desa?.jenis_krama_mipil_id?.trim();
  const nglintik = desa?.jenis_balu_nglintik_mipil_id?.trim();
  return cur === nyada || cur === nglintik;
}

/** Tanggal berlaku Nyada otomatis (YYYY-MM-DD) atau null jika tidak diatur. */
export function getNyadaBerlakuMulai(
  desa: Pick<DesaAdat, "nyada_berlaku_mulai"> | null | undefined
): string | null {
  return parseIsoDateString(desa?.nyada_berlaku_mulai);
}

/** Nyada otomatis sudah berlaku hari ini (batas umur, jenis Nyada, dan tanggal berlaku terisi). */
export function isNyadaOtomatisAktif(desa: DesaAdat | null | undefined, hariIni?: string): boolean {
  const mulai = getNyadaBerlakuMulai(desa);
  if (!mulai) return false;
  if (parseBatasUmurNyada(desa?.jenis_umur_nyada) == null) return false;
  if (!desa?.jenis_krama_mipil_id?.trim()) return false;
  return (hariIni ?? dateToIsoLocal(new Date())) >= mulai;
}

/** Tanggal Pengarep genap berumur `batas` tahun (YYYY-MM-DD). */
export function tanggalMencapaiBatasNyada(
  tanggalLahir: string | null | undefined,
  batas: number
): string | null {
  const lahir = parseIsoDateString(tanggalLahir);
  if (!lahir) return null;
  const [y, m, d] = lahir.split("-").map(Number);
  return dateToIsoLocal(new Date(y + batas, m - 1, d));
}

/**
 * Tanggal efektif Nyada otomatis: ulang tahun ke-batas, tetapi tidak sebelum tanggal berlaku.
 * Null jika data tidak lengkap.
 */
export function hitungNyadaSejak(
  tanggalLahir: string | null | undefined,
  desa: DesaAdat | null | undefined
): string | null {
  const batas = parseBatasUmurNyada(desa?.jenis_umur_nyada);
  const mulai = getNyadaBerlakuMulai(desa);
  if (batas == null || !mulai) return null;
  const ultah = tanggalMencapaiBatasNyada(tanggalLahir, batas);
  if (!ultah) return null;
  return ultah > mulai ? ultah : mulai;
}

export type NyadaSuggestion = {
  batasUmur: number;
  umurPengarep: number;
  jenisNyadaId: string;
  jenisNyadaNama: string;
};

export function getNyadaSuggestion(params: {
  klasifikasi: KlasifikasiKode;
  desa: DesaAdat | null;
  jenisMipilId: string;
  pengarepTanggalLahir?: string | null;
  jenisMipilNama: (id: string) => string | undefined;
}): NyadaSuggestion | null {
  if (params.klasifikasi !== "MIPIL") return null;
  // Dengan tanggal berlaku, Nyada diterapkan otomatis (atau belum berlaku) — tanpa dialog saran.
  if (getNyadaBerlakuMulai(params.desa)) return null;

  const batas = parseBatasUmurNyada(params.desa?.jenis_umur_nyada);
  const jenisNyadaId = params.desa?.jenis_krama_mipil_id?.trim();
  if (batas == null || !jenisNyadaId) return null;
  if (!params.jenisMipilId || params.jenisMipilId === jenisNyadaId) return null;

  const umurPengarep = hitungUmur(params.pengarepTanggalLahir);
  if (umurPengarep == null || umurPengarep < batas) return null;

  const jenisNyadaNama = params.jenisMipilNama(jenisNyadaId);
  if (!jenisNyadaNama) return null;

  return {
    batasUmur: batas,
    umurPengarep,
    jenisNyadaId,
    jenisNyadaNama,
  };
}

/** Tanggal lahir Pengarep/Pengajeg untuk pengecekan nyada saat simpan. */
export function resolvePengarepTanggalLahir(params: {
  isEdit: boolean;
  klasifikasi: KlasifikasiKode;
  krama: KramaDetail | null;
  kepalaFromDraft?: AnggotaDraft;
}): string | undefined {
  if (!params.isEdit) {
    return params.kepalaFromDraft?.tanggal_lahir?.trim() || undefined;
  }
  if (!params.krama) return undefined;
  const pengarep =
    params.krama.anggota_aktif.find((a) =>
      isKepalaPenduduk(a.penduduk_id, params.krama!.kepala.id)
    ) ?? params.krama.anggota_aktif.find((a) => a.penduduk_id === params.krama!.kepala.id);
  const tgl = pengarep?.tanggal_lahir ?? params.krama.kepala.tanggal_lahir;
  return tgl?.trim() || undefined;
}

/** Umur dari tanggal lahir sudah mencapai atau melebihi batas Nyada di pengaturan. */
export function isUmurMencapaiBatasNyada(
  tanggalLahir: string | null | undefined,
  batasUmurNyada: unknown
): boolean {
  const batas = parseBatasUmurNyada(batasUmurNyada);
  if (batas == null) return false;
  const umur = hitungUmur(tanggalLahir);
  return umur != null && umur >= batas;
}
