import type { AnggotaKeluarga } from "./types";

/** Sufiks register untuk satu anggota (NRT/NRKT). */
export function kartuRegisterSuffix(anggota?: AnggotaKeluarga): string {
  if (!anggota) return "";
  const reg = (anggota.nrkt ?? anggota.nrt ?? "").trim().replace(/[^\w.-]+/g, "-");
  return reg ? `-${reg}` : "";
}

export function kartuCountSuffix(count: number, anggota?: AnggotaKeluarga): string {
  if (count === 1) return kartuRegisterSuffix(anggota);
  return `-${count}-anggota`;
}
