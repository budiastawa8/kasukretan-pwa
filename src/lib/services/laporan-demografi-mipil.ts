import {
  KELOMPOK_USIA_BPS,
  KELOMPOK_USIA_TIDAK_DIKETAHUI,
  urutanKelompokUsia,
  usiaKeKelompokBps,
} from "../demografi-bps";
import { statusIlikitaEfektif } from "../status-ilikita";
import { getDb } from "../db/client";
import type { KlasifikasiKode } from "../types";
import { formatJenisKelamin, formatStatusKawin, hitungUmur } from "../utils";
import { compareBanjarKode } from "../wilayah-order";

export type RekapDemografiMipilFilter = {
  banjarId?: string;
  tempekId?: string;
  arahanId?: string;
  jenisMipilId?: string;
  statusPipil?: "aktif" | "tidak_aktif";
};

export type RekapDemografiBaris = {
  label: string;
  jumlah: number;
};

export type RekapDemografiPerBanjar = {
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  total: number;
  jenis_kelamin: RekapDemografiBaris[];
  kelompok_usia: RekapDemografiBaris[];
  pekerjaan: RekapDemografiBaris[];
  status_kawin: RekapDemografiBaris[];
};

export type RekapDemografiMipil = {
  total_jiwa: number;
  banjar: RekapDemografiPerBanjar[];
  jenis_kelamin: RekapDemografiBaris[];
  kelompok_usia: RekapDemografiBaris[];
  pekerjaan: RekapDemografiBaris[];
  status_kawin: RekapDemografiBaris[];
};

type RawRow = {
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  tempek_id: string | null;
  arahan_id: string | null;
  jenis_krama_mipil_id: string | null;
  jenis_nama: string | null;
  status_krama: string;
  status_pipil: string | null;
  jenis_kelamin: string;
  tanggal_lahir: string | null;
  status_kawin: string | null;
  pekerjaan: string | null;
};

function normalizeJenisKelamin(raw: string | null | undefined): string {
  const label = formatJenisKelamin(raw);
  return label || "Tidak diisi";
}

function normalizeStatusKawin(raw: string | null | undefined): string {
  const label = formatStatusKawin(raw);
  return label || "Tidak diisi";
}

function normalizePekerjaan(raw: string | null | undefined): string {
  const t = raw?.trim();
  return t || "Tidak diisi";
}

function incrementMap(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToBaris(
  map: Map<string, number>,
  sort: "alpha" | "count" | "bps_usia" = "count"
): RekapDemografiBaris[] {
  const entries = [...map.entries()];
  if (sort === "alpha") {
    entries.sort((a, b) => a[0].localeCompare(b[0], "id"));
  } else if (sort === "bps_usia") {
    entries.sort((a, b) => urutanKelompokUsia(a[0]) - urutanKelompokUsia(b[0]));
  } else {
    entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "id"));
  }
  return entries.map(([label, jumlah]) => ({ label, jumlah }));
}

function foldPekerjaan(baris: RekapDemografiBaris[], maxItems = 12): RekapDemografiBaris[] {
  if (baris.length <= maxItems) return baris;
  const head = baris.slice(0, maxItems - 1);
  const tail = baris.slice(maxItems - 1);
  const lainnya = tail.reduce((s, r) => s + r.jumlah, 0);
  return [...head, { label: "Lainnya", jumlah: lainnya }];
}

function buildBanjarRekap(
  banjar_id: string,
  banjar_kode: string,
  banjar_nama: string,
  rows: RawRow[]
): RekapDemografiPerBanjar {
  const jk = new Map<string, number>();
  const usia = new Map<string, number>();
  const pekerjaan = new Map<string, number>();
  const kawin = new Map<string, number>();

  for (const r of rows) {
    incrementMap(jk, normalizeJenisKelamin(r.jenis_kelamin));
    incrementMap(usia, usiaKeKelompokBps(hitungUmur(r.tanggal_lahir)));
    incrementMap(pekerjaan, normalizePekerjaan(r.pekerjaan));
    incrementMap(kawin, normalizeStatusKawin(r.status_kawin));
  }

  for (const label of KELOMPOK_USIA_BPS) {
    if (!usia.has(label)) usia.set(label, 0);
  }
  if (!usia.has(KELOMPOK_USIA_TIDAK_DIKETAHUI)) {
    usia.set(KELOMPOK_USIA_TIDAK_DIKETAHUI, 0);
  }

  return {
    banjar_id,
    banjar_kode,
    banjar_nama,
    total: rows.length,
    jenis_kelamin: mapToBaris(jk, "alpha"),
    kelompok_usia: mapToBaris(usia, "bps_usia"),
    pekerjaan: foldPekerjaan(mapToBaris(pekerjaan, "count")),
    status_kawin: mapToBaris(kawin, "alpha"),
  };
}

function mergeBaris(list: RekapDemografiBaris[]): RekapDemografiBaris[] {
  const map = new Map<string, number>();
  for (const r of list) {
    map.set(r.label, (map.get(r.label) ?? 0) + r.jumlah);
  }
  return mapToBaris(map, "count");
}

function mergeBarisUsia(list: RekapDemografiBaris[]): RekapDemografiBaris[] {
  const map = new Map<string, number>();
  for (const r of list) {
    map.set(r.label, (map.get(r.label) ?? 0) + r.jumlah);
  }
  for (const label of KELOMPOK_USIA_BPS) {
    if (!map.has(label)) map.set(label, 0);
  }
  return mapToBaris(map, "bps_usia");
}

function filterRows(all: RawRow[], filter: RekapDemografiMipilFilter): RawRow[] {
  let rows = all;
  if (filter.banjarId?.trim()) {
    rows = rows.filter((r) => r.banjar_id === filter.banjarId!.trim());
  }
  if (filter.tempekId?.trim()) {
    rows = rows.filter((r) => r.tempek_id === filter.tempekId!.trim());
  }
  if (filter.arahanId?.trim()) {
    rows = rows.filter((r) => r.arahan_id === filter.arahanId!.trim());
  }
  if (filter.jenisMipilId?.trim()) {
    rows = rows.filter((r) => r.jenis_krama_mipil_id === filter.jenisMipilId!.trim());
  }
  if (filter.statusPipil) {
    rows = rows.filter(
      (r) =>
        statusIlikitaEfektif("MIPIL" as KlasifikasiKode, r) === filter.statusPipil
    );
  }
  return rows;
}

export async function getRekapDemografiMipil(
  filter: RekapDemografiMipilFilter = {}
): Promise<RekapDemografiMipil> {
  const db = await getDb();
  const all = await db.select<RawRow[]>(
    `SELECT b.id as banjar_id,
            b.kode as banjar_kode,
            b.nama as banjar_nama,
            k.tempek_id,
            k.arahan_id,
            k.jenis_krama_mipil_id,
            jm.nama as jenis_nama,
            k.status_krama,
            k.status_pipil,
            p.jenis_kelamin,
            p.tanggal_lahir,
            p.status_kawin,
            p.pekerjaan
     FROM anggota_keluarga ak
     JOIN penduduk p ON p.id = ak.penduduk_id
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     WHERE ak.status = 'aktif' AND k.status_krama = 'aktif'
     ORDER BY b.kode ASC`
  );

  const rows = filterRows(all, filter);

  const byBanjar = new Map<string, RawRow[]>();
  for (const r of rows) {
    if (!byBanjar.has(r.banjar_id)) byBanjar.set(r.banjar_id, []);
    byBanjar.get(r.banjar_id)!.push(r);
  }

  const banjar: RekapDemografiPerBanjar[] = [...byBanjar.entries()]
    .map(([id, group]) => {
      const first = group[0]!;
      return buildBanjarRekap(id, first.banjar_kode, first.banjar_nama, group);
    })
    .sort((a, b) => compareBanjarKode(a.banjar_kode, b.banjar_kode));

  return {
    total_jiwa: rows.length,
    banjar,
    jenis_kelamin: mergeBaris(banjar.flatMap((b) => b.jenis_kelamin)).sort((a, b) =>
      a.label.localeCompare(b.label, "id")
    ),
    kelompok_usia: mergeBarisUsia(banjar.flatMap((b) => b.kelompok_usia)),
    pekerjaan: foldPekerjaan(mergeBaris(banjar.flatMap((b) => b.pekerjaan))),
    status_kawin: mergeBaris(banjar.flatMap((b) => b.status_kawin)).sort((a, b) =>
      a.label.localeCompare(b.label, "id")
    ),
  };
}
