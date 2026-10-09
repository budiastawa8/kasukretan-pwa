import { describe, expect, it } from "vitest";
import { isJabatanPenerimaSemuaBanjar } from "./petugas-jabatan";

describe("isJabatanPenerimaSemuaBanjar", () => {
  it("mengizinkan Ketua, Sekretaris, Bendahara", () => {
    expect(isJabatanPenerimaSemuaBanjar("Ketua")).toBe(true);
    expect(isJabatanPenerimaSemuaBanjar("sekretaris")).toBe(true);
    expect(isJabatanPenerimaSemuaBanjar("  Bendahara  ")).toBe(true);
  });

  it("mengizinkan jabatan yang diawali role desa", () => {
    expect(isJabatanPenerimaSemuaBanjar("Ketua Desa")).toBe(true);
    expect(isJabatanPenerimaSemuaBanjar("Bendahara Tim")).toBe(true);
  });

  it("menolak jabatan lain", () => {
    expect(isJabatanPenerimaSemuaBanjar("Anggota")).toBe(false);
    expect(isJabatanPenerimaSemuaBanjar("Wakil Ketua")).toBe(false);
    expect(isJabatanPenerimaSemuaBanjar("")).toBe(false);
  });
});
