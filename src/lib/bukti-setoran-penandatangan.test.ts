import { describe, expect, it } from "vitest";
import { bendaharaTimOrPatengen } from "./bukti-setoran-dudukan-pdf";

describe("bendaharaTimOrPatengen", () => {
  const desa = {
    patengen_nama: "Ni Made Patengen",
    patengen_jabatan: "Patengen",
  };

  it("memakai Bendahara Tim jika nama ada", () => {
    expect(
      bendaharaTimOrPatengen(
        { nama: "I Ketut Bendahara", jabatan: "Bendahara Tim" },
        desa
      )
    ).toEqual({ nama: "I Ketut Bendahara", jabatan: "Bendahara Tim" });
  });

  it("jatuh ke Patengen jika Bendahara Tim kosong", () => {
    expect(bendaharaTimOrPatengen(null, desa)).toEqual({
      nama: "Ni Made Patengen",
      jabatan: "Patengen",
    });
    expect(
      bendaharaTimOrPatengen({ nama: "   ", jabatan: "Bendahara Tim" }, desa)
    ).toEqual({
      nama: "Ni Made Patengen",
      jabatan: "Patengen",
    });
  });

  it("default jabatan Patengen jika profil jabatan kosong", () => {
    expect(
      bendaharaTimOrPatengen(null, { patengen_nama: "Komang", patengen_jabatan: "" })
    ).toEqual({ nama: "Komang", jabatan: "Patengen" });
  });
});
