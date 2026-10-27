import { describe, expect, it } from "vitest";
import {
  CEK_TUNGGAKAN_PATURUNAN_PATH,
  isCekTunggakanPaturunanPublikAktif,
} from "./cek-tunggakan-publik";

describe("cek-tunggakan-publik", () => {
  it("path publik stabil", () => {
    expect(CEK_TUNGGAKAN_PATURUNAN_PATH).toBe("/cek-tunggakan-paturunan");
  });

  it("toggle membaca angka 0/1", () => {
    expect(isCekTunggakanPaturunanPublikAktif(null)).toBe(false);
    expect(isCekTunggakanPaturunanPublikAktif({ cek_tunggakan_paturunan_publik: 0 })).toBe(false);
    expect(isCekTunggakanPaturunanPublikAktif({ cek_tunggakan_paturunan_publik: 1 })).toBe(true);
  });
});
