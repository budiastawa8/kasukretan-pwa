import { describe, expect, it } from "vitest";
import { formatNika, resolveNextNikaSlot, resolveNikaForNewAnggota } from "./penomoran";

describe("resolveNextNikaSlot", () => {
  const kartu = "51030001000101";

  it("memakai urut setelah startAfterUrut", () => {
    expect(resolveNextNikaSlot(kartu, 3, [])).toEqual({
      nika: formatNika(kartu, 4),
      urut: 4,
    });
  });

  it("melewati NIKA yang sudah dipakai (anggota nonaktif/keluar)", () => {
    const nika02 = formatNika(kartu, 2);
    expect(resolveNextNikaSlot(kartu, 1, [nika02])).toEqual({
      nika: formatNika(kartu, 3),
      urut: 3,
    });
  });

  it("menghindari bentrok saat slot urut sudah di-reserve keluar resmi", () => {
    const nika01 = formatNika(kartu, 1);
    const nika02 = formatNika(kartu, 2);
    expect(resolveNextNikaSlot(kartu, 2, [nika01, nika02])).toEqual({
      nika: formatNika(kartu, 3),
      urut: 3,
    });
  });

  it("melewati slot urut yang sudah terisi", () => {
    const nika01 = formatNika(kartu, 1);
    expect(resolveNextNikaSlot(kartu, 0, [nika01])).toEqual({
      nika: formatNika(kartu, 2),
      urut: 2,
    });
  });

  it("normalisasi dash pada NIKA yang sudah ada", () => {
    const plain = formatNika(kartu, 1);
    const dashed = plain.replace(/^(\d{2})(\d)/, "$1-$2");
    expect(resolveNextNikaSlot(kartu, 0, [dashed])).toEqual({
      nika: formatNika(kartu, 2),
      urut: 2,
    });
  });
});

describe("resolveNikaForNewAnggota", () => {
  const kartu = "51030001000101";

  it("anggota ke-3 aktif mendapat suffix 03", () => {
    expect(resolveNikaForNewAnggota(kartu, 2, [])).toEqual({
      nika: formatNika(kartu, 3),
      urut: 3,
    });
  });

  it("melewati NIKA reserve keluar resmi ke slot berikutnya", () => {
    const nika03 = formatNika(kartu, 3);
    expect(resolveNikaForNewAnggota(kartu, 2, [nika03])).toEqual({
      nika: formatNika(kartu, 4),
      urut: 4,
    });
  });

  it("slot dilepas hapus manual dapat dipakai lagi", () => {
    expect(resolveNikaForNewAnggota(kartu, 2, [])).toEqual({
      nika: formatNika(kartu, 3),
      urut: 3,
    });
  });
});
