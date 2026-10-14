import { dateToIsoLocal } from "./date-iso";
import { today } from "./utils";

export type PeriodePreset = "bulan-ini" | "bulan-lalu" | "3-bulan";

export const PERIODE_PRESET_LABEL: Record<PeriodePreset, string> = {
  "bulan-ini": "Bulan ini",
  "bulan-lalu": "Bulan lalu",
  "3-bulan": "3 bulan",
};

export function periodePreset(preset: PeriodePreset): { dari: string; sampai: string } {
  const now = new Date();
  const awalBulan = (offset: number) => new Date(now.getFullYear(), now.getMonth() + offset, 1);
  switch (preset) {
    case "bulan-ini":
      return { dari: dateToIsoLocal(awalBulan(0)), sampai: today() };
    case "bulan-lalu":
      return {
        dari: dateToIsoLocal(awalBulan(-1)),
        sampai: dateToIsoLocal(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "3-bulan":
      return { dari: dateToIsoLocal(awalBulan(-2)), sampai: today() };
  }
}
