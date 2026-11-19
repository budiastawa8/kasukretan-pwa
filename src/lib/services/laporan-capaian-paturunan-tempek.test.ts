import { describe, expect, it } from "vitest";
import { statusBayarPaturunan } from "../paturunan-hitung";
import { formatStatusLunasCicilBelum } from "./laporan-capaian-paturunan-tempek";

/** Mirror logika CASE di query agregat capaian. */
function bucketFromSqlRules(tagihan: number, dibayar: number): "lunas" | "cicil" | "belum" | null {
  if (tagihan > 0 && dibayar >= tagihan) return "lunas";
  if (tagihan > 0 && dibayar > 0 && dibayar < tagihan) return "cicil";
  if (tagihan > 0 && dibayar <= 0) return "belum";
  return null;
}

function bucketFromJs(tagihan: number, dibayar: number, punia: number): "lunas" | "cicil" | "belum" | null {
  // Agregat SQL hanya menghitung krama wajib (tagihan > 0).
  if (tagihan <= 0) return null;
  const s = statusBayarPaturunan(tagihan, dibayar, punia);
  if (s === "lunas" || s === "lunas_punia") return "lunas";
  if (s === "cicil" || s === "cicil_punia") return "cicil";
  if (s === "belum" || s === "punia") return "belum";
  return null;
}

describe("capaian status buckets SQL ↔ JS", () => {
  const cases: [number, number, number][] = [
    [500_000, 500_000, 0],
    [500_000, 500_000, 100_000],
    [500_000, 200_000, 0],
    [500_000, 200_000, 50_000],
    [500_000, 0, 0],
    [500_000, 0, 100_000],
    [0, 0, 0],
    [0, 0, 50_000],
  ];

  it("CASE agregat selaras statusBayarPaturunan untuk bucket lunas/cicil/belum", () => {
    for (const [tagihan, dibayar, punia] of cases) {
      expect(bucketFromSqlRules(tagihan, dibayar)).toBe(bucketFromJs(tagihan, dibayar, punia));
    }
  });

  it("formatStatusLunasCicilBelum ringkas", () => {
    expect(formatStatusLunasCicilBelum(12, 3, 5)).toBe("12 / 3 / 5");
  });
});
