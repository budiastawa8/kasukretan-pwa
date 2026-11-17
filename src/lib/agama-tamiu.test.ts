import { describe, expect, it } from "vitest";
import {
  AGAMA_HINDU,
  agamaForPenduduk,
  assertKlasifikasiSesuaiAgama,
  klasifikasiPemasihFromAgama,
  tryKlasifikasiPemasihFromAgama,
} from "./agama-tamiu";

describe("klasifikasiPemasihFromAgama", () => {
  it("Hindu → KRAMA_TAMIU", () => {
    expect(klasifikasiPemasihFromAgama(AGAMA_HINDU)).toBe("KRAMA_TAMIU");
    expect(tryKlasifikasiPemasihFromAgama("Hindu")).toBe("KRAMA_TAMIU");
  });

  it("selain Hindu → TAMIU", () => {
    for (const a of ["Islam", "Kristen", "Katholik", "Konghucu", "Budha"] as const) {
      expect(klasifikasiPemasihFromAgama(a)).toBe("TAMIU");
    }
  });

  it("agama kosong → null / throw", () => {
    expect(tryKlasifikasiPemasihFromAgama("")).toBeNull();
    expect(tryKlasifikasiPemasihFromAgama(null)).toBeNull();
    expect(() => klasifikasiPemasihFromAgama("")).toThrow(/agama/i);
  });
});

describe("assertKlasifikasiSesuaiAgama", () => {
  it("menolak Hindu pada TAMIU", () => {
    expect(() => assertKlasifikasiSesuaiAgama("TAMIU", "Hindu")).toThrow(/Krama Tamiu/);
  });

  it("menolak Islam pada KRAMA_TAMIU", () => {
    expect(() => assertKlasifikasiSesuaiAgama("KRAMA_TAMIU", "Islam")).toThrow(/Tamiu/);
  });
});

describe("agamaForPenduduk", () => {
  it("MIPIL selalu Hindu", () => {
    expect(agamaForPenduduk("MIPIL", "Islam")).toBe(AGAMA_HINDU);
  });

  it("pemasih menyimpan agama yang dipilih", () => {
    expect(agamaForPenduduk("KRAMA_TAMIU", "Hindu")).toBe("Hindu");
    expect(agamaForPenduduk("TAMIU", "Islam")).toBe("Islam");
  });
});
