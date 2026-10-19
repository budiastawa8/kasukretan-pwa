import { describe, expect, it } from "vitest";
import {
  buildKramaSearchSql,
  classifySearchQuery,
  normalizeKartuSearchKey,
} from "./search-query";

describe("classifySearchQuery", () => {
  it("kosong untuk input pendek non-digit", () => {
    expect(classifySearchQuery("a").intent).toBe("empty");
    expect(classifySearchQuery("").intent).toBe("empty");
    expect(classifySearchQuery(null).intent).toBe("empty");
  });

  it("kartu untuk nomor/digit-dominant", () => {
    expect(classifySearchQuery("01.02.03").intent).toBe("kartu");
    expect(classifySearchQuery("12345").intent).toBe("kartu");
    expect(classifySearchQuery("12-34-56").intent).toBe("kartu");
    expect(normalizeKartuSearchKey("01-02-03")).toBe("010203");
  });

  it("teks untuk nama", () => {
    expect(classifySearchQuery("Wayan").intent).toBe("teks");
    expect(classifySearchQuery("I Made").intent).toBe("teks");
  });
});

describe("buildKramaSearchSql", () => {
  const aliases = {
    kartu: "k.nomor_kartu",
    kartuNorm: "k.nomor_kartu_norm",
    namaKepala: "p.nama_lengkap",
    alamat: "k.alamat",
    includeAnggota: true,
    includeNik: true,
  };

  it("kartu memakai prefix, tanpa EXISTS anggota", () => {
    const r = buildKramaSearchSql("01-02", aliases, { startN: 2 });
    expect(r.sql).toContain("nomor_kartu LIKE");
    expect(r.sql).toContain("nomor_kartu_norm");
    expect(r.sql).not.toContain("EXISTS");
    expect(r.args.length).toBeGreaterThanOrEqual(3);
  });

  it("teks memakai nama + EXISTS anggota", () => {
    const r = buildKramaSearchSql("Wayan", aliases, { startN: 2 });
    expect(r.sql).toContain("p.nama_lengkap LIKE");
    expect(r.sql).toContain("EXISTS");
    expect(r.args.every((a) => String(a).includes("Wayan"))).toBe(true);
  });

  it("qmark style untuk pengumpulan", () => {
    const r = buildKramaSearchSql(
      "Made",
      {
        kartu: "k.nomor_kartu",
        namaKepala: "pd.nama_lengkap",
        includeAnggota: false,
        includeNik: false,
      },
      { placeholderStyle: "qmark" }
    );
    expect(r.sql).toContain("?");
    expect(r.sql).not.toContain("$");
    expect(r.args).toEqual(["%Made%"]);
  });
});
