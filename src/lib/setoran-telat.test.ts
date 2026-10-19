import { describe, expect, it } from "vitest";
import { hariSejakTanggal, isSetoranTelat } from "./setoran-telat";

describe("setoran-telat", () => {
  it("hariSejakTanggal menghitung selisih kalender", () => {
    expect(hariSejakTanggal("2026-10-17", "2026-10-19")).toBe(2);
    expect(hariSejakTanggal("2026-10-19", "2026-10-19")).toBe(0);
    expect(hariSejakTanggal("2026-10-18", "2026-10-19")).toBe(1);
  });

  it("isSetoranTelat true bila tanggal tertua sebelum hari ini", () => {
    expect(isSetoranTelat("2026-10-18", "2026-10-19")).toBe(true);
    expect(isSetoranTelat("2026-10-19", "2026-10-19")).toBe(false);
    expect(isSetoranTelat("2026-10-17", "2026-10-19")).toBe(true);
  });
});
