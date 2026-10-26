import { getDb } from "../db/client";
import { compareBanjarKode } from "../wilayah-order";
import { formatBulanIndonesiaSingkat } from "../dudukan-hitung";
import { formatTanggalLahir } from "../utils";
import { sortJenisMaster } from "./laporan-rekap-krama";

export type RekapPenerimaanDudukanDetailRow = {
  klasifikasi_kode: "KRAMA_TAMIU" | "TAMIU";
  klasifikasi_nama: string;
  jenis_id: string;
  jenis_nama: string;
  label: string;
  perBulan: Record<string, number>;
  total: number;
};

export type RekapPenerimaanDudukanKlasifikasiGroup = {
  klasifikasi_kode: "KRAMA_TAMIU" | "TAMIU";
  klasifikasi_nama: string;
  detail: RekapPenerimaanDudukanDetailRow[];
  perBulan: Record<string, number>;
  total: number;
};

export type RekapPenerimaanDudukanBanjarGroup = {
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  sections: RekapPenerimaanDudukanKlasifikasiGroup[];
  perBulan: Record<string, number>;
  total: number;
};

export type RekapPenerimaanDudukan = {
  bulan: string[];
  bulanLabel: string[];
  groups: RekapPenerimaanDudukanBanjarGroup[];
  totalPerBulan: Record<string, number>;
  grandTotal: number;
};

const BULAN_SINGKAT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
] as const;

const KLASIFIKASI_DETAIL: {
  kode: "KRAMA_TAMIU" | "TAMIU";
  nama: string;
}[] = [
  { kode: "KRAMA_TAMIU", nama: "Krama Tamiu" },
  { kode: "TAMIU", nama: "Tamiu" },
];

export function formatBulanBayarLabel(bulanKey: string): string {
  const [y, m] = bulanKey.split("-");
  const idx = Math.max(0, Math.min(11, (parseInt(m, 10) || 1) - 1));
  return `${BULAN_SINGKAT[idx]} ${y}`;
}

/** Nama banjar untuk kolom laporan — selalu diawali "Banjar". */
export function formatBanjarLaporanNama(nama: string): string {
  const t = nama.trim();
  if (!t) return "Banjar —";
  if (/^banjar\s/i.test(t)) return t;
  return `Banjar ${t}`;
}

/** Baris subtotal per banjar di rekap penerimaan dudukan. */
export function formatBanjarSubtotalLaporan(nama: string): string {
  return `Jumlah ${formatBanjarLaporanNama(nama)}`;
}

/** Cara pengelompokan periode di rekap per petugas. */
export type RekapPenerimaanDudukanPetugasKelompok = "perTanggal" | "perTriwulan";

const TRIWULAN_RANGE_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "Januari – Maret",
  2: "April – Juni",
  3: "Juli – September",
  4: "Oktober – Desember",
};

const TRIWULAN_ROMAN: Record<1 | 2 | 3 | 4, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
};

/** Kunci triwulan dari tanggal ISO (`YYYY-MM-DD` → `YYYY-T1` … `YYYY-T4`). */
export function triwulanKeyFromTanggal(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(tanggal.trim());
  if (!m) return "0000-T0";
  const month = Math.max(1, Math.min(12, parseInt(m[2], 10) || 1));
  const q = Math.ceil(month / 3) as 1 | 2 | 3 | 4;
  return `${m[1]}-T${q}`;
}

/** Label tampilan triwulan, mis. `TW I — Januari – Maret 2026`. */
export function formatTriwulanLabel(key: string): string {
  const m = /^(\d{4})-T([1-4])$/.exec(key.trim());
  if (!m) return key.trim() || "—";
  const q = Number(m[2]) as 1 | 2 | 3 | 4;
  return `TW ${TRIWULAN_ROMAN[q]} — ${TRIWULAN_RANGE_LABEL[q]} ${m[1]}`;
}

/** Subtotal per triwulan di rekap per petugas. */
export function formatTriwulanSubtotalLaporan(key: string): string {
  return `Jumlah ${formatTriwulanLabel(key)}`;
}

/** Baris subtotal per tanggal di rekap per petugas. */
export function formatTanggalSubtotalLaporan(tanggal: string): string {
  return `Jumlah ${formatTanggalLahir(tanggal)}`;
}

/** Uraian baris rekap per petugas: Banjar — nama petugas. */
export function formatUraianPetugasDudukan(banjarNama: string, petugasNama: string): string {
  return `${formatBanjarLaporanNama(banjarNama)} - ${petugasNama.trim() || "—"}`;
}

/** Kelompok petugas di rekap Dudukan (Tim Banjar / Tim Bantuan / input kantor). */
export type RekapPetugasDudukanTipe = "banjar" | "bantuan" | "kantor";

export const REKAP_PETUGAS_TIPE_ORDER: RekapPetugasDudukanTipe[] = [
  "banjar",
  "bantuan",
  "kantor",
];

export function formatRekapPetugasDudukanTipeLabel(tipe: RekapPetugasDudukanTipe): string {
  switch (tipe) {
    case "bantuan":
      return "Tim Bantuan";
    case "kantor":
      return "Kantor / tanpa petugas";
    default:
      return "Tim Banjar";
  }
}

export function formatRekapPetugasDudukanTipeSubtotal(tipe: RekapPetugasDudukanTipe): string {
  return `Jumlah ${formatRekapPetugasDudukanTipeLabel(tipe)}`;
}

export function resolveRekapPetugasDudukanTipe(
  petugasId: string | null | undefined,
  tipeRaw: string | null | undefined
): RekapPetugasDudukanTipe {
  if (!petugasId?.trim()) return "kantor";
  return tipeRaw === "bantuan" ? "bantuan" : "banjar";
}

/** Baris subtotal per klasifikasi dalam satu banjar. */
export function formatKlasifikasiSubtotalLaporan(klasifikasiNama: string): string {
  return `Jumlah ${klasifikasiNama}`;
}

/** Baris subtotal per jenis dalam satu klasifikasi. */
export function formatJenisSubtotalLaporan(jenisNama: string): string {
  return `Jumlah ${jenisNama}`;
}

function roundRp(n: number): number {
  return Math.round(Number(n) || 0);
}


function parseMonthKey(key: string): { y: number; m: number } {
  const [ys, ms] = key.split("-");
  return { y: parseInt(ys, 10) || 0, m: (parseInt(ms, 10) || 1) - 1 };
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function enumerateMonthsBetween(dari: string, sampai: string): string[] {
  const start = parseMonthKey(dari.slice(0, 7));
  const end = parseMonthKey(sampai.slice(0, 7));
  const out: string[] = [];
  let y = start.y;
  let m = start.m;
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push(monthKey(y, m));
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

function emptyPerBulan(bulan: string[]): Record<string, number> {
  const perBulan: Record<string, number> = {};
  for (const bk of bulan) perBulan[bk] = 0;
  return perBulan;
}

function sumRows(
  rows: { perBulan: Record<string, number>; total: number }[],
  bulan: string[]
): { perBulan: Record<string, number>; total: number } {
  const perBulan = emptyPerBulan(bulan);
  let total = 0;
  for (const row of rows) {
    total += row.total;
    for (const bk of bulan) {
      perBulan[bk] = (perBulan[bk] ?? 0) + (row.perBulan[bk] ?? 0);
    }
  }
  return { perBulan, total };
}

function detailKey(
  banjarId: string,
  klasifikasi: string,
  jenisId: string | null,
  bulan: string
): string {
  return `${banjarId}\0${klasifikasi}\0${jenisId ?? ""}\0${bulan}`;
}

function buildDetailRow(
  banjarId: string,
  klasifikasi_kode: "KRAMA_TAMIU" | "TAMIU",
  klasifikasi_nama: string,
  jenis_id: string,
  jenis_nama: string,
  bulan: string[],
  amountMap: Map<string, number>
): RekapPenerimaanDudukanDetailRow {
  const perBulan: Record<string, number> = {};
  let total = 0;
  for (const bk of bulan) {
    const amt = roundRp(
      amountMap.get(detailKey(banjarId, klasifikasi_kode, jenis_id || null, bk)) ?? 0
    );
    perBulan[bk] = amt;
    total += amt;
  }
  return {
    klasifikasi_kode,
    klasifikasi_nama,
    jenis_id,
    jenis_nama,
    label: jenis_nama,
    perBulan,
    total,
  };
}

function hasUnassignedAmounts(
  banjarId: string,
  klasifikasi: "KRAMA_TAMIU" | "TAMIU",
  bulan: string[],
  amountMap: Map<string, number>
): boolean {
  for (const bk of bulan) {
    if ((amountMap.get(detailKey(banjarId, klasifikasi, null, bk)) ?? 0) > 0) return true;
  }
  return false;
}

type AggRow = {
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  klasifikasi_kode: "KRAMA_TAMIU" | "TAMIU";
  jenis_id: string | null;
  jenis_nama: string;
  bulan_bayar: string;
  jumlah: number;
};

function mergeJenisForSection(
  kode: "KRAMA_TAMIU" | "TAMIU",
  master: { id: string; nama: string }[],
  historical: { jenis_id: string | null; jenis_nama: string }[]
): { id: string; nama: string }[] {
  const byId = new Map(master.map((j) => [j.id, j]));
  for (const h of historical) {
    if (!h.jenis_id?.trim()) continue;
    const id = h.jenis_id.trim();
    const existing = byId.get(id);
    if (existing) {
      if (h.jenis_nama?.trim() && existing.nama !== h.jenis_nama.trim()) {
        byId.set(id, { id, nama: h.jenis_nama.trim() });
      }
      continue;
    }
    byId.set(id, { id, nama: h.jenis_nama?.trim() || "—" });
  }
  return sortJenisMaster(kode, [...byId.values()]);
}

function buildKlasifikasiSection(
  banjar_id: string,
  section: (typeof KLASIFIKASI_DETAIL)[number],
  bulan: string[],
  amountMap: Map<string, number>,
  jenisByKode: Record<"KRAMA_TAMIU" | "TAMIU", { id: string; nama: string }[]>,
  historicalJenis: Map<string, { jenis_id: string | null; jenis_nama: string }[]>
): RekapPenerimaanDudukanKlasifikasiGroup | null {
  const detail: RekapPenerimaanDudukanDetailRow[] = [];
  const jenisList = mergeJenisForSection(
    section.kode,
    jenisByKode[section.kode],
    historicalJenis.get(`${banjar_id}\0${section.kode}`) ?? []
  );

  for (const j of jenisList) {
    const row = buildDetailRow(
      banjar_id,
      section.kode,
      section.nama,
      j.id,
      j.nama,
      bulan,
      amountMap
    );
    if (row.total > 0) detail.push(row);
  }

  if (hasUnassignedAmounts(banjar_id, section.kode, bulan, amountMap)) {
    const row = buildDetailRow(
      banjar_id,
      section.kode,
      section.nama,
      "",
      "Belum diisi",
      bulan,
      amountMap
    );
    if (row.total > 0) detail.push(row);
  }

  if (detail.length === 0) return null;

  const { perBulan, total } = sumRows(detail, bulan);
  return {
    klasifikasi_kode: section.kode,
    klasifikasi_nama: section.nama,
    detail,
    perBulan,
    total,
  };
}

export async function getRekapPenerimaanDudukan(params: {
  dari?: string;
  sampai?: string;
}): Promise<RekapPenerimaanDudukan> {
  const db = await getDb();
  let sql = `
    SELECT b.id as banjar_id,
           b.kode as banjar_kode,
           b.nama as banjar_nama,
           kk.kode as klasifikasi_kode,
           CASE
             WHEN kk.kode = 'KRAMA_TAMIU' THEN COALESCE(p.jenis_krama_tamiu_id, k.jenis_krama_tamiu_id)
             ELSE COALESCE(p.jenis_tamiu_id, k.jenis_tamiu_id)
           END as jenis_id,
           COALESCE(
             NULLIF(TRIM(p.jenis_nama), ''),
             jt_snap.nama,
             jkt_snap.nama,
             jt.nama,
             jkt.nama,
             ''
           ) as jenis_nama,
           strftime('%Y-%m', p.tanggal) as bulan_bayar,
           COALESCE(SUM(p.jumlah), 0) as jumlah
    FROM dudukan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
      AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
    LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
    LEFT JOIN jenis_tamiu jt_snap ON jt_snap.id = p.jenis_tamiu_id
    LEFT JOIN jenis_krama_tamiu jkt_snap ON jkt_snap.id = p.jenis_krama_tamiu_id
    WHERE 1=1
  `;
  const args: unknown[] = [];
  let n = 1;
  if (params.dari?.trim()) {
    sql += ` AND p.tanggal >= $${n++}`;
    args.push(params.dari.trim());
  }
  if (params.sampai?.trim()) {
    sql += ` AND p.tanggal <= $${n++}`;
    args.push(params.sampai.trim());
  }
  sql += `
    GROUP BY b.id, b.kode, b.nama, kk.kode, jenis_id, jenis_nama, strftime('%Y-%m', p.tanggal)
    HAVING COALESCE(SUM(p.jumlah), 0) > 0
    ORDER BY b.kode ASC, kk.kode ASC, bulan_bayar ASC
  `;

  const [flat, jenisKtMaster, jenisTMaster] = await Promise.all([
    db.select<AggRow[]>(sql, args),
    db.select<{ id: string; nama: string }[]>(
      `SELECT id, nama FROM jenis_krama_tamiu WHERE aktif = 1`
    ),
    db.select<{ id: string; nama: string }[]>(`SELECT id, nama FROM jenis_tamiu WHERE aktif = 1`),
  ]);

  const jenisByKode = {
    KRAMA_TAMIU: sortJenisMaster("KRAMA_TAMIU", jenisKtMaster),
    TAMIU: sortJenisMaster("TAMIU", jenisTMaster),
  };

  const amountMap = new Map<string, number>();
  const monthSet = new Set<string>();
  const banjarMeta = new Map<string, { banjar_nama: string; banjar_kode: string }>();
  const historicalJenis = new Map<string, { jenis_id: string | null; jenis_nama: string }[]>();

  for (const r of flat) {
    if (r.bulan_bayar?.trim()) monthSet.add(r.bulan_bayar.trim());
    banjarMeta.set(r.banjar_id, {
      banjar_nama: r.banjar_nama,
      banjar_kode: r.banjar_kode,
    });
    const histKey = `${r.banjar_id}\0${r.klasifikasi_kode}`;
    const histList = historicalJenis.get(histKey) ?? [];
    histList.push({ jenis_id: r.jenis_id, jenis_nama: r.jenis_nama });
    historicalJenis.set(histKey, histList);
    const bk = r.bulan_bayar?.trim() || "";
    if (!bk) continue;
    const key = detailKey(r.banjar_id, r.klasifikasi_kode, r.jenis_id, bk);
    amountMap.set(key, (amountMap.get(key) ?? 0) + roundRp(r.jumlah));
  }

  const d = params.dari?.trim();
  const s = params.sampai?.trim();
  let bulan: string[];
  if (d && s) {
    bulan = enumerateMonthsBetween(d, s);
  } else {
    bulan = [...monthSet].sort();
  }

  const groups: RekapPenerimaanDudukanBanjarGroup[] = [];

  for (const [banjar_id, meta] of [...banjarMeta.entries()].sort((a, b) =>
    compareBanjarKode(a[1].banjar_kode, b[1].banjar_kode)
  )) {
    const sections: RekapPenerimaanDudukanKlasifikasiGroup[] = [];

    for (const section of KLASIFIKASI_DETAIL) {
      const built = buildKlasifikasiSection(
        banjar_id,
        section,
        bulan,
        amountMap,
        jenisByKode,
        historicalJenis
      );
      if (built) sections.push(built);
    }

    if (sections.length === 0) continue;

    const { perBulan, total } = sumRows(sections, bulan);
    groups.push({
      banjar_id,
      banjar_nama: meta.banjar_nama,
      banjar_kode: meta.banjar_kode,
      sections,
      perBulan,
      total,
    });
  }

  const totalPerBulan = emptyPerBulan(bulan);
  let grandTotal = 0;
  for (const group of groups) {
    grandTotal += group.total;
    for (const bk of bulan) {
      totalPerBulan[bk] = (totalPerBulan[bk] ?? 0) + (group.perBulan[bk] ?? 0);
    }
  }

  return {
    bulan,
    bulanLabel: bulan.map(formatBulanBayarLabel),
    groups,
    totalPerBulan,
    grandTotal,
  };
}

export type RekapPenerimaanDudukanTableRow =
  | { kind: "banjar-header"; banjar_nama: string }
  | { kind: "klasifikasi-header"; klasifikasi_nama: string }
  | {
      kind: "detail";
      label: string;
      perBulan: Record<string, number>;
      total: number;
    }
  | {
      kind: "klasifikasi-subtotal";
      klasifikasi_nama: string;
      perBulan: Record<string, number>;
      total: number;
    }
  | {
      kind: "banjar-subtotal";
      banjar_nama: string;
      perBulan: Record<string, number>;
      total: number;
    }
  | { kind: "grand-total"; perBulan: Record<string, number>; total: number };

export function buildRekapPenerimaanDudukanTableRows(
  rekap: RekapPenerimaanDudukan
): RekapPenerimaanDudukanTableRow[] {
  const out: RekapPenerimaanDudukanTableRow[] = [];

  for (const group of rekap.groups) {
    out.push({ kind: "banjar-header", banjar_nama: group.banjar_nama });

    for (const section of group.sections) {
      out.push({ kind: "klasifikasi-header", klasifikasi_nama: section.klasifikasi_nama });

      for (const d of section.detail) {
        out.push({
          kind: "detail",
          label: d.label,
          perBulan: d.perBulan,
          total: d.total,
        });
      }

      out.push({
        kind: "klasifikasi-subtotal",
        klasifikasi_nama: section.klasifikasi_nama,
        perBulan: section.perBulan,
        total: section.total,
      });
    }

    out.push({
      kind: "banjar-subtotal",
      banjar_nama: group.banjar_nama,
      perBulan: group.perBulan,
      total: group.total,
    });
  }

  out.push({
    kind: "grand-total",
    perBulan: rekap.totalPerBulan,
    total: rekap.grandTotal,
  });

  return out;
}

export type RekapPenerimaanDudukanMode = "perBulan" | "perTransaksi" | "perPetugas";

export type RekapTransaksiDudukanRow = {
  id: string;
  tanggal: string;
  nomor_kartu: string;
  kepala_nama: string;
  alamat: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  keringanan: number;
};

export type RekapPenerimaanDudukanJenisGroup = {
  jenis_nama: string;
  rows: RekapTransaksiDudukanRow[];
  total: number;
};

export type RekapPenerimaanDudukanKlasifikasiGroupTx = {
  klasifikasi_kode: "KRAMA_TAMIU" | "TAMIU";
  klasifikasi_nama: string;
  jenisGroups: RekapPenerimaanDudukanJenisGroup[];
  total: number;
};

export type RekapPenerimaanDudukanBanjarGroupTx = {
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  sections: RekapPenerimaanDudukanKlasifikasiGroupTx[];
  total: number;
};

export type RekapPenerimaanDudukanTransaksi = {
  groups: RekapPenerimaanDudukanBanjarGroupTx[];
  grandTotal: number;
  transactionCount: number;
};

type TransaksiAggRow = {
  id: string;
  tanggal: string;
  nomor_kartu: string;
  kepala_nama: string;
  alamat: string;
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  klasifikasi_kode: "KRAMA_TAMIU" | "TAMIU";
  jenis_nama: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  keringanan: number;
};

export function formatPeriodeTransaksiDudukan(bulan: number, tahun: number): string {
  return formatBulanIndonesiaSingkat(bulan, tahun);
}

export async function getRekapPenerimaanDudukanTransaksi(params: {
  dari?: string;
  sampai?: string;
}): Promise<RekapPenerimaanDudukanTransaksi> {
  const db = await getDb();
  let sql = `
    SELECT p.id,
           p.tanggal,
           k.nomor_kartu,
           pd.nama_lengkap as kepala_nama,
           COALESCE(NULLIF(TRIM(k.alamat), ''), '—') as alamat,
           k.banjar_id,
           b.kode as banjar_kode,
           b.nama as banjar_nama,
           kk.kode as klasifikasi_kode,
           COALESCE(
             NULLIF(TRIM(p.jenis_nama), ''),
             jt_snap.nama,
             jkt_snap.nama,
             jt.nama,
             jkt.nama,
             '—'
           ) as jenis_nama,
           p.tahun,
           p.bulan,
           p.jumlah,
           COALESCE(dk.keringanan, 0) as keringanan
    FROM dudukan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
      AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
    JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
    LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
    LEFT JOIN jenis_tamiu jt_snap ON jt_snap.id = p.jenis_tamiu_id
    LEFT JOIN jenis_krama_tamiu jkt_snap ON jkt_snap.id = p.jenis_krama_tamiu_id
    LEFT JOIN (
      SELECT krama_id, tahun, bulan, COALESCE(SUM(jumlah), 0) as keringanan
      FROM dudukan_keringanan
      GROUP BY krama_id, tahun, bulan
    ) dk ON dk.krama_id = p.krama_id AND dk.tahun = p.tahun AND dk.bulan = p.bulan
    WHERE p.jumlah > 0
  `;
  const args: unknown[] = [];
  let n = 1;
  if (params.dari?.trim()) {
    sql += ` AND p.tanggal >= $${n++}`;
    args.push(params.dari.trim());
  }
  if (params.sampai?.trim()) {
    sql += ` AND p.tanggal <= $${n++}`;
    args.push(params.sampai.trim());
  }
  sql += `
    ORDER BY b.kode ASC, kk.kode ASC, jenis_nama ASC, p.tanggal ASC, k.nomor_kartu ASC
  `;

  const flat = await db.select<TransaksiAggRow[]>(sql, args);

  type BanjarAcc = {
    meta: { banjar_nama: string; banjar_kode: string };
    klasifikasi: Map<"KRAMA_TAMIU" | "TAMIU", Map<string, RekapTransaksiDudukanRow[]>>;
  };

  const byBanjar = new Map<string, BanjarAcc>();

  for (const r of flat) {
    const jumlah = roundRp(r.jumlah);
    if (jumlah <= 0) continue;

    let banjar = byBanjar.get(r.banjar_id);
    if (!banjar) {
      banjar = {
        meta: { banjar_nama: r.banjar_nama, banjar_kode: r.banjar_kode },
        klasifikasi: new Map(),
      };
      byBanjar.set(r.banjar_id, banjar);
    }

    const kode = r.klasifikasi_kode;
    let byJenis = banjar.klasifikasi.get(kode);
    if (!byJenis) {
      byJenis = new Map();
      banjar.klasifikasi.set(kode, byJenis);
    }

    const jenisKey = r.jenis_nama?.trim() || "—";
    const list = byJenis.get(jenisKey) ?? [];
    list.push({
      id: r.id,
      tanggal: r.tanggal,
      nomor_kartu: r.nomor_kartu,
      kepala_nama: r.kepala_nama,
      alamat: r.alamat,
      tahun: Number(r.tahun),
      bulan: Number(r.bulan),
      jumlah,
      keringanan: roundRp(r.keringanan),
    });
    byJenis.set(jenisKey, list);
  }

  const groups: RekapPenerimaanDudukanBanjarGroupTx[] = [];
  let grandTotal = 0;
  let transactionCount = 0;

  for (const [banjar_id, acc] of [...byBanjar.entries()].sort((a, b) =>
    compareBanjarKode(a[1].meta.banjar_kode, b[1].meta.banjar_kode)
  )) {
    const sections: RekapPenerimaanDudukanKlasifikasiGroupTx[] = [];
    let banjarTotal = 0;

    for (const section of KLASIFIKASI_DETAIL) {
      const byJenis = acc.klasifikasi.get(section.kode);
      if (!byJenis || byJenis.size === 0) continue;

      const jenisGroups: RekapPenerimaanDudukanJenisGroup[] = [];
      let klasifikasiTotal = 0;

      for (const [jenis_nama, rows] of [...byJenis.entries()].sort(([a], [b]) =>
        a.localeCompare(b, "id", { sensitivity: "base" })
      )) {
        const total = rows.reduce((s, row) => s + row.jumlah, 0);
        klasifikasiTotal += total;
        transactionCount += rows.length;
        jenisGroups.push({ jenis_nama, rows, total });
      }

      if (jenisGroups.length === 0) continue;

      banjarTotal += klasifikasiTotal;
      sections.push({
        klasifikasi_kode: section.kode,
        klasifikasi_nama: section.nama,
        jenisGroups,
        total: klasifikasiTotal,
      });
    }

    if (sections.length === 0) continue;

    grandTotal += banjarTotal;
    groups.push({
      banjar_id,
      banjar_nama: acc.meta.banjar_nama,
      banjar_kode: acc.meta.banjar_kode,
      sections,
      total: banjarTotal,
    });
  }

  return { groups, grandTotal, transactionCount };
}

export type RekapPenerimaanDudukanTransaksiTableRow =
  | { kind: "banjar-header"; banjar_nama: string }
  | { kind: "klasifikasi-header"; klasifikasi_nama: string }
  | { kind: "jenis-header"; jenis_nama: string }
  | { kind: "transaksi"; row: RekapTransaksiDudukanRow }
  | { kind: "jenis-subtotal"; jenis_nama: string; total: number }
  | { kind: "klasifikasi-subtotal"; klasifikasi_nama: string; total: number }
  | { kind: "banjar-subtotal"; banjar_nama: string; total: number }
  | { kind: "grand-total"; total: number };

export function buildRekapPenerimaanDudukanTransaksiTableRows(
  rekap: RekapPenerimaanDudukanTransaksi
): RekapPenerimaanDudukanTransaksiTableRow[] {
  const out: RekapPenerimaanDudukanTransaksiTableRow[] = [];

  for (const group of rekap.groups) {
    out.push({ kind: "banjar-header", banjar_nama: group.banjar_nama });

    for (const section of group.sections) {
      out.push({ kind: "klasifikasi-header", klasifikasi_nama: section.klasifikasi_nama });

      for (const jenis of section.jenisGroups) {
        out.push({ kind: "jenis-header", jenis_nama: jenis.jenis_nama });

        for (const row of jenis.rows) {
          out.push({ kind: "transaksi", row });
        }

        out.push({ kind: "jenis-subtotal", jenis_nama: jenis.jenis_nama, total: jenis.total });
      }

      out.push({
        kind: "klasifikasi-subtotal",
        klasifikasi_nama: section.klasifikasi_nama,
        total: section.total,
      });
    }

    out.push({
      kind: "banjar-subtotal",
      banjar_nama: group.banjar_nama,
      total: group.total,
    });
  }

  out.push({ kind: "grand-total", total: rekap.grandTotal });
  return out;
}

export type RekapPetugasDudukanRow = {
  petugas_id: string | null;
  petugas_nama: string;
  /** Tim Banjar, Tim Bantuan, atau input kantor (tanpa petugas). */
  petugas_tipe: RekapPetugasDudukanTipe;
  jumlah: number;
};

export type RekapPenerimaanDudukanBanjarGroupPetugas = {
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  petugasRows: RekapPetugasDudukanRow[];
  total: number;
  totalByTipe: Record<RekapPetugasDudukanTipe, number>;
};

export type RekapPenerimaanDudukanTanggalGroup = {
  /** Tanggal setor ISO (`YYYY-MM-DD`). */
  tanggal: string;
  banjarGroups: RekapPenerimaanDudukanBanjarGroupPetugas[];
  total: number;
};

export type RekapPenerimaanDudukanPetugas = {
  kelompok: RekapPenerimaanDudukanPetugasKelompok;
  groups: RekapPenerimaanDudukanTanggalGroup[];
  grandTotal: number;
  /** Jumlah baris petugas (bukan termasuk header/subtotal). */
  rowCount: number;
  totalsByTipe: Record<RekapPetugasDudukanTipe, number>;
};

type PetugasAggRow = {
  tanggal: string;
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  petugas_id: string | null;
  petugas_nama: string;
  petugas_tipe_raw: string | null;
  jumlah: number;
};

function emptyTotalsByTipe(): Record<RekapPetugasDudukanTipe, number> {
  return { banjar: 0, bantuan: 0, kantor: 0 };
}

export async function getRekapPenerimaanDudukanPetugas(params: {
  dari?: string;
  sampai?: string;
  banjarId?: string;
  rtBtn?: string;
  /** Filter tipe petugas; kosong = semua. */
  tipe?: RekapPetugasDudukanTipe | "";
  /** Default: per tanggal. */
  kelompok?: RekapPenerimaanDudukanPetugasKelompok;
}): Promise<RekapPenerimaanDudukanPetugas> {
  const kelompok: RekapPenerimaanDudukanPetugasKelompok =
    params.kelompok === "perTriwulan" ? "perTriwulan" : "perTanggal";
  const db = await getDb();
  let sql = `
    SELECT p.tanggal,
           k.banjar_id,
           b.kode as banjar_kode,
           b.nama as banjar_nama,
           p.petugas_id,
           CASE
             WHEN p.petugas_id IS NULL OR TRIM(COALESCE(p.petugas_id, '')) = ''
               THEN 'Kantor / tanpa petugas'
             ELSE COALESCE(NULLIF(TRIM(t.nama), ''), '—')
           END as petugas_nama,
           t.tipe as petugas_tipe_raw,
           COALESCE(SUM(p.jumlah), 0) as jumlah
    FROM dudukan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
      AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
    WHERE p.jumlah > 0
  `;
  const args: unknown[] = [];
  let n = 1;
  if (params.dari?.trim()) {
    sql += ` AND p.tanggal >= $${n++}`;
    args.push(params.dari.trim());
  }
  if (params.sampai?.trim()) {
    sql += ` AND p.tanggal <= $${n++}`;
    args.push(params.sampai.trim());
  }
  if (params.banjarId?.trim()) {
    sql += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId.trim());
  }
  if (params.rtBtn?.trim()) {
    sql += ` AND TRIM(k.rt_btn) = $${n++}`;
    args.push(params.rtBtn.trim());
  }
  sql += `
    GROUP BY p.tanggal, k.banjar_id, p.petugas_id
    HAVING COALESCE(SUM(p.jumlah), 0) > 0
    ORDER BY p.tanggal ASC, b.kode ASC, petugas_nama ASC
  `;

  const flat = await db.select<PetugasAggRow[]>(sql, args);
  const tipeFilter = params.tipe?.trim()
    ? (params.tipe.trim() as RekapPetugasDudukanTipe)
    : null;

  type BanjarAcc = {
    meta: { banjar_nama: string; banjar_kode: string };
    petugasRows: RekapPetugasDudukanRow[];
    total: number;
    totalByTipe: Record<RekapPetugasDudukanTipe, number>;
  };

  /** Selalu per tanggal setor; mode triwulan hanya membungkus di builder tabel. */
  const byTanggal = new Map<string, Map<string, BanjarAcc>>();
  let grandTotal = 0;
  let rowCount = 0;
  const totalsByTipe = emptyTotalsByTipe();

  for (const r of flat) {
    const jumlah = roundRp(r.jumlah);
    if (jumlah <= 0) continue;

    const petugas_tipe = resolveRekapPetugasDudukanTipe(r.petugas_id, r.petugas_tipe_raw);
    if (tipeFilter && petugas_tipe !== tipeFilter) continue;

    let byBanjar = byTanggal.get(r.tanggal);
    if (!byBanjar) {
      byBanjar = new Map();
      byTanggal.set(r.tanggal, byBanjar);
    }

    let banjar = byBanjar.get(r.banjar_id);
    if (!banjar) {
      banjar = {
        meta: { banjar_nama: r.banjar_nama, banjar_kode: r.banjar_kode },
        petugasRows: [],
        total: 0,
        totalByTipe: emptyTotalsByTipe(),
      };
      byBanjar.set(r.banjar_id, banjar);
    }

    banjar.petugasRows.push({
      petugas_id: r.petugas_id,
      petugas_nama: r.petugas_nama?.trim() || "—",
      petugas_tipe,
      jumlah,
    });
    banjar.total = roundRp(banjar.total + jumlah);
    banjar.totalByTipe[petugas_tipe] = roundRp(banjar.totalByTipe[petugas_tipe] + jumlah);
    grandTotal = roundRp(grandTotal + jumlah);
    totalsByTipe[petugas_tipe] = roundRp(totalsByTipe[petugas_tipe] + jumlah);
    rowCount += 1;
  }

  const groups: RekapPenerimaanDudukanTanggalGroup[] = [];

  for (const tanggal of [...byTanggal.keys()].sort()) {
    const byBanjar = byTanggal.get(tanggal)!;
    const banjarGroups: RekapPenerimaanDudukanBanjarGroupPetugas[] = [];
    let tanggalTotal = 0;

    for (const [banjar_id, acc] of [...byBanjar.entries()].sort((a, b) =>
      compareBanjarKode(a[1].meta.banjar_kode, b[1].meta.banjar_kode)
    )) {
      acc.petugasRows.sort((a, b) => {
        const ti = REKAP_PETUGAS_TIPE_ORDER.indexOf(a.petugas_tipe);
        const tj = REKAP_PETUGAS_TIPE_ORDER.indexOf(b.petugas_tipe);
        if (ti !== tj) return ti - tj;
        return a.petugas_nama.localeCompare(b.petugas_nama, "id", { sensitivity: "base" });
      });
      tanggalTotal = roundRp(tanggalTotal + acc.total);
      banjarGroups.push({
        banjar_id,
        banjar_nama: acc.meta.banjar_nama,
        banjar_kode: acc.meta.banjar_kode,
        petugasRows: acc.petugasRows,
        total: acc.total,
        totalByTipe: acc.totalByTipe,
      });
    }

    groups.push({ tanggal, banjarGroups, total: tanggalTotal });
  }

  return { kelompok, groups, grandTotal, rowCount, totalsByTipe };
}

export type RekapPenerimaanDudukanPetugasTableRow =
  | { kind: "triwulan-header"; triwulan: string; label: string }
  | { kind: "triwulan-subtotal"; triwulan: string; label: string; total: number }
  | { kind: "spacer" }
  | { kind: "banjar-header"; tanggal: string; banjar_nama: string }
  | {
      kind: "data";
      tanggal: string;
      uraian: string;
      tipe: RekapPetugasDudukanTipe;
      jumlah: number;
    }
  | {
      kind: "tipe-subtotal";
      tanggal: string;
      tipe: RekapPetugasDudukanTipe;
      label: string;
      total: number;
    }
  | { kind: "banjar-subtotal"; tanggal: string; banjar_nama: string; total: number }
  | { kind: "tipe-grand-total"; tipe: RekapPetugasDudukanTipe; label: string; total: number }
  | { kind: "grand-total"; total: number };

export function buildRekapPenerimaanDudukanPetugasTableRows(
  rekap: RekapPenerimaanDudukanPetugas
): RekapPenerimaanDudukanPetugasTableRow[] {
  const out: RekapPenerimaanDudukanPetugasTableRow[] = [];
  const wrapTriwulan = rekap.kelompok === "perTriwulan";
  let currentTriwulan = "";
  let triwulanTotal = 0;
  let pendingSpacerBeforeBanjarHeader = false;

  const flushTriwulanSubtotal = () => {
    if (!wrapTriwulan || !currentTriwulan) return;
    out.push({
      kind: "triwulan-subtotal",
      triwulan: currentTriwulan,
      label: formatTriwulanSubtotalLaporan(currentTriwulan),
      total: triwulanTotal,
    });
    pendingSpacerBeforeBanjarHeader = false;
  };

  for (const tanggalGroup of rekap.groups) {
    if (wrapTriwulan) {
      const tw = triwulanKeyFromTanggal(tanggalGroup.tanggal);
      if (tw !== currentTriwulan) {
        flushTriwulanSubtotal();
        currentTriwulan = tw;
        triwulanTotal = 0;
        out.push({
          kind: "triwulan-header",
          triwulan: tw,
          label: formatTriwulanLabel(tw),
        });
      }
      triwulanTotal = roundRp(triwulanTotal + tanggalGroup.total);
    }

    for (const banjarGroup of tanggalGroup.banjarGroups) {
      if (pendingSpacerBeforeBanjarHeader) {
        out.push({ kind: "spacer" });
        pendingSpacerBeforeBanjarHeader = false;
      }

      out.push({
        kind: "banjar-header",
        tanggal: tanggalGroup.tanggal,
        banjar_nama: banjarGroup.banjar_nama,
      });

      for (const tipe of REKAP_PETUGAS_TIPE_ORDER) {
        const rows = banjarGroup.petugasRows.filter((p) => p.petugas_tipe === tipe);
        if (rows.length === 0) continue;

        for (const p of rows) {
          out.push({
            kind: "data",
            tanggal: tanggalGroup.tanggal,
            uraian: p.petugas_nama,
            tipe,
            jumlah: p.jumlah,
          });
        }
        out.push({
          kind: "tipe-subtotal",
          tanggal: tanggalGroup.tanggal,
          tipe,
          label: formatRekapPetugasDudukanTipeSubtotal(tipe),
          total: banjarGroup.totalByTipe[tipe],
        });
      }

      out.push({
        kind: "banjar-subtotal",
        tanggal: tanggalGroup.tanggal,
        banjar_nama: banjarGroup.banjar_nama,
        total: banjarGroup.total,
      });
      pendingSpacerBeforeBanjarHeader = true;
    }
  }

  flushTriwulanSubtotal();

  for (const tipe of REKAP_PETUGAS_TIPE_ORDER) {
    const total = rekap.totalsByTipe[tipe];
    if (total <= 0) continue;
    out.push({
      kind: "tipe-grand-total",
      tipe,
      label: `Jumlah keseluruhan ${formatRekapPetugasDudukanTipeLabel(tipe)}`,
      total,
    });
  }

  out.push({ kind: "grand-total", total: rekap.grandTotal });
  return out;
}
