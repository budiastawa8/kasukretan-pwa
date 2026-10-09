import { describe, expect, it } from "vitest";
import {
  getNyadaSuggestion,
  hitungNyadaSejak,
  isNyadaOtomatisAktif,
  resolveJenisSetelahLepasNyada,
  tanggalMencapaiBatasNyada,
} from "./nyada-ketentuan";
import { resolvePersenPaturunanIuran } from "./paturunan-hitung";
import type { DesaAdat } from "./types";

const desa = {
  id: "d",
  kode_kabupaten: "01",
  nama_kabupaten: "",
  kode_kecamatan: "01",
  nama_kecamatan: "",
  kode_desa_adat: "0001",
  nama_desa_adat: "",
  jenis_umur_nyada: 65,
  jenis_krama_mipil_id: "nyada",
  nyada_berlaku_mulai: "2026-01-01",
} as DesaAdat;

describe("nyada otomatis", () => {
  it("tanggal ulang tahun ke-batas", () => {
    expect(tanggalMencapaiBatasNyada("1961-03-15", 65)).toBe("2026-03-15");
  });

  it("tanggal Nyada tidak sebelum tanggal berlaku", () => {
    expect(hitungNyadaSejak("1950-05-01", desa)).toBe("2026-01-01");
    expect(hitungNyadaSejak("1961-03-15", desa)).toBe("2026-03-15");
    expect(hitungNyadaSejak(null, desa)).toBeNull();
    expect(hitungNyadaSejak("1961-03-15", { ...desa, nyada_berlaku_mulai: null })).toBeNull();
  });

  it("aktif hanya sejak tanggal berlaku", () => {
    expect(isNyadaOtomatisAktif(desa, "2025-12-31")).toBe(false);
    expect(isNyadaOtomatisAktif(desa, "2026-01-01")).toBe(true);
    expect(isNyadaOtomatisAktif({ ...desa, jenis_krama_mipil_id: null }, "2026-02-01")).toBe(false);
  });

  it("tanpa dialog saran bila tanggal berlaku diatur", () => {
    const params = {
      klasifikasi: "MIPIL" as const,
      jenisMipilId: "biasa",
      pengarepTanggalLahir: "1940-01-01",
      jenisMipilNama: () => "Nyada",
    };
    expect(getNyadaSuggestion({ ...params, desa })).toBeNull();
    expect(getNyadaSuggestion({ ...params, desa: { ...desa, nyada_berlaku_mulai: null } })).not.toBeNull();
  });
});

describe("persen paturunan per iuran", () => {
  const base = { persen: 0, persenSebelumNyada: 100, nyadaSejak: "2026-03-15" };

  it("iuran jatuh tempo sebelum Nyada memakai persen lama", () => {
    expect(resolvePersenPaturunanIuran({ ...base, tanggalTarget: "2026-03-14" })).toBe(100);
  });

  it("iuran belum ditutup saat Nyada ikut 0%", () => {
    expect(resolvePersenPaturunanIuran({ ...base, tanggalTarget: "2026-03-15" })).toBe(0);
    expect(resolvePersenPaturunanIuran({ ...base, tanggalTarget: "2026-06-30" })).toBe(0);
    expect(resolvePersenPaturunanIuran({ ...base, tanggalTarget: null })).toBe(0);
  });

  it("setelah keluar dari Nyada (Ngarep Balu), iuran yang ditutup selama Nyada tetap 0%", () => {
    const balu = {
      persen: 50,
      persenSebelumNyada: 100,
      nyadaSejak: "2026-03-15",
      persenNyada: 0,
      nyadaSampai: "2027-02-01",
    };
    expect(resolvePersenPaturunanIuran({ ...balu, tanggalTarget: "2026-01-10" })).toBe(100);
    expect(resolvePersenPaturunanIuran({ ...balu, tanggalTarget: "2026-12-31" })).toBe(0);
    expect(resolvePersenPaturunanIuran({ ...balu, tanggalTarget: "2027-02-01" })).toBe(50);
    expect(resolvePersenPaturunanIuran({ ...balu, tanggalTarget: null })).toBe(50);
  });

  it("jenis pengganti: Cerai Mati, lalu jenis sebelum Nyada", () => {
    expect(
      resolveJenisSetelahLepasNyada({ jenis_sebelum_nyada_id: "biasa" }, { jenis_cerai_mati_mipil_id: "balu" })
    ).toBe("balu");
    expect(
      resolveJenisSetelahLepasNyada({ jenis_sebelum_nyada_id: "biasa" }, { jenis_cerai_mati_mipil_id: null })
    ).toBe("biasa");
  });

  it("Nyada lama (tanpa tanggal) berlaku untuk semua iuran", () => {
    expect(
      resolvePersenPaturunanIuran({ persen: 0, persenSebelumNyada: null, nyadaSejak: null, tanggalTarget: "2020-01-01" })
    ).toBe(0);
  });
});
