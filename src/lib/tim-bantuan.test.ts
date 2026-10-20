import { describe, expect, it } from "vitest";
import {
  isTimBantuanFiturAktif,
  isTimBantuanTipe,
  normalizeTimKasukretanTipe,
  timKasukretanTipeLabel,
} from "./tim-bantuan";

describe("tim-bantuan helpers", () => {
  it("menormalisasi tipe", () => {
    expect(normalizeTimKasukretanTipe("bantuan")).toBe("bantuan");
    expect(normalizeTimKasukretanTipe("banjar")).toBe("banjar");
    expect(normalizeTimKasukretanTipe(null)).toBe("banjar");
    expect(isTimBantuanTipe("bantuan")).toBe(true);
    expect(isTimBantuanTipe("banjar")).toBe(false);
  });

  it("cek flag desa", () => {
    expect(isTimBantuanFiturAktif({ tim_bantuan_aktif: 1 })).toBe(true);
    expect(isTimBantuanFiturAktif({ tim_bantuan_aktif: 0 })).toBe(false);
    expect(isTimBantuanFiturAktif(null)).toBe(false);
  });

  it("label tipe", () => {
    expect(timKasukretanTipeLabel("bantuan")).toBe("Tim Bantuan");
    expect(timKasukretanTipeLabel("banjar")).toBe("Tim Banjar");
  });
});
