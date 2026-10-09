import {
  addAnggotaExistingPenduduk,
  createMipilWithExistingKepala,
  deleteAnggota,
  getKramaDetail,
} from "./krama";
import {
  issueSkpAnggota,
  type SkpSnapshotMeta,
  type SkpTujuanInput,
  type SuratKeteranganPindahRow,
} from "./surat-keterangan-pindah";
import {
  gelarKepalaLabel,
  isAnggotaGelarKepalaRow,
  isGelarKepalaStatus,
  isValidStatusKeluargaMipil,
  formatStatusKeluarga,
} from "../status-keluarga";
import { normalizeKramaStatus } from "../krama-status";
import { getDb } from "../db/client";

export type KeluarPipilAlur = "keluar_saja" | "pipil_baru" | "gabung";

export type KeluarPipilIntraDesaInput = {
  sourceKramaId: string;
  sourceAnggotaId: string;
  alur: KeluarPipilAlur;
  skp: {
    tanggalTerbit: string;
    tujuan: SkpTujuanInput;
    tampilkanTtdBandesa?: boolean;
  };
  /** Hapus dari Pipil asal setelah proses (default true untuk pipil_baru/gabung). */
  hapusDariAsal?: boolean;
  pipilBaru?: {
    banjarId: string;
    banjarKode: string;
    tempekId?: string;
    arahanId?: string;
    jenisMipilId?: string;
    alamat?: string;
    keterangan?: string;
    tanggalTerdaftar?: string;
    nomorKontak?: string;
  };
  gabung?: {
    targetKramaId: string;
    statusKeluarga: string;
    tanggalMasuk?: string;
  };
};

export type KeluarPipilIntraDesaResult = {
  surat: SuratKeteranganPindahRow;
  newKramaId?: string;
  targetKramaId?: string;
};

function resolveAnggotaOrThrow(
  krama: NonNullable<Awaited<ReturnType<typeof getKramaDetail>>>,
  anggotaId: string
) {
  const anggota = krama.anggota_aktif.find((a) => a.anggota_id === anggotaId);
  if (!anggota) throw new Error("Anggota tidak ditemukan");
  if (
    isAnggotaGelarKepalaRow(
      anggota.penduduk_id,
      anggota.status_keluarga,
      krama.kepala.id,
      krama.klasifikasi_kode
    )
  ) {
    throw new Error(
      `Tidak dapat memindahkan ${gelarKepalaLabel(krama.klasifikasi_kode)}. Tetapkan pengganti terlebih dahulu.`
    );
  }
  return anggota;
}

function validateGabungTarget(
  targetKramaId: string,
  sourceKramaId: string,
  statusKeluargaRaw: string
) {
  if (targetKramaId === sourceKramaId) {
    throw new Error("Pipil tujuan tidak boleh sama dengan Pipil asal");
  }
  const status = formatStatusKeluarga(statusKeluargaRaw, "MIPIL");
  if (isGelarKepalaStatus(status, "MIPIL")) {
    throw new Error("Pengarep tidak dapat dipilih lewat gabung Pipil");
  }
  if (!isValidStatusKeluargaMipil(status)) {
    throw new Error("Status keluarga tidak valid");
  }
  return status;
}

export async function keluarPipilIntraDesa(
  input: KeluarPipilIntraDesaInput
): Promise<KeluarPipilIntraDesaResult> {
  const source = await getKramaDetail(input.sourceKramaId);
  if (!source) throw new Error("Krama asal tidak ditemukan");
  if (source.klasifikasi_kode !== "MIPIL") {
    throw new Error("Keluar Pipil intra desa hanya untuk Krama Mipil");
  }
  if (normalizeKramaStatus(source.status_krama) !== "aktif") {
    throw new Error("Krama asal tidak aktif");
  }

  const anggota = resolveAnggotaOrThrow(source, input.sourceAnggotaId);
  const hapusDariAsal =
    input.hapusDariAsal ??
    (input.alur === "pipil_baru" || input.alur === "gabung");

  let snapshotMeta: SkpSnapshotMeta = {
    jenis_alur:
      input.alur === "pipil_baru"
        ? "pecah"
        : input.alur === "gabung"
          ? "gabung"
          : "keluar_saja",
  };
  let newKramaId: string | undefined;
  let targetKramaId: string | undefined;
  let statusGabung: string | undefined;

  if (input.alur === "pipil_baru") {
    const pb = input.pipilBaru;
    if (!pb?.banjarId || !pb.banjarKode) {
      throw new Error("Banjar wajib untuk Pipil baru");
    }
    snapshotMeta = { jenis_alur: "pecah" };
  } else if (input.alur === "gabung") {
    const g = input.gabung;
    if (!g?.targetKramaId) throw new Error("Pipil tujuan wajib dipilih");
    statusGabung = validateGabungTarget(
      g.targetKramaId,
      input.sourceKramaId,
      g.statusKeluarga
    );
    const target = await getKramaDetail(g.targetKramaId);
    if (!target) throw new Error("Pipil tujuan tidak ditemukan");
    if (target.klasifikasi_kode !== "MIPIL") {
      throw new Error("Pipil tujuan harus Krama Mipil");
    }
    if (normalizeKramaStatus(target.status_krama) !== "aktif") {
      throw new Error("Pipil tujuan tidak aktif");
    }
    snapshotMeta = {
      jenis_alur: "gabung",
      krama_tujuan_id: g.targetKramaId,
      krama_tujuan_nomor: target.nomor_kartu,
      status_keluarga_di_tujuan: statusGabung,
    };
  } else {
    snapshotMeta = { jenis_alur: "keluar_saja" };
  }

  const { surat } = await issueSkpAnggota(input.sourceKramaId, {
    anggotaId: input.sourceAnggotaId,
    tanggalTerbit: input.skp.tanggalTerbit,
    tujuan: input.skp.tujuan,
    tampilkanTtdBandesa: input.skp.tampilkanTtdBandesa,
    snapshotMeta,
  });

  if (input.alur === "pipil_baru") {
    const pb = input.pipilBaru!;
    newKramaId = await createMipilWithExistingKepala({
      pendudukId: anggota.penduduk_id,
      banjarId: pb.banjarId,
      banjarKode: pb.banjarKode,
      tempekId: pb.tempekId,
      arahanId: pb.arahanId,
      jenisMipilId: pb.jenisMipilId,
      alamat: pb.alamat,
      keterangan: pb.keterangan,
      tanggalTerdaftar: pb.tanggalTerdaftar,
      nomorKontak: pb.nomorKontak,
      excludeActiveKramaId: input.sourceKramaId,
    });
  } else if (input.alur === "gabung") {
    const g = input.gabung!;
    await addAnggotaExistingPenduduk({
      kramaId: g.targetKramaId,
      pendudukId: anggota.penduduk_id,
      statusKeluarga: g.statusKeluarga,
      tanggalMasuk: g.tanggalMasuk,
      excludeActiveKramaId: input.sourceKramaId,
    });
    targetKramaId = g.targetKramaId;
  }

  if (hapusDariAsal) {
    await deleteAnggota(input.sourceKramaId, input.sourceAnggotaId);
  }

  if (statusGabung && (statusGabung === "Istri" || statusGabung === "Suami")) {
    const db = await getDb();
    await db.execute(
      `UPDATE penduduk SET status_kawin = 'Kawin', updated_at = datetime('now') WHERE id = $1`,
      [anggota.penduduk_id]
    );
  }

  return { surat, newKramaId, targetKramaId };
}
