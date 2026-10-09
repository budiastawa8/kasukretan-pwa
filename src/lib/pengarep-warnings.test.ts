import { describe, expect, it } from "vitest";
import { getPengarepWarnings } from "./pengarep-warnings";
import { STATUS_KAWIN_KODE } from "./status-kawin";

const ketentuan = {
  batasUmurNyada: 60,
  jenisNyadaId: "jenis-nyada",
  jenisCeraiMatiId: "jenis-cerai-mati",
  jenisCeraiHidupId: "jenis-cerai-hidup",
};

const jenisNama = (id: string | null | undefined) => {
  if (id === "jenis-nyada") return "Nyada";
  if (id === "jenis-cerai-mati") return "Cerai Mati";
  if (id === "jenis-cerai-hidup") return "Cerai Hidup";
  return undefined;
};

describe("getPengarepWarnings", () => {
  it("menampilkan peringatan cerai mati jika jenis belum dipetakan", () => {
    const warnings = getPengarepWarnings({
      klasifikasi: "MIPIL",
      statusKawin: STATUS_KAWIN_KODE.CERAI_MATI,
      jenisMipilId: "jenis-lain",
      ketentuan,
      jenisNama,
    });
    expect(warnings.some((w) => w.includes("Cerai Mati"))).toBe(true);
  });

  it("tidak menampilkan peringatan cerai mati/hidup jika jenis sudah Nyada", () => {
    const warnings = getPengarepWarnings({
      klasifikasi: "MIPIL",
      statusKawin: STATUS_KAWIN_KODE.CERAI_MATI,
      jenisMipilId: "jenis-nyada",
      ketentuan,
      jenisNama,
    });
    expect(warnings.some((w) => w.includes("Cerai Mati"))).toBe(false);
    expect(warnings.some((w) => w.includes("Cerai Hidup"))).toBe(false);
  });

  it("tetap menampilkan peringatan belum kawin meski jenis Nyada", () => {
    const warnings = getPengarepWarnings({
      klasifikasi: "MIPIL",
      statusKawin: STATUS_KAWIN_KODE.BELUM_KAWIN,
      jenisMipilId: "jenis-nyada",
      ketentuan,
      jenisNama,
    });
    expect(warnings.some((w) => w.includes("Belum Kawin"))).toBe(true);
  });
});
