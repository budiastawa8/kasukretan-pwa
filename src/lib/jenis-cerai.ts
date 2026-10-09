import { listJenisDapukanIds } from "./dapukan-ketentuan";
import { isKramaNyada } from "./nyada-ketentuan";
import { STATUS_KAWIN_KODE, normalizeStatusKawinKode } from "./status-kawin";
import type { DesaAdat } from "./types";

export type JenisCeraiHasil = {
  jenisId: string;
  jenisSebelumCeraiId: string | null;
  alasan: "cerai_mati" | "cerai_hidup" | "kawin_lagi";
};

/**
 * Jenis Krama Mipil mengikuti status perkawinan Pengarep:
 * Cerai Mati / Cerai Hidup → jenis yang dipetakan di Profil Desa; Kawin lagi → jenis sebelumnya.
 * Krama Nyada / Dapukan tidak diubah. Null = jenis tetap.
 */
export function tentukanJenisDariStatusKawin(params: {
  statusKawin: string | null | undefined;
  jenisId: string | null | undefined;
  jenisSebelumCeraiId: string | null | undefined;
  desa: DesaAdat | null | undefined;
}): JenisCeraiHasil | null {
  const { desa } = params;
  const jenisId = params.jenisId?.trim() || "";
  if (isKramaNyada(jenisId, desa) || listJenisDapukanIds(desa).includes(jenisId)) return null;

  const ceraiMatiId = desa?.jenis_cerai_mati_mipil_id?.trim() || "";
  const ceraiHidupId = desa?.jenis_cerai_hidup_mipil_id?.trim() || "";
  const jenisCerai = !!jenisId && (jenisId === ceraiMatiId || jenisId === ceraiHidupId);
  const sebelum = params.jenisSebelumCeraiId?.trim() || null;
  const status = normalizeStatusKawinKode(params.statusKawin);

  const keCerai = (targetId: string, alasan: JenisCeraiHasil["alasan"]): JenisCeraiHasil | null => {
    if (!targetId || jenisId === targetId) return null;
    return {
      jenisId: targetId,
      jenisSebelumCeraiId: jenisCerai ? sebelum : jenisId || null,
      alasan,
    };
  };

  if (status === STATUS_KAWIN_KODE.CERAI_MATI) return keCerai(ceraiMatiId, "cerai_mati");
  if (status === STATUS_KAWIN_KODE.CERAI_HIDUP) return keCerai(ceraiHidupId, "cerai_hidup");
  if (status === STATUS_KAWIN_KODE.KAWIN && jenisCerai && sebelum && sebelum !== jenisId) {
    return { jenisId: sebelum, jenisSebelumCeraiId: null, alasan: "kawin_lagi" };
  }
  return null;
}

/** Simpan jenis sebelum cerai hanya selama jenis kartu masih jenis Cerai Mati/Cerai Hidup. */
export function jenisSebelumCeraiUntukDisimpan(
  jenisId: string | null | undefined,
  jenisSebelumCeraiId: string | null | undefined,
  desa: DesaAdat | null | undefined
): string | null {
  const cur = jenisId?.trim();
  if (!cur) return null;
  const masihCerai =
    cur === desa?.jenis_cerai_mati_mipil_id?.trim() ||
    cur === desa?.jenis_cerai_hidup_mipil_id?.trim();
  return masihCerai ? jenisSebelumCeraiId?.trim() || null : null;
}
