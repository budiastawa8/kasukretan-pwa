import { getDb } from "../db/client";
import {
  hitungSisaPaturunan,
  hitungTagihanPaturunan,
  isLunasPaturunan,
  isPastTanggalTarget,
  isPeringatanTelat,
  resolvePersenPaturunanIuran,
} from "../paturunan-hitung";
import { cachedQuery } from "../query-cache";
import { listBanjar } from "./master";
import { getIuranPaturunan, listIuranPaturunan } from "./iuran-paturunan";
import { getPembayaranTotalsMap } from "./paturunan-pembayaran";
import type { KramaDetail } from "../types";
import { previewStatusIlikita } from "./krama";
import { getDesaAdat } from "./desa";

export type PaturunanKramaRow = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  jenis_id?: string | null;
  jenis_nama: string;
  paturunan_persen: number | null;
  nyada_sejak?: string | null;
  paturunan_persen_sebelum_nyada?: number | null;
  nyada_sampai?: string | null;
  paturunan_persen_nyada?: number | null;
  tagihan?: number;
  /** Total pembayaran wajib (bukan punia). */
  dibayar?: number;
  punia?: number;
  sisa?: number;
  lunas?: boolean;
  peringatan_telat?: boolean;
  masa_berlaku_tahun?: number | null;
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  tempek_nama?: string | null;
  tempek_created_at?: string | null;
  arahan_nama?: string | null;
  arahan_created_at?: string | null;
  nomor_kontak?: string | null;
  status_pipil: string;
  tanggal_terdaftar: string;
};

export type PaturunanJenisRingkasan = {
  jenis_id: string;
  jenis_nama: string;
  paturunan_persen: number;
  jumlah_krama: number;
};

export type PaturunanRingkasan = {
  totalMipilAktif: number;
  perJenis: PaturunanJenisRingkasan[];
};

export type RingkasanIuranPerJenis = {
  jenis_id: string;
  jenis_nama: string;
  paturunan_persen: number;
  jumlah_krama: number;
  total_tagihan: number;
};

export type RingkasanIuran = {
  iuran_id: string;
  iuran_nama: string;
  nominal: number;
  tanggal_target?: string | null;
  lewat_target: boolean;
  jumlah_belum_lunas_telat: number;
  total_krama: number;
  total_tagihan: number;
  total_dibayar_wajib: number;
  total_punia: number;
  total_sisa: number;
  perJenis: RingkasanIuranPerJenis[];
};

export type PeringatanIuranItem = {
  iuran_id: string;
  iuran_nama: string;
  tanggal_target: string;
  jumlah_belum_lunas: number;
};

/**
 * Ekspresi SQL persen paturunan per iuran — harus selaras dengan
 * `resolvePersenPaturunanIuran` (tanggal target vs masa Nyada).
 * `targetPh` = placeholder tanggal target iuran (mis. `$1`).
 */
export function sqlPersenPaturunanIuran(targetPh: string): string {
  return `CASE
    WHEN ${targetPh} IS NULL OR TRIM(COALESCE(${targetPh}, '')) = ''
      THEN COALESCE(jm.paturunan_persen, 0)
    WHEN k.nyada_sejak IS NOT NULL AND TRIM(COALESCE(k.nyada_sejak, '')) <> ''
         AND ${targetPh} < k.nyada_sejak
      THEN COALESCE(jprev.paturunan_persen, jm.paturunan_persen, 0)
    WHEN k.nyada_sampai IS NOT NULL AND TRIM(COALESCE(k.nyada_sampai, '')) <> ''
         AND ${targetPh} < k.nyada_sampai AND jny.paturunan_persen IS NOT NULL
      THEN jny.paturunan_persen
    ELSE COALESCE(jm.paturunan_persen, 0)
  END`;
}

/** Tagihan = round(nominal * persen / 100) — selaras Math.round untuk nilai positif. */
function sqlTagihanPaturunan(nominalPh: string, targetPh: string): string {
  return `CAST(ROUND(${nominalPh} * (${sqlPersenPaturunanIuran(targetPh)}) / 100.0) AS INTEGER)`;
}

const PATURUNAN_RINGKASAN_FROM = `
  FROM krama k
  JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
  LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
  LEFT JOIN jenis_krama_mipil jprev ON jprev.id = k.jenis_sebelum_nyada_id
  LEFT JOIN desa_adat d ON d.id = k.desa_adat_id
  LEFT JOIN jenis_krama_mipil jny ON jny.id = d.jenis_krama_mipil_id
  LEFT JOIN (
    SELECT krama_id,
           COALESCE(SUM(CASE WHEN COALESCE(jenis, 'wajib') = 'punia' THEN 0 ELSE jumlah END), 0) AS wajib,
           COALESCE(SUM(CASE WHEN COALESCE(jenis, 'wajib') = 'punia' THEN jumlah ELSE 0 END), 0) AS punia
    FROM paturunan_pembayaran
    WHERE iuran_id = $3
    GROUP BY krama_id
  ) pay ON pay.krama_id = k.id
  WHERE kk.kode = 'MIPIL' AND k.status_krama = 'aktif'
`;

/** Hitung tagihan/sisa tanpa preview status Pipil (untuk daftar halaman). */
function applyPaturunanFinancials(
  rows: PaturunanKramaRow[],
  opts: {
    nominal: number;
    tanggalTarget: string | null;
    totalsMap: Map<string, { wajib: number; punia: number }>;
  }
): void {
  const { nominal, tanggalTarget, totalsMap } = opts;
  for (const row of rows) {
    const persen = resolvePersenPaturunanIuran({
      persen: row.paturunan_persen,
      persenSebelumNyada: row.paturunan_persen_sebelum_nyada,
      nyadaSejak: row.nyada_sejak,
      persenNyada: row.paturunan_persen_nyada,
      nyadaSampai: row.nyada_sampai,
      tanggalTarget,
    });
    const tagihan = hitungTagihanPaturunan(nominal, persen);
    const totals = totalsMap.get(row.id) ?? { wajib: 0, punia: 0 };
    row.tagihan = tagihan;
    row.dibayar = totals.wajib;
    row.punia = totals.punia;
    row.sisa = hitungSisaPaturunan(tagihan, totals.wajib);
    row.lunas = isLunasPaturunan(tagihan, totals.wajib);
    row.peringatan_telat = isPeringatanTelat(tanggalTarget, tagihan, totals.wajib);
  }
}

export async function countBelumLunasTelat(iuranId: string): Promise<number> {
  const iuran = await getIuranPaturunan(iuranId);
  if (!iuran || !isPastTanggalTarget(iuran.tanggal_target)) return 0;

  const nominal = Number(iuran.nominal) || 0;
  const target = iuran.tanggal_target?.trim() || null;
  const db = await getDb();
  const tagihanExpr = sqlTagihanPaturunan("$1", "$2");
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c
     ${PATURUNAN_RINGKASAN_FROM}
       AND (${tagihanExpr}) > 0
       AND COALESCE(pay.wajib, 0) < (${tagihanExpr})`,
    [nominal, target, iuranId]
  );
  return Number(rows[0]?.c ?? 0);
}

export async function listPeringatanIuranAktif(): Promise<PeringatanIuranItem[]> {
  const iuranList = await listIuranPaturunan();
  const overdue = iuranList.filter((i) => {
    const target = i.tanggal_target?.trim();
    return Boolean(target && isPastTanggalTarget(target));
  });
  if (!overdue.length) return [];

  const counts = await Promise.all(overdue.map((i) => countBelumLunasTelat(i.id)));
  const items: PeringatanIuranItem[] = [];
  for (let i = 0; i < overdue.length; i++) {
    const jumlah = counts[i];
    if (jumlah > 0) {
      items.push({
        iuran_id: overdue[i].id,
        iuran_nama: overdue[i].nama,
        tanggal_target: overdue[i].tanggal_target!.trim(),
        jumlah_belum_lunas: jumlah,
      });
    }
  }
  return items;
}

export async function getPaturunanRingkasan(): Promise<PaturunanRingkasan> {
  return cachedQuery("paturunan:ringkasan-mipil", async () => {
    const db = await getDb();
    const perJenis = await db.select<PaturunanJenisRingkasan[]>(
      `SELECT jm.id as jenis_id, jm.nama as jenis_nama, jm.paturunan_persen,
              (SELECT COUNT(*) FROM krama k
               INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
               WHERE k.jenis_krama_mipil_id = jm.id AND k.status_krama = 'aktif') as jumlah_krama
       FROM jenis_krama_mipil jm
       WHERE jm.aktif = 1
       ORDER BY jm.nama ASC`
    );

    const totalRow = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM krama k
       JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       WHERE kk.kode = 'MIPIL' AND k.status_krama = 'aktif'`
    );

    return {
      totalMipilAktif: totalRow[0]?.c ?? 0,
      perJenis: perJenis.map((j) => ({
        ...j,
        jumlah_krama: Number(j.jumlah_krama) || 0,
        paturunan_persen: Number(j.paturunan_persen) || 0,
      })),
    };
  });
}

export async function getRingkasanIuran(iuranId: string): Promise<RingkasanIuran | null> {
  return cachedQuery(`paturunan:ringkasan-iuran:${iuranId}`, async () => {
    const iuran = await getIuranPaturunan(iuranId);
    if (!iuran) return null;

    const nominal = Number(iuran.nominal) || 0;
    const target = iuran.tanggal_target?.trim() || null;
    const lewat_target = isPastTanggalTarget(iuran.tanggal_target);
    const db = await getDb();
    const tagihanExpr = sqlTagihanPaturunan("$1", "$2");

    const [ringkasan, aggRows, perJenisTagihan] = await Promise.all([
      getPaturunanRingkasan(),
      db.select<{
        total_tagihan: number;
        total_dibayar_wajib: number;
        total_punia: number;
        total_sisa: number;
        jumlah_belum_lunas_telat: number;
      }[]>(
        `SELECT
           COALESCE(SUM(${tagihanExpr}), 0) AS total_tagihan,
           COALESCE(SUM(COALESCE(pay.wajib, 0)), 0) AS total_dibayar_wajib,
           COALESCE(SUM(COALESCE(pay.punia, 0)), 0) AS total_punia,
           COALESCE(SUM(CASE
             WHEN (${tagihanExpr}) > COALESCE(pay.wajib, 0)
             THEN (${tagihanExpr}) - COALESCE(pay.wajib, 0)
             ELSE 0
           END), 0) AS total_sisa,
           COALESCE(SUM(CASE
             WHEN ${lewat_target ? 1 : 0} = 1
              AND (${tagihanExpr}) > 0
              AND COALESCE(pay.wajib, 0) < (${tagihanExpr})
             THEN 1 ELSE 0
           END), 0) AS jumlah_belum_lunas_telat
         ${PATURUNAN_RINGKASAN_FROM}`,
        [nominal, target, iuranId]
      ),
      db.select<{ jenis_id: string | null; total_tagihan: number }[]>(
        `SELECT k.jenis_krama_mipil_id AS jenis_id,
                COALESCE(SUM(${tagihanExpr}), 0) AS total_tagihan
         ${PATURUNAN_RINGKASAN_FROM}
         GROUP BY k.jenis_krama_mipil_id`,
        [nominal, target, iuranId]
      ),
    ]);

    const agg = aggRows[0];
    const tagihanPerJenis = new Map<string, number>();
    for (const r of perJenisTagihan) {
      if (!r.jenis_id) continue;
      tagihanPerJenis.set(r.jenis_id, Number(r.total_tagihan) || 0);
    }

    const perJenis: RingkasanIuranPerJenis[] = ringkasan.perJenis.map((j) => ({
      jenis_id: j.jenis_id,
      jenis_nama: j.jenis_nama,
      paturunan_persen: j.paturunan_persen,
      jumlah_krama: j.jumlah_krama,
      total_tagihan: tagihanPerJenis.get(j.jenis_id) ?? 0,
    }));

    return {
      iuran_id: iuran.id,
      iuran_nama: iuran.nama,
      nominal,
      tanggal_target: iuran.tanggal_target,
      lewat_target,
      jumlah_belum_lunas_telat: Number(agg?.jumlah_belum_lunas_telat ?? 0),
      total_krama: ringkasan.totalMipilAktif,
      total_tagihan: Number(agg?.total_tagihan ?? 0),
      total_dibayar_wajib: Number(agg?.total_dibayar_wajib ?? 0),
      total_punia: Number(agg?.total_punia ?? 0),
      total_sisa: Number(agg?.total_sisa ?? 0),
      perJenis,
    };
  });
}

export type PaturunanListFilter = {
  banjarId?: string;
  tempekId?: string;
  jenisMipilId?: string;
  q?: string;
  iuranId?: string;
};

export type PaturunanListParams = PaturunanListFilter & {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: "asc" | "desc";
};

const PATURUNAN_LIST_FROM = `
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
    JOIN penduduk p ON p.id = k.kepala_penduduk_id
    LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
    LEFT JOIN jenis_krama_mipil jprev ON jprev.id = k.jenis_sebelum_nyada_id
    LEFT JOIN desa_adat d ON d.id = k.desa_adat_id
    LEFT JOIN jenis_krama_mipil jny ON jny.id = d.jenis_krama_mipil_id
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tempek tp ON tp.id = k.tempek_id
    LEFT JOIN arahan ar ON ar.id = k.arahan_id
`;

const PATURUNAN_SQL_ORDER: Record<string, string> = {
  nomor_kartu: "k.nomor_kartu",
  kepala_nama: "p.nama_lengkap COLLATE NOCASE",
  jenis_nama: "jm.nama COLLATE NOCASE",
  tempek_nama: "tp.nama COLLATE NOCASE",
  arahan_nama: "ar.nama COLLATE NOCASE",
  banjar_nama: "b.nama COLLATE NOCASE",
};

const PATURUNAN_MEMORY_SORT = new Set(["tagihan", "dibayar", "sisa", "punia"]);

function buildPaturunanListWhere(params?: PaturunanListFilter): { where: string; args: unknown[] } {
  let where = `WHERE kk.kode = 'MIPIL' AND k.status_krama = 'aktif'`;
  const args: unknown[] = [];
  let n = 1;
  if (params?.banjarId) {
    where += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId);
  }
  if (params?.tempekId) {
    where += ` AND k.tempek_id = $${n++}`;
    args.push(params.tempekId);
  }
  if (params?.jenisMipilId) {
    where += ` AND k.jenis_krama_mipil_id = $${n++}`;
    args.push(params.jenisMipilId);
  }
  if (params?.q) {
    const q = `%${params.q}%`;
    where += ` AND (
      k.nomor_kartu LIKE $${n}
      OR p.nama_lengkap LIKE $${n + 1}
      OR EXISTS (
        SELECT 1
        FROM anggota_keluarga ak
        JOIN penduduk pm ON pm.id = ak.penduduk_id
        WHERE ak.krama_id = k.id
          AND ak.status = 'aktif'
          AND pm.nama_lengkap LIKE $${n + 2}
      )
    )`;
    args.push(q, q, q);
  }
  return { where, args };
}

function paturunanOrderSql(orderBy?: string, orderDir?: "asc" | "desc"): string {
  const col = orderBy ? PATURUNAN_SQL_ORDER[orderBy] : undefined;
  if (!col) {
    return `ORDER BY b.kode ASC, COALESCE(tp.created_at, '') ASC, COALESCE(ar.created_at, '') ASC, k.nomor_kartu ASC`;
  }
  const dir = orderDir === "desc" ? "DESC" : "ASC";
  return `ORDER BY ${col} ${dir}, k.nomor_kartu ASC`;
}

async function enrichPaturunanRows(
  rows: PaturunanKramaRow[],
  iuranId?: string
): Promise<void> {
  const desa = await getDesaAdat();
  for (const row of rows) {
    row.nomor_kontak = row.nomor_kontak?.trim() || null;
    const stub: KramaDetail = {
      id: row.id,
      nomor_kartu: row.nomor_kartu,
      jenis_kartu: "NPK",
      klasifikasi_kode: "MIPIL",
      klasifikasi_nama: "Krama Mipil",
      gelar_kepala: "Pengarep",
      banjar_id: "",
      banjar_nama: row.banjar_nama,
      banjar_kode: "",
      masa_berlaku_tahun: row.masa_berlaku_tahun,
      tanggal_terdaftar: row.tanggal_terdaftar,
      status_krama: "aktif",
      status_pipil: row.status_pipil,
      status_pemasih: "aktif",
      kepala: { id: "", nama_lengkap: row.kepala_nama, jenis_kelamin: "" },
      anggota_aktif: [],
    };
    previewStatusIlikita(stub, desa);
    row.status_pipil = stub.status_pipil ?? row.status_pipil;
  }

  if (!iuranId) return;
  const iuran = await getIuranPaturunan(iuranId);
  if (!iuran) return;
  const totalsMap = await getPembayaranTotalsMap(
    iuranId,
    rows.map((r) => r.id)
  );
  applyPaturunanFinancials(rows, {
    nominal: Number(iuran.nominal) || 0,
    tanggalTarget: iuran.tanggal_target ?? null,
    totalsMap,
  });
}

function sortPaturunanMemory(
  rows: PaturunanKramaRow[],
  orderBy: string,
  orderDir?: "asc" | "desc"
): PaturunanKramaRow[] {
  const dir = orderDir === "desc" ? -1 : 1;
  const key = orderBy as keyof PaturunanKramaRow;
  return [...rows].sort((a, b) => {
    const av = Number(a[key] ?? 0);
    const bv = Number(b[key] ?? 0);
    if (av !== bv) return (av < bv ? -1 : 1) * dir;
    return a.nomor_kartu.localeCompare(b.nomor_kartu);
  });
}

export async function countKramaPaturunan(params?: PaturunanListFilter): Promise<number> {
  const db = await getDb();
  const { where, args } = buildPaturunanListWhere(params);
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c ${PATURUNAN_LIST_FROM} ${where}`,
    args
  );
  return Number(rows[0]?.c ?? 0);
}

export async function listKramaPaturunan(params?: PaturunanListParams): Promise<PaturunanKramaRow[]> {
  const db = await getDb();
  const { where, args } = buildPaturunanListWhere(params);
  const memorySort = params?.orderBy && PATURUNAN_MEMORY_SORT.has(params.orderBy);
  const useSqlPage =
    !memorySort && params?.limit != null && Number.isFinite(params.limit);

  let sql = `
    SELECT k.id, k.nomor_kartu, k.nomor_kontak, k.status_pipil, k.tanggal_terdaftar,
           p.nama_lengkap as kepala_nama,
           k.jenis_krama_mipil_id as jenis_id,
           jm.nama as jenis_nama, jm.paturunan_persen, jm.masa_berlaku_tahun,
           k.nyada_sejak, jprev.paturunan_persen as paturunan_persen_sebelum_nyada,
           k.nyada_sampai, jny.paturunan_persen as paturunan_persen_nyada,
           k.banjar_id, b.nama as banjar_nama, b.kode as banjar_kode,
           tp.nama as tempek_nama, tp.created_at as tempek_created_at,
           ar.nama as arahan_nama, ar.created_at as arahan_created_at
    ${PATURUNAN_LIST_FROM}
    ${where}
    ${paturunanOrderSql(memorySort ? undefined : params?.orderBy, params?.orderDir)}
  `;
  const bind = [...args];
  if (useSqlPage) {
    sql += ` LIMIT $${bind.length + 1}`;
    bind.push(Math.max(1, Math.floor(params!.limit!)));
    if (params?.offset != null && Number.isFinite(params.offset) && params.offset > 0) {
      sql += ` OFFSET $${bind.length + 1}`;
      bind.push(Math.max(0, Math.floor(params.offset)));
    }
  }

  let rows = await db.select<PaturunanKramaRow[]>(sql, bind);
  await enrichPaturunanRows(rows, params?.iuranId);

  if (memorySort && params?.orderBy) {
    rows = sortPaturunanMemory(rows, params.orderBy, params.orderDir);
    if (params.limit != null && Number.isFinite(params.limit)) {
      const start = Math.max(0, Math.floor(params.offset ?? 0));
      rows = rows.slice(start, start + Math.max(1, Math.floor(params.limit)));
    }
  }

  return rows;
}

export { listBanjar };
