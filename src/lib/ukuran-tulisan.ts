import { useCallback, useState } from "react";

export type UkuranTulisan = "normal" | "besar" | "sangat-besar";

export const UKURAN_TULISAN_OPSI: { value: UkuranTulisan; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "besar", label: "Besar" },
  { value: "sangat-besar", label: "Sangat besar" },
];

const STORAGE_KEY = "kasukretan.ukuran_tulisan.v1";

export function readUkuranTulisan(): UkuranTulisan {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "besar" || v === "sangat-besar" ? v : "normal";
  } catch {
    return "normal";
  }
}

export function applyUkuranTulisan(ukuran: UkuranTulisan): void {
  if (ukuran === "normal") document.documentElement.removeAttribute("data-ukuran");
  else document.documentElement.setAttribute("data-ukuran", ukuran);
}

/** Pengaturan per perangkat — tiap HP petugas bisa memilih sendiri. */
export function useUkuranTulisan() {
  const [ukuran, setState] = useState<UkuranTulisan>(readUkuranTulisan);
  const setUkuran = useCallback((u: UkuranTulisan) => {
    setState(u);
    applyUkuranTulisan(u);
    try {
      localStorage.setItem(STORAGE_KEY, u);
    } catch {
      /* tetap berlaku sampai aplikasi ditutup */
    }
  }, []);
  return [ukuran, setUkuran] as const;
}
