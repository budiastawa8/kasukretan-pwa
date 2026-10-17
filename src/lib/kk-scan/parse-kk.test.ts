import { describe, expect, it } from "vitest";
import {
  parseAgamaKk,
  parseJenisKelaminKk,
  parseKkOcrText,
  parseTempatTanggalLahir,
} from "./parse-kk";
import { mapStatusHubunganKk, mapKkMemberToAnggota } from "./map-anggota";

describe("parseTempatTanggalLahir", () => {
  it("mengurai tempat dan tanggal", () => {
    expect(parseTempatTanggalLahir("DENPASAR, 15-06-1985")).toEqual({
      tempat_lahir: "DENPASAR",
      tanggal_lahir: "1985-06-15",
    });
  });

  it("mengurai tanggal saja", () => {
    expect(parseTempatTanggalLahir("01/02/1990")).toEqual({
      tanggal_lahir: "1990-02-01",
    });
  });
});

describe("parseJenisKelaminKk / parseAgamaKk", () => {
  it("mengenali L/P dan agama", () => {
    expect(parseJenisKelaminKk("LAKI-LAKI")).toBe("L");
    expect(parseJenisKelaminKk("Perempuan")).toBe("P");
    expect(parseAgamaKk("HINDU")).toBe("Hindu");
    expect(parseAgamaKk("Islam")).toBe("Islam");
  });
});

describe("parseKkOcrText", () => {
  it("mengurai dua anggota dari teks berlabel", () => {
    const text = `
KARTU KELUARGA
NIK : 5171031506850001
Nama Lengkap : I MADE CONTOH
Jenis Kelamin : LAKI-LAKI
Tempat/Tgl Lahir : DENPASAR, 15-06-1985
Agama : HINDU
Status Perkawinan : KAWIN
Pekerjaan : WIRASWASTA
Status Hubungan Dalam Keluarga : KEPALA KELUARGA
Nama Ayah : I WAYAN AYAH
Nama Ibu : NI MADE IBU

NIK : 5171031506850002
Nama Lengkap : NI KADEK CONTOH
Jenis Kelamin : PEREMPUAN
Tempat/Tgl Lahir : GIANYAR, 20-08-1988
Agama : HINDU
Status Perkawinan : KAWIN
Pekerjaan : IBU RUMAH TANGGA
Status Hubungan Dalam Keluarga : ISTRI
Nama Ayah : I NYOMAN AYAH
Nama Ibu : NI KETUT IBU
`;
    const members = parseKkOcrText(text);
    expect(members).toHaveLength(2);
    expect(members[0]?.nama_lengkap).toBe("I MADE CONTOH");
    expect(members[0]?.nik).toBe("5171031506850001");
    expect(members[0]?.jenis_kelamin).toBe("L");
    expect(members[0]?.tanggal_lahir).toBe("1985-06-15");
    expect(members[0]?.status_hubungan_kk?.toLowerCase()).toContain("kepala");
    expect(members[0]?.selected).toBe(true);
    expect(members[1]?.nama_lengkap).toBe("NI KADEK CONTOH");
    expect(members[1]?.jenis_kelamin).toBe("P");
    expect(members[1]?.status_hubungan_kk?.toLowerCase()).toContain("istri");
  });

  it("menandai pembantu tidak terpilih secara default", () => {
    const text = `
NIK : 5171031506850099
Nama Lengkap : MADE PEMBANTU
Jenis Kelamin : P
Status Hubungan Dalam Keluarga : PEMBANTU RUMAH TANGGA
`;
    const members = parseKkOcrText(text);
    expect(members).toHaveLength(1);
    expect(members[0]?.selected).toBe(false);
  });

  it("mengabaikan No. KK agar tidak jadi Nama/NIK anggota", () => {
    const text = `
KARTU KELUARGA
No. KK : 5171999999999999
5171999999999999
NIK : 5171031506850001
Nama Lengkap : I MADE CONTOH
Jenis Kelamin : LAKI-LAKI
Tempat/Tgl Lahir : DENPASAR, 15-06-1985
Status Hubungan Dalam Keluarga : KEPALA KELUARGA
`;
    const members = parseKkOcrText(text);
    expect(members).toHaveLength(1);
    expect(members[0]?.nama_lengkap).toBe("I MADE CONTOH");
    expect(members[0]?.nik).toBe("5171031506850001");
    expect(members.map((m) => m.nik)).not.toContain("5171999999999999");
    expect(members.some((m) => m.nama_lengkap.includes("5171999999999999"))).toBe(
      false
    );
  });

  it("menolak nama yang hanya nomor 16 digit", () => {
    const text = `
Nama Lengkap : 5171999999999999
NIK : 5171999999999999
`;
    expect(parseKkOcrText(text)).toHaveLength(0);
  });
});

describe("looksLikeKartuKeluarga", () => {
  it("mengenali header KK", async () => {
    const { looksLikeKartuKeluarga } = await import("./parse-kk");
    expect(looksLikeKartuKeluarga("KARTU KELUARGA\nNo. KK : 5171")).toBe(true);
    expect(looksLikeKartuKeluarga("PROVINSI BALI\nNIK 5171\nNama BUDI")).toBe(false);
  });
});

describe("mapStatusHubunganKk", () => {
  it("tidak menjadikan Kepala Keluarga sebagai Pengarep", () => {
    expect(mapStatusHubunganKk("Kepala Keluarga", "L", "MIPIL")).toBe("Suami");
    expect(mapStatusHubunganKk("Kepala Keluarga", "P", "MIPIL")).toBe("Istri");
  });

  it("memetakan orang tua menurut klasifikasi", () => {
    expect(mapStatusHubunganKk("Ayah", "L", "MIPIL")).toBe("Ayah");
    expect(mapStatusHubunganKk("Ayah", "L", "KRAMA_TAMIU")).toBe("Orang Tua");
  });
});

describe("mapKkMemberToAnggota", () => {
  it("mengisi agama Hindu untuk Pipil dan menyimpan NIK", () => {
    const mapped = mapKkMemberToAnggota(
      {
        nik: "5171031506850001",
        nama_lengkap: "I MADE CONTOH",
        jenis_kelamin: "L",
        status_hubungan_kk: "Kepala Keluarga",
        agama: "Islam",
        nama_ayah: "AYAH",
        nama_ibu: "IBU",
        selected: true,
      },
      "MIPIL"
    );
    expect(mapped.agama).toBe("Hindu");
    expect(mapped.nik_atau_nika).toBe("5171031506850001");
    expect(mapped.status_keluarga).toBe("Suami");
    expect(mapped.nama_ayah).toBe("AYAH");
  });

  it("tidak mengisi nama ayah/ibu untuk pemasih", () => {
    const mapped = mapKkMemberToAnggota(
      {
        nik: "5171031506850002",
        nama_lengkap: "BUDI",
        jenis_kelamin: "L",
        agama: "Islam",
        nama_ayah: "AYAH",
        selected: true,
      },
      "TAMIU"
    );
    expect(mapped.agama).toBe("Islam");
    expect(mapped.nama_ayah).toBeUndefined();
  });
});
