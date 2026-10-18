import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildBuktiSetoranJenisSections,
  buildBuktiSetoranPdfBytes,
  countKramaPerSumber,
  mergeSetoranItemsByKramaHari,
  namaFileBuktiSetoran,
  nomorBuktiSetoran,
} from "./bukti-setoran-petugas-pdf";
import type { PembayaranSetoranItem, SetoranRow } from "./services/setoran";

const setoran: SetoranRow = {
  id: "3f2a9c1e-77aa-4c1b-9e0d-1234567890ab",
  petugas_id: "t1",
  petugas_nama: "I Made Petugas",
  tanggal: "2026-10-14",
  total: 0,
  keterangan: "Setoran banjar Kaja",
  diterima_oleh_nama: "Ni Luh Bendahara",
  jumlah_transaksi: 0,
  created_at: "2026-10-14 08:00:00",
};

function item(
  i: number,
  sumber: PembayaranSetoranItem["sumber"],
  overrides: Partial<PembayaranSetoranItem> = {}
): PembayaranSetoranItem {
  return {
    sumber,
    id: `p${i}`,
    tanggal: "2026-10-10",
    jumlah: 25000,
    nomor_kartu: `0213021601${String(i).padStart(4, "0")}`,
    kepala_nama: `I Wayan Krama Nomor ${i}`,
    uraian: sumber === "paturunan" ? "Paturunan Piodalan · 2026" : "Dudukan 10/2026",
    akun_nama: null,
    petugas_id: "t1",
    created_at: "2026-10-10 09:00:00",
    ...overrides,
  };
}

async function jumlahHalaman(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

describe("bukti setoran PDF", () => {
  it("membuat satu halaman untuk setoran pendek", async () => {
    const bytes = await buildBuktiSetoranPdfBytes({
      setoran,
      items: [item(1, "paturunan"), item(2, "dudukan")],
      desa: null,
      petugasJabatan: "Kelian",
    });
    expect(await jumlahHalaman(bytes)).toBe(1);
  });

  it("menyambung tabel ke halaman berikutnya untuk setoran panjang", async () => {
    const items = Array.from({ length: 80 }, (_, i) => item(i + 1, i % 2 ? "dudukan" : "paturunan"));
    const bytes = await buildBuktiSetoranPdfBytes({ setoran, items, desa: null });
    expect(await jumlahHalaman(bytes)).toBeGreaterThan(1);
  });

  it("memberi nomor dan nama file yang stabil", () => {
    expect(nomorBuktiSetoran(setoran.id)).toBe("STR-3F2A9C1E");
    expect(namaFileBuktiSetoran(setoran)).toBe("bukti-setoran-2026-10-14-i-made-petugas.pdf");
  });

  it("menggabungkan jumlah dan uraian krama yang sama di hari yang sama", () => {
    const merged = mergeSetoranItemsByKramaHari([
      item(1, "dudukan", {
        nomor_kartu: "0213021601001",
        kepala_nama: "I Wayan",
        uraian: "Dudukan 09/2026",
        jumlah: 10000,
      }),
      item(2, "dudukan", {
        nomor_kartu: "0213021601001",
        kepala_nama: "I Wayan",
        uraian: "Dudukan 10/2026",
        jumlah: 15000,
      }),
      item(3, "dudukan", {
        nomor_kartu: "0213021601001",
        kepala_nama: "I Wayan",
        uraian: "Dudukan 09/2026",
        jumlah: 5000,
        tanggal: "2026-10-11",
      }),
    ]);
    expect(merged).toHaveLength(2);
    const hari10 = merged.find((l) => l.tanggal === "2026-10-10");
    expect(hari10).toMatchObject({
      nomor_kartu: "0213021601001",
      jumlah: 25000,
      uraian: "Dudukan 09/2026 · Dudukan 10/2026",
    });
    expect(merged.find((l) => l.tanggal === "2026-10-11")?.jumlah).toBe(5000);
  });

  it("menghitung jumlah krama unik per jenis penerimaan", () => {
    expect(
      countKramaPerSumber([
        item(1, "dudukan", { nomor_kartu: "A" }),
        item(2, "dudukan", { nomor_kartu: "A" }),
        item(3, "dudukan", { nomor_kartu: "B" }),
        item(4, "paturunan", { nomor_kartu: "A" }),
        item(5, "paturunan", { nomor_kartu: "C" }),
      ])
    ).toEqual({ dudukan: 2, paturunan: 2 });
  });

  it("mengelompokkan section jenis lalu tanggal", () => {
    const sections = buildBuktiSetoranJenisSections([
      item(1, "paturunan", { tanggal: "2026-10-12", nomor_kartu: "P1" }),
      item(2, "dudukan", { tanggal: "2026-10-11", nomor_kartu: "D1" }),
      item(3, "dudukan", { tanggal: "2026-10-10", nomor_kartu: "D2" }),
      item(4, "paturunan", { tanggal: "2026-10-11", nomor_kartu: "P2" }),
    ]);
    expect(sections.map((s) => s.sumber)).toEqual(["dudukan", "paturunan"]);
    expect(sections[0]!.jumlahKrama).toBe(2);
    expect(sections[0]!.tanggalGroups.map((g) => g.tanggal)).toEqual(["2026-10-10", "2026-10-11"]);
    expect(sections[1]!.tanggalGroups.map((g) => g.tanggal)).toEqual(["2026-10-11", "2026-10-12"]);
  });
});
