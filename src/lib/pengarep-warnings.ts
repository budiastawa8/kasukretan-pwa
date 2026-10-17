import { dateToIsoLocal, parseIsoDateString } from "./date-iso";
import { isUmurMencapaiBatasNyada } from "./nyada-ketentuan";
import { STATUS_KAWIN_KODE, normalizeStatusKawinKode } from "./status-kawin";
import type { KlasifikasiKode } from "./types";

export type PengarepDesaKetentuan = {
  batasUmurNyada?: number | null;
  /** Tanggal mulai Nyada otomatis; sebelum tanggal ini umur tidak memicu Nyada. */
  nyadaBerlakuMulai?: string | null;
  jenisNyadaId?: string | null;
  jenisCeraiMatiId?: string | null;
  jenisCeraiHidupId?: string | null;
  /** Jenis Dapukan / Balu Nglintik — diperlakukan seperti Nyada untuk peringatan. */
  jenisDapukanIds?: string[];
};

function jenisClause(nama?: string): string {
  if (nama?.trim()) {
    return `Silakan pertimbangkan jenis krama menjadi ${nama}, atau dengan sebutan lain sesuai keadaan di Desa Adat anda.`;
  }
  return "Silakan pertimbangkan jenis krama sesuai keadaan di Desa Adat anda.";
}

function jenisSudahDipetakan(
  jenisMipilId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  const cur = jenisMipilId?.trim();
  const tgt = targetId?.trim();
  return !!cur && !!tgt && cur === tgt;
}

export function getPengarepWarnings(params: {
  klasifikasi: KlasifikasiKode;
  statusKawin?: string | null;
  tanggalLahir?: string | null;
  /** Jenis krama Mipil yang saat ini dipilih pada kartu */
  jenisMipilId?: string | null;
  ketentuan: PengarepDesaKetentuan;
  jenisNama: (id: string | null | undefined) => string | undefined;
}): string[] {
  if (params.klasifikasi !== "MIPIL") return [];

  const warnings: string[] = [];
  const status = normalizeStatusKawinKode(params.statusKawin);
  const jenisId = params.jenisMipilId?.trim() || null;
  const isNyadaJenis =
    jenisSudahDipetakan(jenisId, params.ketentuan.jenisNyadaId) ||
    (!!jenisId && !!params.ketentuan.jenisDapukanIds?.includes(jenisId));

  if (
    !isNyadaJenis &&
    status === STATUS_KAWIN_KODE.CERAI_MATI &&
    !jenisSudahDipetakan(jenisId, params.ketentuan.jenisCeraiMatiId)
  ) {
    const nama = params.jenisNama(params.ketentuan.jenisCeraiMatiId);
    warnings.push(`Pengarep berstatus Cerai Mati. ${jenisClause(nama)}`);
  }
  if (
    !isNyadaJenis &&
    status === STATUS_KAWIN_KODE.CERAI_HIDUP &&
    !jenisSudahDipetakan(jenisId, params.ketentuan.jenisCeraiHidupId)
  ) {
    const nama = params.jenisNama(params.ketentuan.jenisCeraiHidupId);
    warnings.push(`Pengarep berstatus Cerai Hidup. ${jenisClause(nama)}`);
  }
  if (
    !isNyadaJenis &&
    status === STATUS_KAWIN_KODE.KAWIN &&
    (jenisSudahDipetakan(jenisId, params.ketentuan.jenisCeraiMatiId) ||
      jenisSudahDipetakan(jenisId, params.ketentuan.jenisCeraiHidupId))
  ) {
    warnings.push("Status Pengarep tidak cocok dengan jenis krama");
  }
  if (status === STATUS_KAWIN_KODE.BELUM_KAWIN) {
    warnings.push(
      "Pengarep berstatus Belum Kawin. Mohon pertimbangkan untuk mengganti Pengarep ke anggota yang sudah atau pernah menikah."
    );
  }
  const berlakuMulai = parseIsoDateString(params.ketentuan.nyadaBerlakuMulai);
  const nyadaBelumBerlaku = !!berlakuMulai && dateToIsoLocal(new Date()) < berlakuMulai;
  if (
    !nyadaBelumBerlaku &&
    isUmurMencapaiBatasNyada(params.tanggalLahir, params.ketentuan.batasUmurNyada) &&
    !isNyadaJenis
  ) {
    const nama = params.jenisNama(params.ketentuan.jenisNyadaId);
    if (berlakuMulai && params.ketentuan.jenisNyadaId) {
      warnings.push(`Usia Pengarep telah memasuki usia Nyada/Luput. Jenis krama otomatis menjadi ${nama ?? "Nyada"} saat kartu disimpan.`);
    } else {
      warnings.push(`Usia Pengarep telah memasuki usia Nyada/Luput. Pertimbangkan untuk mengubah jenis krama${nama ? ` menjadi ${nama}` : ""}, atau dengan sebutan lain sesuai keadaan di Desa Adat anda.`);
    }
  }

  return warnings;
}
