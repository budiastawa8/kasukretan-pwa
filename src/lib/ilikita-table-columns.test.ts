import { describe, expect, it } from "vitest";
import {
  ILIKITA_TABLE_FIXED_ROWS,
  buildIlikitaAnggotaTablePages,
} from "./ilikita-table-columns";
import type { AnggotaKeluarga } from "./types";

function fakeAnggota(i: number): AnggotaKeluarga {
  return {
    anggota_id: `a-${i}`,
    nama_lengkap: `Nama ${i}`,
    jenis_kelamin: "L",
  } as AnggotaKeluarga;
}

describe("buildIlikitaAnggotaTablePages", () => {
  it("mengisi 8 baris kosong jika tidak ada anggota", () => {
    const pages = buildIlikitaAnggotaTablePages([]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(ILIKITA_TABLE_FIXED_ROWS);
    expect(pages[0]!.every((r) => r === null)).toBe(true);
  });

  it("memad baris kosong jika anggota kurang dari 8", () => {
    const pages = buildIlikitaAnggotaTablePages([fakeAnggota(0), fakeAnggota(1)]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(8);
    expect(pages[0]![0]?.absIndex).toBe(0);
    expect(pages[0]![1]?.absIndex).toBe(1);
    expect(pages[0]!.slice(2).every((r) => r === null)).toBe(true);
  });

  it("membuat halaman lanjutan jika melebihi 8", () => {
    const anggota = Array.from({ length: 10 }, (_, i) => fakeAnggota(i));
    const pages = buildIlikitaAnggotaTablePages(anggota);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(8);
    expect(pages[0]!.every((r) => r !== null)).toBe(true);
    expect(pages[1]).toHaveLength(8);
    expect(pages[1]![0]?.absIndex).toBe(8);
    expect(pages[1]![1]?.absIndex).toBe(9);
    expect(pages[1]!.slice(2).every((r) => r === null)).toBe(true);
  });
});
