import { describe, expect, it } from "vitest";
import {
  isJabatanKetuaTim,
  ketuaTimOrBandesa,
} from "./pdf-laporan-layout";

describe("isJabatanKetuaTim", () => {
  it("mengenali Ketua Tim", () => {
    expect(isJabatanKetuaTim("Ketua Tim")).toBe(true);
    expect(isJabatanKetuaTim("  ketua   tim  ")).toBe(true);
  });

  it("menolak jabatan lain", () => {
    expect(isJabatanKetuaTim("Ketua")).toBe(false);
    expect(isJabatanKetuaTim("Bendahara Tim")).toBe(false);
    expect(isJabatanKetuaTim("")).toBe(false);
  });
});

describe("ketuaTimOrBandesa", () => {
  const desa = {
    bandesa_nama: "I Wayan Bandesa",
    bandesa_jabatan: "Bandesa Adat",
  };

  it("memakai Ketua Tim jika nama ada", () => {
    expect(
      ketuaTimOrBandesa({ nama: "Ni Ketut Ketua", jabatan: "Ketua Tim" }, desa)
    ).toEqual({ nama: "Ni Ketut Ketua", jabatan: "Ketua Tim" });
  });

  it("jatuh ke Bandesa jika Ketua Tim kosong", () => {
    expect(ketuaTimOrBandesa(null, desa)).toEqual({
      nama: "I Wayan Bandesa",
      jabatan: "Bandesa Adat",
    });
    expect(ketuaTimOrBandesa({ nama: "  ", jabatan: "Ketua Tim" }, desa)).toEqual({
      nama: "I Wayan Bandesa",
      jabatan: "Bandesa Adat",
    });
  });

  it("default jabatan Bandesa Adat jika profil jabatan kosong", () => {
    expect(ketuaTimOrBandesa(null, { bandesa_nama: "Made", bandesa_jabatan: "" })).toEqual({
      nama: "Made",
      jabatan: "Bandesa Adat",
    });
  });
});
