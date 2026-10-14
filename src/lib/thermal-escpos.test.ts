import { describe, expect, it } from "vitest";
import { buildEscPosReceipt, escPosAscii } from "./thermal-escpos";
import { buildStrukThermalContent } from "./struk-thermal-content";

describe("escPosAscii", () => {
  it("mengganti titik tengah, huruf beraksen, dan tanda kutip tipografis", () => {
    expect(escPosAscii("Banjar Kaja · Tempek Kelod · Arahan 1")).toBe(
      "Banjar Kaja - Tempek Kelod - Arahan 1"
    );
    expect(escPosAscii("Café — “Puri”")).toBe('Cafe - "Puri"');
  });
});

describe("buildEscPosReceipt", () => {
  it("hanya mengirim byte ASCII ke printer", () => {
    const content = buildStrukThermalContent(
      {
        kind: "paturunan",
        payload: {
          filename: "struk",
          iuranNama: "Piodalan 2026",
          krama: {
            nomor_kartu: "02130216010001",
            kepala_nama: "I Wayan Sukré",
            banjar_nama: "Kaja",
            jenis_nama: "Krama Ngarep Jangkep",
            tempek_nama: "Tempek Kelod",
            arahan_nama: "Arahan 1",
          },
          wajib: 50000,
          punia: 10000,
          total: 60000,
          tanggal: "2026-10-14",
          petugasNama: "Made Petugas",
        },
        backTo: "/pungut",
        backLabel: "Pengumpulan",
      },
      "Desa Adat Contoh"
    );
    const bytes = buildEscPosReceipt(content, 58);
    expect(Array.from(bytes).filter((b) => b > 0x7f)).toEqual([]);
  });
});
