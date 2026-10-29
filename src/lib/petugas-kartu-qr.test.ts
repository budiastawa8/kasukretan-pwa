import { describe, expect, it } from "vitest";
import {
  normalizeNomorPengenalKey,
  parsePetugasKartuQrPayload,
  petugasKartuQrPayload,
} from "./petugas-kartu-qr";

describe("petugas-kartu-qr", () => {
  it("membangun payload dengan prefix petugas", () => {
    expect(petugasKartuQrPayload("001")).toBe("kasukretan:petugas:001");
    expect(petugasKartuQrPayload("TK-12")).toBe("kasukretan:petugas:tk12");
  });

  it("mem-parse payload berprefiks", () => {
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
