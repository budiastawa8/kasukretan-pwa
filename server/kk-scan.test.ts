import { describe, expect, it } from "vitest";
import { normalizeKkScanMembers } from "./kk-scan";

describe("normalizeKkScanMembers", () => {
  it("membersihkan desa dari nama dan menolak nomor palsu", () => {
    const members = normalizeKkScanMembers({
      members: [
        {
          nama_lengkap: "I MADE CONTOH Desa/Kelurahan Ubud",
          nik: "5171031506850001",
          jenis_kelamin: "Laki-laki",
          tanggal_lahir: "15/06/1985",
          status_hubungan_kk: "Kepala Keluarga",
          selected: true,
        },
        {
          nama_lengkap: "5171999999999999",
          nik: "5171999999999999",
        },
        {
          nama_lengkap: "NI KADEK",
          nik: "5171031506850002",
          jenis_kelamin: "P",
          status_hubungan_kk: "Istri",
        },
      ],
    });
    expect(members).toHaveLength(2);
    expect(members[0]?.nama_lengkap).toBe("I MADE CONTOH");
    expect(members[0]?.jenis_kelamin).toBe("L");
    expect(members[0]?.tanggal_lahir).toBe("1985-06-15");
    expect(members[1]?.nama_lengkap).toBe("NI KADEK");
  });

  it("menormalisasi agama ke opsi form Pemasih", () => {
    const members = normalizeKkScanMembers({
      members: [
        {
          nama_lengkap: "BUDI",
          nik: "5171031506850001",
          agama: "ISLAM",
          selected: true,
        },
        {
          nama_lengkap: "WAYAN",
          nik: "5171031506850002",
          agama: "HINDU",
          selected: true,
        },
        {
          nama_lengkap: "ANA",
          nik: "5171031506850003",
          agama: "Katolik",
          selected: true,
        },
      ],
    });
    expect(members[0]?.agama).toBe("Islam");
    expect(members[1]?.agama).toBe("Hindu");
    expect(members[2]?.agama).toBe("Katholik");
  });
});
