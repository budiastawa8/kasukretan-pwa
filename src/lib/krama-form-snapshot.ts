import type { AnggotaDraft } from "./types";

export type MipilAnggotaPendingSnapshot = {
  edits: Record<string, Omit<AnggotaDraft, "clientId">>;
  adds: AnggotaDraft[];
  kepalaAnggotaKey: string;
};

export type KramaFormSnapshotFields = {
  banjarId: string;
  tempekId: string;
  arahanId: string;
  jenisMipilId: string;
  jenisKramaTamiuId: string;
  jenisTamiuId: string;
  alamat: string;
  keterangan: string;
  rtBtn: string;
  asalDesa: string;
  asalKec: string;
  asalKab: string;
  asalProv: string;
  nomorKontak: string;
  statusKrama: string;
  alasanTidakAktif: string;
  tanggalTidakAktif: string;
  keteranganTidakAktif: string;
  tanggalPencatatan: string;
};

export function serializeKramaFormSnapshot(
  fields: KramaFormSnapshotFields,
  options: {
    isEdit: boolean;
    anggotaDraft: AnggotaDraft[];
    mipilAnggotaPending?: MipilAnggotaPendingSnapshot;
  }
): string {
  const kartu = {
    banjarId: fields.banjarId,
    tempekId: fields.tempekId,
    arahanId: fields.arahanId,
    jenisMipilId: fields.jenisMipilId,
    jenisKramaTamiuId: fields.jenisKramaTamiuId,
    jenisTamiuId: fields.jenisTamiuId,
    alamat: fields.alamat.trim(),
    keterangan: fields.keterangan.trim(),
    rtBtn: fields.rtBtn.trim(),
    asalDesa: fields.asalDesa.trim(),
    asalKec: fields.asalKec.trim(),
    asalKab: fields.asalKab.trim(),
    asalProv: fields.asalProv.trim(),
    nomorKontak: fields.nomorKontak.trim(),
    statusKrama: fields.statusKrama,
    alasanTidakAktif: fields.alasanTidakAktif,
    tanggalTidakAktif: fields.tanggalTidakAktif,
    keteranganTidakAktif: fields.keteranganTidakAktif.trim(),
    tanggalPencatatan: fields.tanggalPencatatan,
  };

  if (options.isEdit) {
    if (options.mipilAnggotaPending) {
      const pending = options.mipilAnggotaPending;
      const edits = Object.fromEntries(
        Object.entries(pending.edits).map(([id, v]) => [
          id,
          {
            nama: v.nama_lengkap.trim(),
            jk: v.jenis_kelamin,
            status: v.status_keluarga,
            tempat: v.tempat_lahir?.trim() ?? "",
            tgl: v.tanggal_lahir?.trim() ?? "",
            kawin: v.status_kawin?.trim() ?? "",
            kerja: v.pekerjaan?.trim() ?? "",
          },
        ])
      );
      const adds = pending.adds.map((a) => ({
        id: a.clientId,
        nama: a.nama_lengkap.trim(),
        jk: a.jenis_kelamin,
        status: a.status_keluarga,
      }));
      return JSON.stringify({
        kartu,
        mipilAnggota: { edits, adds, kepala: pending.kepalaAnggotaKey },
      });
    }
    return JSON.stringify({ kartu });
  }

  const anggota = options.anggotaDraft.map((a) => ({
    id: a.clientId,
    nama: a.nama_lengkap.trim(),
    jk: a.jenis_kelamin,
    status: a.status_keluarga,
    tempat: a.tempat_lahir?.trim() ?? "",
    tgl: a.tanggal_lahir?.trim() ?? "",
    nik: a.nik_atau_nika?.trim() ?? "",
  }));

  return JSON.stringify({ kartu, anggota });
}
