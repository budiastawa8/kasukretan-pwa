import { describe, expect, it } from "vitest";
import { looksLikeKtp, parseKtpOcrText } from "./parse-ktp";

const SAMPLE_KTP = `
PROVINSI BALI
KABUPATEN JEMBRANA
NIK : 5101010101900008
Nama : I KOMANG ARIANTANA
Tempat/Tgl Lahir : TEGALBADENG BARAT, 05-01-1999
Jenis kelamin : LAKI-LAKI    Gol. Darah : -
Alamat : BANJAR ANYAR
RT/RW : 000/000
Kel/Desa : TEGALBADENG BARAT
Kecamatan : NEGARA
Agama : HINDU
Status Perkawinan : KAWIN
Pekerjaan : BURUH HARIAN LEPAS
Kewarganegaraan : WNI
Berlaku Hingga : SEUMUR HIDUP
`;

const SAMPLE_PEREMPUAN = `
PROVINSI BALI
KABUPATEN JEMBRANA
NIK 5101015912780004
Nama NI KADE ALIT WIRATNING
Tempat/Tgl Lahir BALUK, 19-12-1978
Jenis kelamin PEREMPUAN Gol. Darah -
Agama HINDU
Status Perkawinan KAWIN
Pekerjaan PETANI/PEKEBUN
`;

describe("looksLikeKtp", () => {
  it("mengenali teks KTP", () => {
    expect(looksLikeKtp(SAMPLE_KTP)).toBe(true);
  });

  it("menolak teks KK khas", () => {
    expect(
      looksLikeKtp("KARTU KELUARGA\nNo. KK : 5171999999999999\nStatus Hubungan dalam Keluarga")
    ).toBe(false);
  });
});

describe("parseKtpOcrText", () => {
  it("membaca NIK, nama, L/P, agama, tanggal", () => {
    const p = parseKtpOcrText(SAMPLE_KTP);
    expect(p).not.toBeNull();
    expect(p!.nik).toBe("5101010101900008");
    expect(p!.nama_lengkap).toMatch(/KOMANG/i);
    expect(p!.jenis_kelamin).toBe("L");
    expect(p!.agama).toBe("Hindu");
    expect(p!.tanggal_lahir).toBe("1999-01-05");
    expect(p!.tempat_lahir).toMatch(/TEGALBADENG/i);
    expect(p!.status_kawin).toBe("kawin");
  });

  it("membaca KTP perempuan", () => {
    const p = parseKtpOcrText(SAMPLE_PEREMPUAN);
    expect(p).not.toBeNull();
    expect(p!.jenis_kelamin).toBe("P");
    expect(p!.nik).toBe("5101015912780004");
    expect(p!.agama).toBe("Hindu");
    expect(p!.tanggal_lahir).toBe("1978-12-19");
  });
});
