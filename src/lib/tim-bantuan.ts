/** Tipe anggota Tim Kasukretan. */
export type TimKasukretanTipe = "banjar" | "bantuan";

export const TIM_TIPE_BANJAR: TimKasukretanTipe = "banjar";
export const TIM_TIPE_BANTUAN: TimKasukretanTipe = "bantuan";

export function normalizeTimKasukretanTipe(value: unknown): TimKasukretanTipe {
  return value === TIM_TIPE_BANTUAN ? TIM_TIPE_BANTUAN : TIM_TIPE_BANJAR;
}

export function isTimBantuanTipe(value: unknown): boolean {
  return normalizeTimKasukretanTipe(value) === TIM_TIPE_BANTUAN;
}

export function timKasukretanTipeLabel(tipe: TimKasukretanTipe): string {
  return tipe === TIM_TIPE_BANTUAN ? "Tim Bantuan" : "Tim Banjar";
}

/** Apakah desa mengaktifkan fitur Tim Bantuan. */
export function isTimBantuanFiturAktif(desa: { tim_bantuan_aktif?: number | null } | null | undefined): boolean {
  return !!Number(desa?.tim_bantuan_aktif);
}
