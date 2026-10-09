import { describe, expect, it } from "vitest";
import { jenisSebelumCeraiUntukDisimpan, tentukanJenisDariStatusKawin } from "./jenis-cerai";
import type { DesaAdat } from "./types";

const desa = {
  jenis_krama_mipil_id: "nyada",
  jenis_cerai_mati_mipil_id: "balu",
  jenis_cerai_hidup_mipil_id: "nyapihan",
  jenis_dapukan_mipil_id: "dapukan",
} as DesaAdat;

const hitung = (statusKawin: string, jenisId: string, jenisSebelumCeraiId: string | null = null) =>
  tentukanJenisDariStatusKawin({ statusKawin, jenisId, jenisSebelumCeraiId, desa });

describe("tentukanJenisDariStatusKawin", () => {
  it("Cerai Mati → jenis Cerai Mati, ingat jenis lama", () => {
    expect(hitung("cerai_mati", "ngarep")).toEqual({
      jenisId: "balu",
      jenisSebelumCeraiId: "ngarep",
      alasan: "cerai_mati",
    });
  });

  it("Cerai Hidup → jenis Cerai Hidup", () => {
    expect(hitung("Cerai Hidup", "ngarep")?.jenisId).toBe("nyapihan");
  });

  it("pindah Cerai Hidup → Cerai Mati tetap ingat jenis sebelum cerai", () => {
    expect(hitung("cerai_mati", "nyapihan", "ngarep")?.jenisSebelumCeraiId).toBe("ngarep");
  });

  it("kawin lagi → kembali ke jenis sebelumnya", () => {
    expect(hitung("kawin", "balu", "ngarep")).toEqual({
      jenisId: "ngarep",
      jenisSebelumCeraiId: null,
      alasan: "kawin_lagi",
    });
  });

  it("kawin lagi tanpa jenis sebelumnya → tetap", () => {
    expect(hitung("kawin", "balu")).toBeNull();
  });

  it("Nyada dan Dapukan tidak diubah", () => {
    expect(hitung("cerai_mati", "nyada")).toBeNull();
    expect(hitung("cerai_hidup", "dapukan")).toBeNull();
  });

  it("jenis cerai belum diatur di Profil Desa → tetap", () => {
    expect(
      tentukanJenisDariStatusKawin({
        statusKawin: "cerai_mati",
        jenisId: "ngarep",
        jenisSebelumCeraiId: null,
        desa: { ...desa, jenis_cerai_mati_mipil_id: null },
      })
    ).toBeNull();
  });

  it("sudah sesuai → tetap", () => {
    expect(hitung("cerai_mati", "balu", "ngarep")).toBeNull();
  });
});

describe("jenisSebelumCeraiUntukDisimpan", () => {
  it("dikosongkan bila jenis bukan lagi jenis cerai", () => {
    expect(jenisSebelumCeraiUntukDisimpan("ngarep", "x", desa)).toBeNull();
    expect(jenisSebelumCeraiUntukDisimpan("balu", "ngarep", desa)).toBe("ngarep");
  });
});
