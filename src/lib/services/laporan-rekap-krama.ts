import { getDb } from "../db/client";
import type { KlasifikasiKode } from "../types";

export type RekapKramaBanjar = {  id: string;
  kode: string;
  nama: string;
};

export type RekapKramaBaris = {
  klasifikasi_kode: KlasifikasiKode;
  klasifikasi_nama: string;
  jenis_id: string;
  jenis_nama: string;
  per_banjar: Record<string, number>;
  total: number;
};

export type RekapKramaTotal = {
  per_banjar: Record<string, number>;
  total: number;
};

export type RekapKrama = {
  banjar: RekapKramaBanjar[];
  baris: RekapKramaBaris[];
  total_keseluruhan: RekapKramaTotal;
};

export type RekapKramaTableRow =
  | { kind: "data"; baris: RekapKramaBaris; showKlasifikasi: boolean }
  | {
      kind: "subtotal";
      klasifikasi_kode: KlasifikasiKode;
      klasifikasi_nama: string;
      per_banjar: Record<string, number>;
      total: number;
    }
  | { kind: "grand-total"; per_banjar: Record<string, number>; total: number };

export function buildRekapKramaTableRows(data: RekapKrama): RekapKramaTableRow[] {
  const out: RekapKramaTableRow[] = [];
  let i = 0;

  while (i < data.baris.length) {
    const kode = data.baris[i]!.klasifikasi_kode;
    const nama = data.baris[i]!.klasifikasi_nama;
    const groupStart = i;
    const per_banjar: Record<string, number> = {};
    for (const b of data.banjar) per_banjar[b.id] = 0;
    let total = 0;

    while (i < data.baris.length && data.baris[i]!.klasifikasi_kode === kode) {
      const row = data.baris[i]!;
      out.push({ kind: "data", baris: row, showKlasifikasi: i === groupStart });
      total += row.total;
      for (const b of data.banjar) {
        per_banjar[b.id] += row.per_banjar[b.id] ?? 0;
      }
      i += 1;
    }

    out.push({
      kind: "subtotal",
      klasifikasi_kode: kode,
      klasifikasi_nama: nama,
      per_banjar,
      total,
    });
  }

  out.push({
    kind: "grand-total",
    per_banjar: data.total_keseluruhan.per_banjar,
    total: data.total_keseluruhan.total,
  });

  return out;
}

/** Urutan baris jenis per klasifikasi (nama master). */
export const REKAP_KRAMA_JENIS_URUTAN: Record<KlasifikasiKode, string[]> = {
  MIPIL: [
    "Krama Ngarep Jangkep",
    "Krama Ngarep Balu",
    "Krama Ngarep Nyapihan",
    "Krama Nyada",
  ],
  KRAMA_TAMIU: [
    "Krama Tamiu Rajeg",
    "Krama Tamiu Padunungan",
    "Krama Tamiu Padgatakala",
  ],
  TAMIU: [
    "Tamiu Rajeg Mula",
    "Tamiu Rajeg Anyar",
    "Tamiu Padunungan",
    "Tamiu Padgatakala",
  ],
};

function normalizeJenisNama(nama: string): string {
  return nama.trim().toLowerCase().replace(/\s+/g, " ");
}

function jenisSortIndex(kode: KlasifikasiKode, nama: string): number {
  const list = REKAP_KRAMA_JENIS_URUTAN[kode] ?? [];
  const norm = normalizeJenisNama(nama);
  const idx = list.findIndex((n) => normalizeJenisNama(n) === norm);
  if (idx >= 0) return idx;
  if (nama === "Belum diisi") return 9998;
  return 9999;
}

/** Urutkan nama jenis krama sesuai master (Mipil: Ngarep Jangkep → … → Nyada). */
export function compareJenisKramaNama(
  kode: KlasifikasiKode,
  a: string,
  b: string
): number {
  const ia = jenisSortIndex(kode, a);
  const ib = jenisSortIndex(kode, b);
  if (ia !== ib) return ia - ib;
  return a.localeCompare(b, "id");
}

export function sortJenisMaster(
  kode: KlasifikasiKode,
  items: { id: string; nama: string }[]
): { id: string; nama: string }[] {
  return [...items].sort((a, b) => {
    const ia = jenisSortIndex(kode, a.nama);
    const ib = jenisSortIndex(kode, b.nama);
    if (ia !== ib) return ia - ib;
    return a.nama.localeCompare(b.nama, "id");
  });
}

/** Format angka tabel rekap: pemisah ribuan titik (#.###). */
export function formatRekapKramaAngka(n: number, showZero = false): string {
  if (n === 0 && !showZero) return "—";
  return Math.round(n).toLocaleString("id-ID");
}

/** Lebar kolom relatif PDF: Jenis lega, banjar & total sempit. */
export function buildRekapKramaPdfColumnFractions(banjarCount: number): number[] {
  const klasifikasi = 1.05;
  const jenis = 3.8;
  const perBanjar = 0.55;
  const total = 0.65;
  return [klasifikasi, jenis, ...Array(banjarCount).fill(perBanjar), total];
}

const KLASIFIKASI_SECTIONS: {  kode: KlasifikasiKode;
  nama: string;
  jenisTable: "jenis_krama_mipil" | "jenis_krama_tamiu" | "jenis_tamiu";
  fkColumn: "jenis_krama_mipil_id" | "jenis_krama_tamiu_id" | "jenis_tamiu_id";
}[] = [
  {
    kode: "MIPIL",
    nama: "Krama Mipil",
    jenisTable: "jenis_krama_mipil",
    fkColumn: "jenis_krama_mipil_id",
  },
  {
    kode: "KRAMA_TAMIU",
    nama: "Krama Tamiu",
    jenisTable: "jenis_krama_tamiu",
    fkColumn: "jenis_krama_tamiu_id",
  },
  {
    kode: "TAMIU",
    nama: "Tamiu",
    jenisTable: "jenis_tamiu",
    fkColumn: "jenis_tamiu_id",
  },
];

function countKey(klasifikasi: string, jenisId: string | null, banjarId: string): string {
  return `${klasifikasi}\0${jenisId ?? ""}\0${banjarId}`;
}

function buildBaris(
  klasifikasi_kode: KlasifikasiKode,
  klasifikasi_nama: string,
  jenis_id: string,
  jenis_nama: string,
  banjar: RekapKramaBanjar[],
  countMap: Map<string, number>
): RekapKramaBaris {
  const per_banjar: Record<string, number> = {};
  let total = 0;
  for (const b of banjar) {
    const n = countMap.get(countKey(klasifikasi_kode, jenis_id || null, b.id)) ?? 0;
    per_banjar[b.id] = n;
    total += n;
  }
  return { klasifikasi_kode, klasifikasi_nama, jenis_id, jenis_nama, per_banjar, total };
}

function hasUnassigned(
  klasifikasi_kode: KlasifikasiKode,
  banjar: RekapKramaBanjar[],
  countMap: Map<string, number>
): boolean {
  for (const b of banjar) {
    if ((countMap.get(countKey(klasifikasi_kode, null, b.id)) ?? 0) > 0) return true;
  }
  return false;
}

export async function getRekapKrama(): Promise<RekapKrama> {
  const db = await getDb();

  const banjar = await db.select<RekapKramaBanjar[]>(
    `SELECT id, kode, nama FROM banjar ORDER BY kode ASC`
  );

  const rawCounts = await db.select<
    { klasifikasi_kode: KlasifikasiKode; jenis_id: string | null; banjar_id: string; jumlah: number }[]
  >(
    `SELECT kk.kode as klasifikasi_kode,
            CASE
              WHEN kk.kode = 'MIPIL' THEN k.jenis_krama_mipil_id
              WHEN kk.kode = 'KRAMA_TAMIU' THEN k.jenis_krama_tamiu_id
              ELSE k.jenis_tamiu_id
            END as jenis_id,
            k.banjar_id,
            COUNT(*) as jumlah
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     WHERE k.status_krama = 'aktif' AND kk.kode IN ('MIPIL', 'KRAMA_TAMIU', 'TAMIU')
     GROUP BY kk.kode, jenis_id, k.banjar_id`
  );

  const countMap = new Map<string, number>();
  for (const r of rawCounts) {
    countMap.set(countKey(r.klasifikasi_kode, r.jenis_id, r.banjar_id), Number(r.jumlah) || 0);
  }

  const baris: RekapKramaBaris[] = [];

  for (const section of KLASIFIKASI_SECTIONS) {
    const jenisMaster = sortJenisMaster(
      section.kode,
      await db.select<{ id: string; nama: string }[]>(
        `SELECT id, nama FROM ${section.jenisTable} WHERE aktif = 1`
      )
    );
    for (const j of jenisMaster) {
      baris.push(
        buildBaris(section.kode, section.nama, j.id, j.nama, banjar, countMap)
      );
    }

    if (hasUnassigned(section.kode, banjar, countMap)) {
      baris.push(
        buildBaris(section.kode, section.nama, "", "Belum diisi", banjar, countMap)
      );
    }
  }

  const total_keseluruhan: RekapKramaTotal = { per_banjar: {}, total: 0 };
  for (const b of banjar) {
    total_keseluruhan.per_banjar[b.id] = 0;
  }

  for (const row of baris) {
    total_keseluruhan.total += row.total;
    for (const b of banjar) {
      total_keseluruhan.per_banjar[b.id] += row.per_banjar[b.id] ?? 0;
    }
  }

  return { banjar, baris, total_keseluruhan };
}
