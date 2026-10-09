import { describe, expect, it } from "vitest";
import { sortTableRows } from "./table-sort";

type Row = { nomor: string; nama: string; jumlah: number };

const accessors = {
  nomor: (r: Row) => r.nomor,
  nama: (r: Row) => r.nama,
  jumlah: (r: Row) => r.jumlah,
};

const sample: Row[] = [
  { nomor: "0103", nama: "Citra", jumlah: 100 },
  { nomor: "0101", nama: "Budi", jumlah: 50 },
  { nomor: "0102", nama: "Ani", jumlah: 200 },
];

describe("sortTableRows", () => {
  it("mengembalikan urutan asli bila sortKey null", () => {
    expect(sortTableRows(sample, null, "asc", accessors)).toEqual(sample);
  });

  it("mengurutkan nama A-Z", () => {
    expect(sortTableRows(sample, "nama", "asc", accessors).map((r) => r.nama)).toEqual([
      "Ani",
      "Budi",
      "Citra",
    ]);
  });

  it("mengurutkan nama Z-A", () => {
    expect(sortTableRows(sample, "nama", "desc", accessors).map((r) => r.nama)).toEqual([
      "Citra",
      "Budi",
      "Ani",
    ]);
  });

  it("mengurutkan angka", () => {
    expect(sortTableRows(sample, "jumlah", "asc", accessors).map((r) => r.jumlah)).toEqual([
      50, 100, 200,
    ]);
  });
});
