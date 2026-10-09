import { describe, expect, it } from "vitest";
import {
  alokasiPembayaranBaru,
  hitungSisaPaturunan,
  hitungTagihanPaturunan,
  isLunasPaturunan,
  statusBayarPaturunan,
} from "./paturunan-hitung";
import {
  hitungSisaDudukan,
  hitungTagihanDudukan,
  isDudukanBerlakuUntukPeriode,
  mulaiDudukanDariTanggal,
  pakaiAturanHariTungguDudukan,
  tanggalMulaiPungutDudukan,
} from "./dudukan-hitung";

describe("paturunan-hitung", () => {
  it("menghitung tagihan dari persen", () => {
    expect(hitungTagihanPaturunan(100_000, 50)).toBe(50_000);
    expect(hitungTagihanPaturunan(100_000, 0)).toBe(0);
  });

  it("menghitung sisa wajib", () => {
    expect(hitungSisaPaturunan(100_000, 40_000)).toBe(60_000);
  });

  it("mengalokasi pembayaran ke wajib dan punia", () => {
    expect(alokasiPembayaranBaru(100_000, 0, 150_000)).toEqual({
      wajib: 100_000,
      punia: 50_000,
    });
    expect(alokasiPembayaranBaru(0, 0, 25_000)).toEqual({ wajib: 0, punia: 25_000 });
  });

  it("status lunas dengan punia", () => {
    expect(statusBayarPaturunan(100_000, 100_000, 10_000)).toBe("lunas_punia");
    expect(isLunasPaturunan(100_000, 100_000)).toBe(true);
  });
});

describe("dudukan-hitung", () => {
  it("menghitung tagihan bulanan", () => {
    expect(hitungTagihanDudukan(75_000)).toBe(75_000);
  });

  it("menghitung sisa setelah pembayaran dan keringanan", () => {
    expect(hitungSisaDudukan(100_000, 60_000, 10_000)).toBe(30_000);
    expect(hitungSisaDudukan(100_000, 100_000, 0)).toBe(0);
  });

  it("aturan lama: bulan pertama tagihan = bulan berikutnya setelah pencatatan", () => {
    expect(mulaiDudukanDariTanggal("2025-01-15")).toEqual({ tahun: 2025, bulan: 2 });
    expect(mulaiDudukanDariTanggal("2026-05-31")).toEqual({ tahun: 2026, bulan: 6 });
    expect(tanggalMulaiPungutDudukan("2025-12-10")).toBe("2026-01-01");
    expect(pakaiAturanHariTungguDudukan("2026-05-31")).toBe(false);
    expect(isDudukanBerlakuUntukPeriode("2025-03-08", 2025, 3)).toBe(false);
    expect(isDudukanBerlakuUntukPeriode("2025-03-08", 2025, 4)).toBe(true);
  });

  it("aturan baru: bulan pertama dari pencatatan + 7 hari (dari Juni 2026)", () => {
    expect(pakaiAturanHariTungguDudukan("2026-06-01")).toBe(true);
    expect(mulaiDudukanDariTanggal("2026-06-01")).toEqual({ tahun: 2026, bulan: 6 });
    expect(mulaiDudukanDariTanggal("2026-06-28")).toEqual({ tahun: 2026, bulan: 7 });
    expect(tanggalMulaiPungutDudukan("2026-06-01")).toBe("2026-06-08");
  });
});
