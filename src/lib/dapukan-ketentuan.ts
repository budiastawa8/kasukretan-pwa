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

export type JenisDapukanKode = "dapukan" | "balu_dapukan";

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
  if (cur === desa?.jenis_balu_dapukan_mipil_id?.trim()) return "balu_dapukan";
  return null;
}

export function isJenisBaluNglintik(
  jenisMipilId: string | null | undefined,
  desa: Pick<DesaAdat, "jenis_balu_nglintik_mipil_id"> | null | undefined
): boolean {
  const cur = jenisMipilId?.trim();
  return !!cur && cur === desa?.jenis_balu_nglintik_mipil_id?.trim();
}

export function isStatusPasangan(statusKeluarga: string | null | undefined): boolean {
  return /^(istri|suami)$/i.test(statusKeluarga?.trim() ?? "");
}

/** Jenis Dapukan, Balu Dapukan, dan Balu Nglintik yang terisi di Profil Desa. */
export function listJenisDapukanIds(desa: DesaAdat | null | undefined): string[] {
  return [
    desa?.jenis_dapukan_mipil_id,
    desa?.jenis_balu_dapukan_mipil_id,
    desa?.jenis_balu_nglintik_mipil_id,
  ]
    .map((id) => id?.trim() ?? "")
    .filter(Boolean);
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
  | { aksi: "tetap"; dapukanBatas?: string | null }
  | {
      aksi: "nyada";
      jenisId: string;
      sejak: string;
      alasan: AlasanNyada;
      keterangan: string | null;
    }
  | { aksi: "dapukan"; jenisId: string; sejak: string; dapukanBatas: string | null; balu: boolean };

/**
 * Jenis krama Mipil berikutnya menurut Nyada otomatis dan Krama Dapukan.
 * Krama Nyada tidak pernah dikembalikan; Balu Dapukan yang tinggal sendirian menjadi Balu Nglintik.
 */
export function tentukanNyadaOtomatis(params: {
  jenisId: string | null | undefined;
  dapukanBatas?: string | null;
  baluDapukanSejak?: string | null;
  pengarepTanggalLahir: string | null | undefined;
  keluarga: KeadaanKeluargaDapukan;
  desa: DesaAdat;
  hariIni: string;
}): KeputusanNyadaOtomatis {
  const { desa, keluarga, hariIni } = params;
  const jenisNyada = desa.jenis_krama_mipil_id?.trim() || "";
  const jenisNglintik = desa.jenis_balu_nglintik_mipil_id?.trim() || "";
  const jenisId = params.jenisId?.trim() || "";

  if (isKramaNyada(jenisId, desa)) {
    if (
      jenisId === jenisNyada &&
      jenisNglintik &&
      params.baluDapukanSejak &&
      keluarga.sendirian
    ) {
      return {
        aksi: "nyada",
        jenisId: jenisNglintik,
        sejak: hariIni,
        alasan: "dapukan",
        keterangan: "Balu Dapukan tinggal sendirian di Pipil",
      };
    }
    return { aksi: "tetap" };
  }

  const kode = jenisDapukanKode(jenisId, desa);
  if (kode) {
    const batas = params.dapukanBatas || tanggalBatasDapukan(params.pengarepTanggalLahir, desa);
    const balu = kode === "balu_dapukan" || !keluarga.adaPasangan;
    if (!keluarga.adaAnakBelumKawin) {
      return {
        aksi: "nyada",
        jenisId: balu && keluarga.sendirian && jenisNglintik ? jenisNglintik : jenisNyada,
        sejak: hariIni,
        alasan: "dapukan",
        keterangan: "Tidak ada lagi Anak belum kawin",
      };
    }
    if (batas && batas <= hariIni) {
      return {
        aksi: "nyada",
        jenisId: jenisNyada,
        sejak: batas,
        alasan: "dapukan",
        keterangan: "Mencapai batas umur Krama Dapukan",
      };
    }
    const jenisBaluDapukan = desa.jenis_balu_dapukan_mipil_id?.trim();
    if (kode === "dapukan" && !keluarga.adaPasangan && jenisBaluDapukan) {
      return { aksi: "dapukan", jenisId: jenisBaluDapukan, sejak: hariIni, dapukanBatas: batas, balu: true };
    }
    return { aksi: "tetap", dapukanBatas: batas };
  }

  const sejak = hitungNyadaSejak(params.pengarepTanggalLahir, desa);
  if (!sejak || sejak > hariIni) return { aksi: "tetap" };

  const dapukanMulai = getDapukanBerlakuMulai(desa);
  if (isDapukanAktif(desa, hariIni) && dapukanMulai && sejak >= dapukanMulai && keluarga.adaAnakBelumKawin) {
    const batas = tanggalBatasDapukan(params.pengarepTanggalLahir, desa);
    if (batas && batas <= hariIni) {
      return {
        aksi: "nyada",
        jenisId: jenisNyada,
        sejak: batas,
        alasan: "dapukan",
        keterangan: "Mencapai batas umur Krama Dapukan",
      };
    }
    const jenisBaluDapukan = desa.jenis_balu_dapukan_mipil_id?.trim();
    const balu = !keluarga.adaPasangan && !!jenisBaluDapukan;
    return {
      aksi: "dapukan",
      jenisId: balu ? jenisBaluDapukan! : desa.jenis_dapukan_mipil_id!.trim(),
      sejak,
      dapukanBatas: batas,
      balu,
    };
  }

  return { aksi: "nyada", jenisId: jenisNyada, sejak, alasan: "umur", keterangan: null };
}
