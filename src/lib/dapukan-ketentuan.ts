import { dateToIsoLocal, parseIsoDateString } from "./date-iso";
import {
  hitungNyadaSejak,
  isKramaNyada,
  isNyadaOtomatisAktif,
  parseBatasUmurNyada,
  tanggalMencapaiBatasNyada,
  type AlasanNyada,
} from "./nyada-ketentuan";
import { STATUS_KAWIN_KODE, normalizeStatusKawinKode } from "./status-kawin";
import { isStatusKeluargaAnak } from "./status-keluarga";
import type { DesaAdat } from "./types";

export type JenisDapukanKode = "dapukan";

/** Tanggal mulai Krama Dapukan bila toggle aktif, atau null. */
export function getDapukanBerlakuMulai(
  desa: Pick<DesaAdat, "krama_dapukan_aktif" | "krama_dapukan_berlaku_mulai"> | null | undefined
): string | null {
  if (!Number(desa?.krama_dapukan_aktif)) return null;
  return parseIsoDateString(desa?.krama_dapukan_berlaku_mulai);
}

/** Krama Dapukan berlaku hari ini (butuh Nyada otomatis aktif dan jenis Dapukan terisi). */
export function isDapukanAktif(desa: DesaAdat | null | undefined, hariIni?: string): boolean {
  const mulai = getDapukanBerlakuMulai(desa);
  if (!mulai || !desa?.jenis_dapukan_mipil_id?.trim()) return false;
  const tgl = hariIni ?? dateToIsoLocal(new Date());
  return isNyadaOtomatisAktif(desa, tgl) && tgl >= mulai;
}

export function jenisDapukanKode(
  jenisMipilId: string | null | undefined,
  desa: Pick<DesaAdat, "jenis_dapukan_mipil_id" | "jenis_balu_dapukan_mipil_id"> | null | undefined
): JenisDapukanKode | null {
  const cur = jenisMipilId?.trim();
  if (!cur) return null;
  if (cur === desa?.jenis_dapukan_mipil_id?.trim()) return "dapukan";
  // Warisan: jenis Balu Dapukan lama diperlakukan sebagai Dapukan.
  if (cur === desa?.jenis_balu_dapukan_mipil_id?.trim()) return "dapukan";
  return null;
}

export function isJenisBaluNglintik(
  jenisMipilId: string | null | undefined,
  desa: Pick<DesaAdat, "jenis_balu_nglintik_mipil_id"> | null | undefined
): boolean {
  const cur = jenisMipilId?.trim();
  return !!cur && cur === desa?.jenis_balu_nglintik_mipil_id?.trim();
}

export function isJenisBaluNgempu(
  jenisMipilId: string | null | undefined,
  desa: Pick<DesaAdat, "jenis_balu_ngempu_mipil_id"> | null | undefined
): boolean {
  const cur = jenisMipilId?.trim();
  return !!cur && cur === desa?.jenis_balu_ngempu_mipil_id?.trim();
}

export function isStatusPasangan(statusKeluarga: string | null | undefined): boolean {
  return /^(istri|suami)$/i.test(statusKeluarga?.trim() ?? "");
}

/** Jenis Dapukan (bukan Nyada) yang terisi di Profil Desa, termasuk warisan Balu Dapukan. */
export function listJenisDapukanIds(desa: DesaAdat | null | undefined): string[] {
  return [desa?.jenis_dapukan_mipil_id, desa?.jenis_balu_dapukan_mipil_id]
    .map((id) => id?.trim() ?? "")
    .filter(Boolean);
}

/**
 * Pilih jenis Nyada saat keluar Dapukan / sinkron subtype Nyada.
 * - Kawin → Nyada Jangkep (`jenis_krama_mipil_id`)
 * - Cerai + lewat umur (masih Anak belum kawin) → Balu Ngempu
 * - Cerai + Dapukan selesai → Balu Nglintik (selama masih Pengarep; tidak mensyaratkan sendirian)
 */
export function pilihJenisNyadaDapukan(
  keluarga: Pick<KeadaanKeluargaDapukan, "adaPasangan" | "adaAnakBelumKawin">,
  desa: Pick<
    DesaAdat,
    "jenis_krama_mipil_id" | "jenis_balu_nglintik_mipil_id" | "jenis_balu_ngempu_mipil_id"
  >,
  jalur: "selesai" | "lewat_umur"
): string {
  const jangkep = desa.jenis_krama_mipil_id?.trim() || "";
  const nglintik = desa.jenis_balu_nglintik_mipil_id?.trim() || "";
  const ngempu = desa.jenis_balu_ngempu_mipil_id?.trim() || "";
  if (keluarga.adaPasangan) return jangkep;
  if (jalur === "lewat_umur" && ngempu) return ngempu;
  return nglintik || jangkep;
}

/** Ulang tahun Pengarep ke-batas umur Dapukan, atau null bila batas tidak diatur. */
export function tanggalBatasDapukan(
  tanggalLahir: string | null | undefined,
  desa: Pick<DesaAdat, "batas_umur_dapukan"> | null | undefined
): string | null {
  const batas = parseBatasUmurNyada(desa?.batas_umur_dapukan);
  if (batas == null) return null;
  return tanggalMencapaiBatasNyada(tanggalLahir, batas);
}

/**
 * True jika batas umur Dapukan diisi dan tidak lebih besar dari batas umur Nyada.
 * Kosong (tanpa batas Dapukan) dianggap valid.
 */
export function isBatasUmurDapukanTidakValid(
  batasUmurNyada: number | string | null | undefined,
  batasUmurDapukan: number | string | null | undefined
): boolean {
  const nyada = parseBatasUmurNyada(batasUmurNyada);
  const dapukan = parseBatasUmurNyada(batasUmurDapukan);
  if (nyada == null || dapukan == null) return false;
  return dapukan <= nyada;
}

export const PESAN_BATAS_UMUR_DAPUKAN_INVALID =
  "Batas umur Krama Dapukan harus lebih besar dari batas umur Nyada";

export type AnggotaKeluargaDapukan = {
  penduduk_id: string;
  status_keluarga: string | null;
  status_kawin: string | null;
};

export type KeadaanKeluargaDapukan = {
  adaAnakBelumKawin: boolean;
  adaPasangan: boolean;
  /** Hanya Pengarep yang tersisa di Pipil. */
  sendirian: boolean;
};

/** Anggota aktif yang masih hidup (termasuk Pengarep). */
export function keadaanKeluargaDapukan(
  anggota: AnggotaKeluargaDapukan[],
  kepalaPendudukId: string
): KeadaanKeluargaDapukan {
  const lain = anggota.filter((a) => a.penduduk_id !== kepalaPendudukId);
  return {
    adaAnakBelumKawin: lain.some(
      (a) =>
        isStatusKeluargaAnak(a.status_keluarga ?? "") &&
        normalizeStatusKawinKode(a.status_kawin) === STATUS_KAWIN_KODE.BELUM_KAWIN
    ),
    adaPasangan: lain.some((a) => isStatusPasangan(a.status_keluarga)),
    sendirian: lain.length === 0,
  };
}

export type KeputusanNyadaOtomatis =
  | { aksi: "tetap"; dapukanBatas?: string | null; tanpaPasangan?: boolean }
  | {
      aksi: "nyada";
      jenisId: string;
      sejak: string;
      alasan: AlasanNyada;
      keterangan: string | null;
    }
  | { aksi: "dapukan"; jenisId: string; sejak: string; dapukanBatas: string | null; tanpaPasangan: boolean };

function keteranganNyadaDapukan(jalur: "selesai" | "lewat_umur", adaPasangan: boolean): string {
  if (jalur === "lewat_umur") {
    return adaPasangan
      ? "Mencapai batas umur Krama Dapukan"
      : "Mencapai batas umur Krama Dapukan (Balu Ngempu)";
  }
  return adaPasangan
    ? "Tidak ada lagi Anak belum kawin"
    : "Tidak ada lagi Anak belum kawin (Balu Nglintik)";
}

/**
 * Jenis krama Mipil berikutnya menurut Nyada otomatis dan Krama Dapukan.
 * Saat Dapukan aktif: Nyada Jangkep / Balu Nglintik / Balu Ngempu.
 * Krama Nyada tidak pernah dikembalikan ke non-Nyada.
 */
export function tentukanNyadaOtomatis(params: {
  jenisId: string | null | undefined;
  dapukanBatas?: string | null;
  /** Riwayat Dapukan tanpa pasangan — metadata; pemilihan jenis tidak lagi bergantung sendirian. */
  baluDapukanSejak?: string | null;
  pengarepTanggalLahir: string | null | undefined;
  keluarga: KeadaanKeluargaDapukan;
  desa: DesaAdat;
  hariIni: string;
}): KeputusanNyadaOtomatis {
  const { desa, keluarga, hariIni } = params;
  const jenisNyada = desa.jenis_krama_mipil_id?.trim() || "";
  const jenisDapukan = desa.jenis_dapukan_mipil_id?.trim() || "";
  const jenisId = params.jenisId?.trim() || "";
  const dapukanAktif = isDapukanAktif(desa, hariIni);

  if (isKramaNyada(jenisId, desa)) {
    if (!dapukanAktif || !jenisNyada) return { aksi: "tetap" };
    const jalur: "selesai" | "lewat_umur" = keluarga.adaAnakBelumKawin ? "lewat_umur" : "selesai";
    const target = pilihJenisNyadaDapukan(keluarga, desa, jalur);
    if (target && target !== jenisId) {
      return {
        aksi: "nyada",
        jenisId: target,
        sejak: hariIni,
        alasan: "dapukan",
        keterangan: keteranganNyadaDapukan(jalur, keluarga.adaPasangan),
      };
    }
    return { aksi: "tetap" };
  }

  const kode = jenisDapukanKode(jenisId, desa);
  if (kode) {
    const batas = params.dapukanBatas || tanggalBatasDapukan(params.pengarepTanggalLahir, desa);
    const tanpaPasangan = !keluarga.adaPasangan;
    if (!keluarga.adaAnakBelumKawin) {
      const jenisIdNyada = dapukanAktif
        ? pilihJenisNyadaDapukan(keluarga, desa, "selesai")
        : jenisNyada;
      return {
        aksi: "nyada",
        jenisId: jenisIdNyada,
        sejak: hariIni,
        alasan: "dapukan",
        keterangan: keteranganNyadaDapukan("selesai", keluarga.adaPasangan),
      };
    }
    if (batas && batas <= hariIni) {
      const jenisIdNyada = dapukanAktif
        ? pilihJenisNyadaDapukan(keluarga, desa, "lewat_umur")
        : jenisNyada;
      return {
        aksi: "nyada",
        jenisId: jenisIdNyada,
        sejak: batas,
        alasan: "dapukan",
        keterangan: keteranganNyadaDapukan("lewat_umur", keluarga.adaPasangan),
      };
    }
    // Samakan warisan Balu Dapukan ke jenis Dapukan desa.
    if (jenisDapukan && jenisId !== jenisDapukan) {
      return {
        aksi: "dapukan",
        jenisId: jenisDapukan,
        sejak: hariIni,
        dapukanBatas: batas,
        tanpaPasangan,
      };
    }
    return { aksi: "tetap", dapukanBatas: batas, tanpaPasangan };
  }

  const sejak = hitungNyadaSejak(params.pengarepTanggalLahir, desa);
  if (!sejak || sejak > hariIni) return { aksi: "tetap" };

  const dapukanMulai = getDapukanBerlakuMulai(desa);
  if (dapukanAktif && dapukanMulai && sejak >= dapukanMulai && keluarga.adaAnakBelumKawin) {
    const batas = tanggalBatasDapukan(params.pengarepTanggalLahir, desa);
    if (batas && batas <= hariIni) {
      return {
        aksi: "nyada",
        jenisId: pilihJenisNyadaDapukan(keluarga, desa, "lewat_umur"),
        sejak: batas,
        alasan: "dapukan",
        keterangan: keteranganNyadaDapukan("lewat_umur", keluarga.adaPasangan),
      };
    }
    return {
      aksi: "dapukan",
      jenisId: jenisDapukan,
      sejak,
      dapukanBatas: batas,
      tanpaPasangan: !keluarga.adaPasangan,
    };
  }

  return { aksi: "nyada", jenisId: jenisNyada, sejak, alasan: "umur", keterangan: null };
}
