import { AGAMA_HINDU } from "../agama-tamiu";
import { STATUS_KAWIN_KODE } from "../status-kawin";
import type { KlasifikasiKode } from "../types";
import type { KkOcrMember } from "./types";

export type AnggotaFromKk = {
  nama_lengkap: string;
  jenis_kelamin: string;
  status_keluarga: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  status_kawin?: string;
  pekerjaan?: string;
  nama_ibu?: string;
  nama_ayah?: string;
  nik_atau_nika?: string;
  agama?: string;
};

function normHubungan(raw?: string): string {
  return (raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Petakan status hubungan KK → status keluarga aplikasi.
 * Kepala Keluarga tidak dijadikan Pengarep/Pengajeg otomatis.
 */
export function mapStatusHubunganKk(
  hubungan: string | undefined,
  jenisKelamin: string | undefined,
  klasifikasi: KlasifikasiKode
): string {
  const h = normHubungan(hubungan);
  const isPipil = klasifikasi === "MIPIL";
  const jk = jenisKelamin === "P" ? "P" : jenisKelamin === "L" ? "L" : undefined;

  if (!h) return jk === "P" ? "Istri" : "Suami";

  if (h.includes("kepala")) {
    return jk === "P" ? "Istri" : "Suami";
  }
  if (h.includes("istri siri") || h === "istri siri") {
    return klasifikasi === "TAMIU" || klasifikasi === "KRAMA_TAMIU" ? "Istri Siri" : "Istri";
  }
  if (h.includes("istri") || h.includes("wife")) return "Istri";
  if (h.includes("suami") || h.includes("husband")) return "Suami";
  if (h.includes("anak") || h.includes("child")) return "Anak";
  if (h.includes("cucu")) return "Cucu";
  if (h.includes("mertua")) return "Mertua";
  if (h.includes("menantu")) {
    return jk === "L" ? "Suami" : "Istri";
  }
  if (h.includes("ayah") || h === "bapak") return isPipil ? "Ayah" : "Orang Tua";
  if (h.includes("ibu") || h.includes("mama") || h.includes("mami")) {
    return isPipil ? "Ibu" : "Orang Tua";
  }
  if (h.includes("orang tua") || h.includes("orangtua")) {
    if (isPipil) return jk === "P" ? "Ibu" : "Ayah";
    return "Orang Tua";
  }
  if (h.includes("ponakan") || h.includes("keponakan")) {
    return isPipil ? "Saudara" : "Ponakan";
  }
  if (h.includes("famili lain") || (h.includes("famili") && h.includes("lain"))) {
    return "Famili lain";
  }
  if (h.includes("saudara") || h.includes("famili")) {
    return "Saudara";
  }
  if (h.includes("pembantu")) return "Saudara";

  return jk === "P" ? "Istri" : "Suami";
}

export function mapKkMemberToAnggota(
  member: KkOcrMember,
  klasifikasi: KlasifikasiKode
): AnggotaFromKk {
  const isPipil = klasifikasi === "MIPIL";
  const isKramaTamiu = klasifikasi === "KRAMA_TAMIU";
  const isTamiu = klasifikasi === "TAMIU";
  const jk = member.jenis_kelamin === "P" ? "P" : "L";

  return {
    nama_lengkap: member.nama_lengkap.trim(),
    jenis_kelamin: jk,
    status_keluarga: mapStatusHubunganKk(
      member.status_hubungan_kk,
      member.jenis_kelamin,
      klasifikasi
    ),
    tempat_lahir: member.tempat_lahir?.trim() || undefined,
    tanggal_lahir: member.tanggal_lahir?.trim() || undefined,
    status_kawin: member.status_kawin?.trim() || STATUS_KAWIN_KODE.KAWIN,
    pekerjaan: member.pekerjaan?.trim() || undefined,
    nama_ibu: isPipil ? member.nama_ibu?.trim() || undefined : undefined,
    nama_ayah: isPipil ? member.nama_ayah?.trim() || undefined : undefined,
    nik_atau_nika: member.nik?.trim() || undefined,
    agama: isPipil || isKramaTamiu ? AGAMA_HINDU : isTamiu ? member.agama?.trim() || "" : undefined,
  };
}
