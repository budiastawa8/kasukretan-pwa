import { describe, expect, it } from "vitest";
import {
  isStatusKeluargaAnak,
  resolveAnakParentNamesFromPipil,
} from "./status-keluarga";

describe("resolveAnakParentNamesFromPipil", () => {
  it("mengambil nama dari Istri dan Suami", () => {
    expect(
      resolveAnakParentNamesFromPipil([
        { nama_lengkap: "I Wayan Suami", status_keluarga: "Suami" },
        { nama_lengkap: "Ni Made Istri", status_keluarga: "Istri" },
        { nama_lengkap: "I Putu Anak", status_keluarga: "Anak" },
      ])
    ).toEqual({ namaIbu: "Ni Made Istri", namaAyah: "I Wayan Suami" });
  });

  it("mengecualikan anggota yang sedang diedit", () => {
    expect(
      resolveAnakParentNamesFromPipil(
        [
          { nama_lengkap: "I Wayan Suami", status_keluarga: "Suami" },
          { nama_lengkap: "I Putu Anak", status_keluarga: "Anak" },
        ],
        { excludeNama: "I Putu Anak" }
      )
    ).toEqual({ namaIbu: "", namaAyah: "I Wayan Suami" });
  });

  it("mengembalikan kosong jika tidak ada Istri/Suami", () => {
    expect(
      resolveAnakParentNamesFromPipil([{ nama_lengkap: "Pengarep", status_keluarga: "Pengarep" }])
    ).toEqual({ namaIbu: "", namaAyah: "" });
  });
});

describe("isStatusKeluargaAnak", () => {
  it("mengenali Anak case-insensitive", () => {
    expect(isStatusKeluargaAnak("Anak")).toBe(true);
    expect(isStatusKeluargaAnak(" anak ")).toBe(true);
    expect(isStatusKeluargaAnak("Istri")).toBe(false);
  });
});
