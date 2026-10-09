import { hitungBerlakuSampai, tanggalBerlakuMulaiIso } from "../masa-berlaku";
import {
  formatStatusIlikitaEfektif,
  statusIlikitaEfektif,
  type StatusIlikitaKode,
} from "../status-ilikita";
import { compareBanjarKode, sortKramaByWilayah } from "../wilayah-order";
import { hariMenujuBerlakuSampai, PEMASIH_PERINGATAN_HARI } from "../pemasih-perhatian";
import type { KlasifikasiKode, KramaListItem } from "../types";
import { listKrama } from "./krama";
import { getDudukanRingkasan } from "./dudukan";

export type LaporanPemasihFilter = {
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  /** Diisi internal dari id jenis. */
  jenisNama?: string;
  statusPemasih?: StatusIlikitaKode;
  perhatian?: "tidak_aktif" | "akan_habis";
  q?: string;
};

export type LaporanPemasihRow = KramaListItem & {
  berlaku_sampai: string | null;
  status_label: string;
  perhatian?: "tidak_aktif" | "akan_habis" | null;
};

export type LaporanPemasihRingkasan = {
  total_krama: number;
  jumlah_kt: number;
  jumlah_t: number;
  jumlah_aktif: number;
  jumlah_tidak_aktif: number;
  jumlah_akan_habis: number;
  perJenis: { klasifikasi_kode: KlasifikasiKode; jenis_nama: string; jumlah: number }[];
  perBanjar: { banjar_nama: string; jumlah: number }[];
};

function toBerlakuInput(row: KramaListItem) {
  return {
    klasifikasi_kode: row.klasifikasi_kode as KlasifikasiKode,
    tanggal_terdaftar: row.tanggal_terdaftar,
    tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
    masa_berlaku_tahun: row.masa_berlaku_tahun,
    anggota_aktif: [],
    kepala: { id: "", nama_lengkap: row.kepala_nama, jenis_kelamin: "" },
  };
}

function enrichRow(row: KramaListItem): LaporanPemasihRow {
  const kode = row.klasifikasi_kode as KlasifikasiKode;
  const mulai = tanggalBerlakuMulaiIso(toBerlakuInput(row));
  const berlaku_sampai = hitungBerlakuSampai(mulai, row.masa_berlaku_tahun);
  const status = statusIlikitaEfektif(kode, row);

  let perhatian: LaporanPemasihRow["perhatian"] = null;
  if (status === "tidak_aktif") perhatian = "tidak_aktif";
  else {
    const hari = hariMenujuBerlakuSampai(berlaku_sampai);
    if (hari != null && hari >= 0 && hari <= PEMASIH_PERINGATAN_HARI) {
      perhatian = "akan_habis";
    }
  }

  return {
    ...row,
    berlaku_sampai,
    status_label: formatStatusIlikitaEfektif(kode, row),
    perhatian,
  };
}

function filterRows(rows: LaporanPemasihRow[], filter: LaporanPemasihFilter): LaporanPemasihRow[] {
  let result = rows;

  if (filter.klasifikasi) {
    result = result.filter((r) => r.klasifikasi_kode === filter.klasifikasi);
  }
  if (filter.jenisNama) {
    result = result.filter((r) => r.jenis_nama === filter.jenisNama);
  }
  if (filter.statusPemasih) {
    result = result.filter(
      (r) => statusIlikitaEfektif(r.klasifikasi_kode as KlasifikasiKode, r) === filter.statusPemasih
    );
  }
  if (filter.perhatian) {
    result = result.filter((r) => r.perhatian === filter.perhatian);
  }

  return sortKramaByWilayah(result);
}

function hitungRingkasan(rows: LaporanPemasihRow[]): LaporanPemasihRingkasan {
  const perJenisMap = new Map<string, { klasifikasi_kode: KlasifikasiKode; jenis_nama: string; jumlah: number }>();
  const perBanjarMap = new Map<string, { banjar_nama: string; banjar_kode: string; jumlah: number }>();
  let jumlah_kt = 0;
  let jumlah_t = 0;
  let jumlah_aktif = 0;
  let jumlah_tidak_aktif = 0;
  let jumlah_akan_habis = 0;

  for (const r of rows) {
    const kode = r.klasifikasi_kode as KlasifikasiKode;
    if (kode === "KRAMA_TAMIU") jumlah_kt += 1;
    if (kode === "TAMIU") jumlah_t += 1;

    const status = statusIlikitaEfektif(kode, r);
    if (status === "aktif") jumlah_aktif += 1;
    else jumlah_tidak_aktif += 1;
    if (r.perhatian === "akan_habis") jumlah_akan_habis += 1;

    const jenis = r.jenis_nama?.trim() || "—";
    const key = `${kode}:${jenis}`;
    const cur = perJenisMap.get(key) ?? { klasifikasi_kode: kode, jenis_nama: jenis, jumlah: 0 };
    cur.jumlah += 1;
    perJenisMap.set(key, cur);

    const banjarKey = r.banjar_kode ?? r.banjar_nama;
    const curBanjar = perBanjarMap.get(banjarKey) ?? {
      banjar_nama: r.banjar_nama,
      banjar_kode: r.banjar_kode ?? "",
      jumlah: 0,
    };
    curBanjar.jumlah += 1;
    perBanjarMap.set(banjarKey, curBanjar);
  }

  return {
    total_krama: rows.length,
    jumlah_kt,
    jumlah_t,
    jumlah_aktif,
    jumlah_tidak_aktif,
    jumlah_akan_habis,
    perJenis: [...perJenisMap.values()].sort(
      (a, b) =>
        a.klasifikasi_kode.localeCompare(b.klasifikasi_kode) ||
        a.jenis_nama.localeCompare(b.jenis_nama)
    ),
    perBanjar: [...perBanjarMap.values()]
      .sort((a, b) => compareBanjarKode(a.banjar_kode, b.banjar_kode))
      .map(({ banjar_nama, jumlah }) => ({ banjar_nama, jumlah })),
  };
}

export async function getLaporanPemasih(filter: LaporanPemasihFilter): Promise<{
  ringkasan: LaporanPemasihRingkasan;
  rows: LaporanPemasihRow[];
  perJenisMaster: {
    klasifikasi_kode: KlasifikasiKode;
    jenis_nama: string;
    jumlah_krama: number;
  }[];
}> {
  const [all, master] = await Promise.all([
    listKrama({
      klasifikasiIn: ["KRAMA_TAMIU", "TAMIU"],
      banjarId: filter.banjarId,
      q: filter.q,
      statusKrama: "aktif",
    }),
    getDudukanRingkasan(),
  ]);

  const jenisNama = filter.jenisKramaTamiuId
    ? master.perJenis.find(
        (j) => j.klasifikasi_kode === "KRAMA_TAMIU" && j.jenis_id === filter.jenisKramaTamiuId
      )?.jenis_nama
    : filter.jenisTamiuId
      ? master.perJenis.find(
          (j) => j.klasifikasi_kode === "TAMIU" && j.jenis_id === filter.jenisTamiuId
        )?.jenis_nama
      : undefined;

  const enriched = all.map(enrichRow);
  const rows = filterRows(enriched, { ...filter, jenisNama });
  const ringkasan = hitungRingkasan(rows);

  return {
    ringkasan,
    rows,
    perJenisMaster: master.perJenis.map((j) => ({
      klasifikasi_kode: j.klasifikasi_kode,
      jenis_nama: j.jenis_nama,
      jumlah_krama: j.jumlah_krama,
    })),
  };
}
