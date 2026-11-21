import { describe, expect, it } from "vitest";
import {
  isBatasUmurDapukanTidakValid,
  keadaanKeluargaDapukan,
  pilihJenisNyadaDapukan,
  tentukanNyadaOtomatis,
  type KeadaanKeluargaDapukan,
} from "./dapukan-ketentuan";
import { isKramaNyada } from "./nyada-ketentuan";
import type { DesaAdat } from "./types";

const desa: DesaAdat = {
  id: "d",
  kode_kabupaten: "",
  nama_kabupaten: "",
  kode_kecamatan: "",
  nama_kecamatan: "",
  kode_desa_adat: "",
  nama_desa_adat: "",
  jenis_umur_nyada: 65,
  nyada_berlaku_mulai: "2026-01-01",
  jenis_krama_mipil_id: "nyada",
  krama_dapukan_aktif: 1,
  krama_dapukan_berlaku_mulai: "2026-01-01",
  batas_umur_dapukan: 70,
  jenis_dapukan_mipil_id: "dapukan",
  jenis_balu_dapukan_mipil_id: null,
  jenis_balu_nglintik_mipil_id: "nglintik",
  jenis_balu_ngempu_mipil_id: "ngempu",
};

const keluarga = (k: Partial<KeadaanKeluargaDapukan>): KeadaanKeluargaDapukan => ({
  adaAnakBelumKawin: false,
  adaPasangan: true,
  sendirian: false,
  ...k,
});

const hariIni = "2026-09-30";

describe("keadaanKeluargaDapukan", () => {
  it("hanya status Anak dengan Belum Kawin yang dihitung", () => {
    const k = keadaanKeluargaDapukan(
      [
        { penduduk_id: "p", status_keluarga: "Suami", status_kawin: "kawin" },
        { penduduk_id: "i", status_keluarga: "Istri", status_kawin: "kawin" },
        { penduduk_id: "c", status_keluarga: "Cucu", status_kawin: "belum_kawin" },
        { penduduk_id: "a", status_keluarga: "Anak", status_kawin: "Kawin" },
      ],
      "p"
    );
    expect(k).toEqual({ adaAnakBelumKawin: false, adaPasangan: true, sendirian: false });
    expect(
      keadaanKeluargaDapukan(
        [{ penduduk_id: "a", status_keluarga: "Anak", status_kawin: "Belum Kawin" }],
        "p"
      ).adaAnakBelumKawin
    ).toBe(true);
  });
});

describe("pilihJenisNyadaDapukan", () => {
  it("Kawin → Nyada Jangkep", () => {
    expect(pilihJenisNyadaDapukan(keluarga({}), desa, "selesai")).toBe("nyada");
    expect(pilihJenisNyadaDapukan(keluarga({ adaAnakBelumKawin: true }), desa, "lewat_umur")).toBe(
      "nyada"
    );
  });

  it("Cerai Dapukan selesai → Balu Nglintik", () => {
    expect(
      pilihJenisNyadaDapukan(keluarga({ adaPasangan: false, sendirian: false }), desa, "selesai")
    ).toBe("nglintik");
  });

  it("Cerai lewat umur → Balu Ngempu", () => {
    expect(
      pilihJenisNyadaDapukan(
        keluarga({ adaPasangan: false, adaAnakBelumKawin: true }),
        desa,
        "lewat_umur"
      )
    ).toBe("ngempu");
  });
});

describe("isKramaNyada", () => {
  it("mencakup Jangkep, Nglintik, dan Ngempu", () => {
    expect(isKramaNyada("nyada", desa)).toBe(true);
    expect(isKramaNyada("nglintik", desa)).toBe(true);
    expect(isKramaNyada("ngempu", desa)).toBe(true);
    expect(isKramaNyada("dapukan", desa)).toBe(false);
  });
});

describe("tentukanNyadaOtomatis", () => {
  const base = { jenisId: "biasa", pengarepTanggalLahir: "1961-03-15", desa, hariIni };

  it("usia Nyada dengan Anak belum kawin menjadi Dapukan", () => {
    expect(tentukanNyadaOtomatis({ ...base, keluarga: keluarga({ adaAnakBelumKawin: true }) })).toEqual({
      aksi: "dapukan",
      jenisId: "dapukan",
      sejak: "2026-03-15",
      dapukanBatas: "2031-03-15",
      tanpaPasangan: false,
    });
  });

  it("usia Nyada tanpa pasangan tetap Dapukan (bukan jenis terpisah)", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        keluarga: keluarga({ adaAnakBelumKawin: true, adaPasangan: false }),
      })
    ).toEqual({
      aksi: "dapukan",
      jenisId: "dapukan",
      sejak: "2026-03-15",
      dapukanBatas: "2031-03-15",
      tanpaPasangan: true,
    });
  });

  it("tanpa Anak belum kawin langsung Nyada", () => {
    expect(tentukanNyadaOtomatis({ ...base, keluarga: keluarga({}) })).toMatchObject({
      aksi: "nyada",
      jenisId: "nyada",
      alasan: "umur",
    });
  });

  it("toggle mati: langsung Nyada walau Anak belum kawin", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        desa: { ...desa, krama_dapukan_aktif: 0 },
        keluarga: keluarga({ adaAnakBelumKawin: true }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "nyada" });
  });

  it("usia Nyada sebelum tanggal mulai Dapukan tetap Nyada", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        desa: { ...desa, krama_dapukan_berlaku_mulai: "2026-06-01" },
        keluarga: keluarga({ adaAnakBelumKawin: true }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "nyada" });
  });

  it("Dapukan selesai + Kawin → Nyada Jangkep", () => {
    expect(
      tentukanNyadaOtomatis({ ...base, jenisId: "dapukan", keluarga: keluarga({}) })
    ).toMatchObject({ aksi: "nyada", jenisId: "nyada", sejak: hariIni, alasan: "dapukan" });
  });

  it("Dapukan selesai + Cerai (ada anggota lain) → Balu Nglintik", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "dapukan",
        keluarga: keluarga({ adaPasangan: false, sendirian: false }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "nglintik" });
  });

  it("Dapukan selesai + Cerai sendirian → Balu Nglintik", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "dapukan",
        pengarepTanggalLahir: "1980-01-01",
        keluarga: keluarga({ adaPasangan: false, sendirian: true }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "nglintik" });
  });

  it("lewat umur Dapukan + Kawin → Nyada Jangkep", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "dapukan",
        dapukanBatas: "2026-08-01",
        keluarga: keluarga({ adaAnakBelumKawin: true }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "nyada", sejak: "2026-08-01" });
  });

  it("lewat umur Dapukan + Cerai → Balu Ngempu", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "dapukan",
        dapukanBatas: "2026-08-01",
        keluarga: keluarga({ adaAnakBelumKawin: true, adaPasangan: false }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "ngempu", sejak: "2026-08-01" });
  });

  it("pasangan Pengarep Dapukan meninggal: tetap Dapukan dengan batas umur semula", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "dapukan",
        dapukanBatas: "2031-03-15",
        keluarga: keluarga({ adaAnakBelumKawin: true, adaPasangan: false }),
      })
    ).toEqual({ aksi: "tetap", dapukanBatas: "2031-03-15", tanpaPasangan: true });
  });

  it("warisan Balu Dapukan disamakan ke Dapukan", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "balu-lama",
        dapukanBatas: "2031-03-15",
        desa: { ...desa, jenis_balu_dapukan_mipil_id: "balu-lama" },
        keluarga: keluarga({ adaAnakBelumKawin: true, adaPasangan: false }),
      })
    ).toEqual({
      aksi: "dapukan",
      jenisId: "dapukan",
      sejak: hariIni,
      dapukanBatas: "2031-03-15",
      tanpaPasangan: true,
    });
  });

  it("Ngempu → anak terakhir kawin → Balu Nglintik", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "ngempu",
        keluarga: keluarga({ adaPasangan: false, adaAnakBelumKawin: false }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "nglintik" });
  });

  it("Nglintik tetap Nglintik meski tidak sendirian (masih Pengarep)", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "nglintik",
        keluarga: keluarga({ adaPasangan: false, sendirian: false }),
      })
    ).toEqual({ aksi: "tetap" });
  });

  it("Jangkep Cerai dengan Anak belum kawin → Ngempu", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "nyada",
        keluarga: keluarga({ adaPasangan: false, adaAnakBelumKawin: true }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "ngempu" });
  });

  it("Nyada tanpa pasangan tanpa Anak belum kawin → Nglintik", () => {
    expect(
      tentukanNyadaOtomatis({
        ...base,
        jenisId: "nyada",
        keluarga: keluarga({ adaPasangan: false, sendirian: true }),
      })
    ).toMatchObject({ aksi: "nyada", jenisId: "nglintik" });
  });
});

describe("isBatasUmurDapukanTidakValid", () => {
  it("valid jika Dapukan lebih besar dari Nyada", () => {
    expect(isBatasUmurDapukanTidakValid(65, 70)).toBe(false);
    expect(isBatasUmurDapukanTidakValid("65", "70")).toBe(false);
  });

  it("invalid jika Dapukan lebih kecil atau sama dengan Nyada", () => {
    expect(isBatasUmurDapukanTidakValid(65, 60)).toBe(true);
    expect(isBatasUmurDapukanTidakValid(65, 65)).toBe(true);
  });

  it("valid jika Dapukan kosong (tanpa batas)", () => {
    expect(isBatasUmurDapukanTidakValid(65, null)).toBe(false);
    expect(isBatasUmurDapukanTidakValid(65, "")).toBe(false);
  });
});
