import { describe, expect, it } from "vitest";
import {
  normalizeNomorPengenalKey,
  parsePetugasKartuQrPayload,
  petugasKartuQrPayload,
} from "./petugas-kartu-qr";

describe("petugas-kartu-qr", () => {
  it("membangun URL validasi publik bila base https diberikan", () => {
    expect(petugasKartuQrPayload("001", "https://desa.example/cek-petugas")).toBe(
      "https://desa.example/cek-petugas/001"
    );
    expect(petugasKartuQrPayload("TK-12", "https://desa.example/cek-petugas")).toBe(
      "https://desa.example/cek-petugas/tk12"
    );
  });

  it("mem-parse URL halaman cek-petugas", () => {
    expect(parsePetugasKartuQrPayload("https://desa.example/cek-petugas/001")).toBe("001");
    expect(parsePetugasKartuQrPayload("https://desa.example/cek-petugas/tk12?x=1")).toBe("tk12");
    expect(parsePetugasKartuQrPayload("/cek-petugas/042")).toBe("042");
  });

  it("mem-parse payload berprefiks (kartu lama)", () => {
    expect(parsePetugasKartuQrPayload("kasukretan:petugas:001")).toBe("001");
    expect(parsePetugasKartuQrPayload("KASUKRETAN:PETUGAS:042")).toBe("042");
  });

  it("menerima plain nomor pendek", () => {
    expect(parsePetugasKartuQrPayload("001")).toBe("001");
  });

  it("menolak string kosong", () => {
    expect(parsePetugasKartuQrPayload("")).toBeNull();
    expect(parsePetugasKartuQrPayload("  ")).toBeNull();
  });

  it("normalize menghapus strip", () => {
    expect(normalizeNomorPengenalKey("TK-01-0001")).toBe("tk010001");
  });
});
