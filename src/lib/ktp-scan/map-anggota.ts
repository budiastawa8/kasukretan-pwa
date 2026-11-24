import { AGAMA_HINDU, isValidAgamaTamiu } from "../agama-tamiu";
import { parseAgamaKk } from "../kk-scan/parse-kk";
import { STATUS_KAWIN_KODE, normalizeStatusKawinKode } from "../status-kawin";
import type { AnggotaDraft, KlasifikasiKode } from "../types";
import type { KtpOcrPerson } from "./types";

export type KtpAnggotaFormValues = Omit<AnggotaDraft, "clientId">;

/**
 * Petakan hasil scan KTP → nilai form anggota.
 * Status keluarga tidak diisi dari KTP (tetap dari form / current).
 */
export function mapKtpToAnggotaFormValues(
  person: KtpOcrPerson,
  klasifikasi: KlasifikasiKode,
  current?: Partial<KtpAnggotaFormValues>
): KtpAnggotaFormValues {
  const isPipil = klasifikasi === "MIPIL";

  let agama = parseAgamaKk(person.agama) || current?.agama || "";
  if (isPipil) agama = AGAMA_HINDU;
  else if (agama && !isValidAgamaTamiu(agama)) {
    // biarkan user koreksi di form bila OCR/Vision tidak cocok opsi
  }

  const statusKawin =
    normalizeStatusKawinKode(person.status_kawin) ??
    current?.status_kawin ??
    STATUS_KAWIN_KODE.KAWIN;

  return {
    nama_lengkap: person.nama_lengkap.trim() || current?.nama_lengkap || "",
    jenis_kelamin: person.jenis_kelamin || current?.jenis_kelamin || "L",
    status_keluarga: current?.status_keluarga || "Istri",
    tempat_lahir: person.tempat_lahir?.trim() || current?.tempat_lahir || "",
    tanggal_lahir: person.tanggal_lahir?.trim() || current?.tanggal_lahir || "",
    status_kawin: statusKawin,
    pekerjaan: person.pekerjaan?.trim() || current?.pekerjaan || "",
    nama_ibu: current?.nama_ibu || "",
    nama_ayah: current?.nama_ayah || "",
    nik_atau_nika: person.nik?.trim() || current?.nik_atau_nika || "",
    agama,
    foto_url: current?.foto_url || "",
  };
}
