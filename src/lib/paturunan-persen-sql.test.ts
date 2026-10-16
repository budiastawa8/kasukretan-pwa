import { describe, expect, it } from "vitest";
import { hitungTagihanPaturunan, resolvePersenPaturunanIuran } from "./paturunan-hitung";
import { sqlPersenPaturunanIuran } from "./services/paturunan";

/**
 * Evaluasi mini CASE yang mencerminkan sqlPersenPaturunanIuran — memastikan
 * ekspresi SQL tetap selaras dengan resolvePersenPaturunanIuran.
 */
function evalSqlPersenLike(params: {
  target: string | null;
  persen: number | null;
  persenSebelum: number | null;
  nyadaSejak: string | null;
  persenNyada: number | null;
  nyadaSampai: string | null;
}): number {
  const target = params.target;
  const jm = params.persen ?? 0;
  const jprev = params.persenSebelum;
  const jny = params.persenNyada;
  if (target == null || target.trim() === "") return jm;
  if (params.nyadaSejak != null && params.nyadaSejak.trim() !== "" && target < params.nyadaSejak) {
    return jprev ?? jm;
  }
  if (
    params.nyadaSampai != null &&
    params.nyadaSampai.trim() !== "" &&
    target < params.nyadaSampai &&
    jny != null
  ) {
    return jny;
  }
  return jm;
}

describe("parity persen paturunan SQL ↔ JS", () => {
  it("ekspresi SQL memakai placeholder target", () => {
    expect(sqlPersenPaturunanIuran("$2")).toContain("$2 < k.nyada_sejak");
    expect(sqlPersenPaturunanIuran("$2")).toContain("jprev.paturunan_persen");
  });

  const cases: {
    name: string;
    target: string | null;
    persen: number;
    persenSebelum: number | null;
    nyadaSejak: string | null;
    persenNyada: number | null;
    nyadaSampai: string | null;
  }[] = [
    {
      name: "tanpa target → persen jenis",
      target: null,
      persen: 100,
      persenSebelum: 50,
      nyadaSejak: "2024-01-01",
      persenNyada: 25,
      nyadaSampai: "2025-01-01",
    },
    {
      name: "sebelum nyada → persen sebelum",
      target: "2023-06-01",
      persen: 100,
      persenSebelum: 50,
      nyadaSejak: "2024-01-01",
      persenNyada: 25,
      nyadaSampai: "2025-01-01",
    },
    {
      name: "dalam masa nyada → persen nyada",
      target: "2024-06-01",
      persen: 100,
      persenSebelum: 50,
      nyadaSejak: "2024-01-01",
      persenNyada: 25,
      nyadaSampai: "2025-01-01",
    },
    {
      name: "setelah nyada → persen jenis",
      target: "2025-06-01",
      persen: 100,
      persenSebelum: 50,
      nyadaSejak: "2024-01-01",
      persenNyada: 25,
      nyadaSampai: "2025-01-01",
    },
    {
      name: "sebelum nyada tanpa persen sebelum → persen jenis",
      target: "2023-06-01",
      persen: 80,
      persenSebelum: null,
      nyadaSejak: "2024-01-01",
      persenNyada: 25,
      nyadaSampai: "2025-01-01",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const js = resolvePersenPaturunanIuran({
        persen: c.persen,
        persenSebelumNyada: c.persenSebelum,
        nyadaSejak: c.nyadaSejak,
        persenNyada: c.persenNyada,
        nyadaSampai: c.nyadaSampai,
        tanggalTarget: c.target,
      });
      const sqlLike = evalSqlPersenLike({
        target: c.target,
        persen: c.persen,
        persenSebelum: c.persenSebelum,
        nyadaSejak: c.nyadaSejak,
        persenNyada: c.persenNyada,
        nyadaSampai: c.nyadaSampai,
      });
      expect(sqlLike).toBe(js);
      expect(hitungTagihanPaturunan(1_000_000, js)).toBe(
        Math.round((1_000_000 * js) / 100)
      );
    });
  }
});
