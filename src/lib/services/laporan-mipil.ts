import { formatStatusIlikitaEfektif, statusIlikitaEfektif } from "../status-ilikita";
import type { KlasifikasiKode, KramaListItem } from "../types";
import { compareBanjarKode, sortKramaByWilayah } from "../wilayah-order";
import { listKrama } from "./krama";
import { getPaturunanRingkasan } from "./paturunan";

export type LaporanMipilFilter = {
  banjarId?: string;
  tempekId?: string;
  arahanId?: string;
  jenisMipilId?: string;
  jenisMipilNama?: string;
  statusPipil?: "aktif" | "tidak_aktif";
  q?: string;
};

export type LaporanMipilRingkasan = {
  total_krama: number;
  jumlah_pipil_aktif: number;
  jumlah_pipil_tidak_aktif: number;
  perJenis: { jenis_nama: string; jumlah: number }[];
  perBanjar: { banjar_nama: string; jumlah: number }[];
};

function filterRows(all: KramaListItem[], filter: LaporanMipilFilter): KramaListItem[] {
  let rows = all;

  if (filter.jenisMipilNama) {
    rows = rows.filter((r) => r.jenis_nama === filter.jenisMipilNama);
  }

  if (filter.statusPipil) {
    rows = rows.filter(
      (r) =>
        statusIlikitaEfektif("MIPIL" as KlasifikasiKode, r) === filter.statusPipil
    );
  }

  return sortKramaByWilayah(rows);
}

function hitungRingkasan(rows: KramaListItem[]): LaporanMipilRingkasan {
  const perJenisMap = new Map<string, number>();
  const perBanjarMap = new Map<string, { banjar_nama: string; banjar_kode: string; jumlah: number }>();
  let jumlah_pipil_aktif = 0;
  let jumlah_pipil_tidak_aktif = 0;

  for (const r of rows) {
    const jenis = r.jenis_nama?.trim() || "—";
    perJenisMap.set(jenis, (perJenisMap.get(jenis) ?? 0) + 1);
    const banjarKey = r.banjar_kode ?? r.banjar_nama;
    const cur = perBanjarMap.get(banjarKey) ?? {
      banjar_nama: r.banjar_nama,
      banjar_kode: r.banjar_kode ?? "",
      jumlah: 0,
    };
    cur.jumlah += 1;
    perBanjarMap.set(banjarKey, cur);

    if (statusIlikitaEfektif("MIPIL", r) === "aktif") jumlah_pipil_aktif += 1;
    else jumlah_pipil_tidak_aktif += 1;
  }

  return {
    total_krama: rows.length,
    jumlah_pipil_aktif,
    jumlah_pipil_tidak_aktif,
    perJenis: [...perJenisMap.entries()]
      .map(([jenis_nama, jumlah]) => ({ jenis_nama, jumlah }))
      .sort((a, b) => a.jenis_nama.localeCompare(b.jenis_nama)),
    perBanjar: [...perBanjarMap.values()]
      .sort((a, b) => compareBanjarKode(a.banjar_kode, b.banjar_kode))
      .map(({ banjar_nama, jumlah }) => ({ banjar_nama, jumlah })),
  };
}

export async function getLaporanMipil(filter: LaporanMipilFilter): Promise<{
  ringkasan: LaporanMipilRingkasan;
  rows: KramaListItem[];
  perJenisMaster: { jenis_id: string; jenis_nama: string; jumlah_krama: number }[];
}> {
  const [all, master] = await Promise.all([
    listKrama({
      klasifikasi: "MIPIL",
      banjarId: filter.banjarId,
      tempekId: filter.tempekId,
      arahanId: filter.arahanId,
      q: filter.q,
      statusKrama: "aktif",
    }),
    getPaturunanRingkasan(),
  ]);

  const jenisMipilNama = filter.jenisMipilId
    ? master.perJenis.find((j) => j.jenis_id === filter.jenisMipilId)?.jenis_nama
    : undefined;

  const rows = filterRows(all, { ...filter, jenisMipilNama });
  const ringkasan = hitungRingkasan(rows);

  return {
    ringkasan,
    rows,
    perJenisMaster: master.perJenis.map((j) => ({
      jenis_id: j.jenis_id,
      jenis_nama: j.jenis_nama,
      jumlah_krama: j.jumlah_krama,
    })),
  };
}

export function formatStatusPipilRow(row: KramaListItem): string {
  return formatStatusIlikitaEfektif("MIPIL", row);
}
