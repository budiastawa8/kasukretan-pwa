import { getDb } from "../db/client";
import { compareBanjarKode, compareWilayahCreatedAt } from "../wilayah-order";

export type RekapPenerimaanArahanRow = {
  arahan_nama: string;
  wajib: number;
  punia: number;
  jumlah: number;
  transaksi: number;
};

export type RekapPenerimaanTempekRow = {
  tempek_nama: string;
  arahan: RekapPenerimaanArahanRow[];
  wajib: number;
  punia: number;
  jumlah: number;
  transaksi: number;
};

export type RekapPenerimaanBanjarRow = {
  banjar_nama: string;
  tempek: RekapPenerimaanTempekRow[];
  wajib: number;
  punia: number;
  jumlah: number;
  transaksi: number;
};

export type RekapPenerimaanPaturunan = {
  banjar: RekapPenerimaanBanjarRow[];
  total_wajib: number;
  total_punia: number;
  total_jumlah: number;
  total_transaksi: number;
};

export type RekapPenerimaanBulanTempekRow = {
  banjar_nama: string;
  banjar_kode: string;
  tempek_nama: string;
  perBulan: Record<string, number>;
  total: number;
};

export type RekapPenerimaanPaturunanPerBulan = {
  bulan: string[];
  bulanLabel: string[];
  rows: RekapPenerimaanBulanTempekRow[];
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

export function formatBulanBayarLabel(bulanKey: string): string {
  const [y, m] = bulanKey.split("-");
  const idx = Math.max(0, Math.min(11, (parseInt(m, 10) || 1) - 1));
  return `${BULAN_SINGKAT[idx]} ${y}`;
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

type AggRow = {
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  tempek_id: string;
  tempek_nama: string;
  tempek_created_at: string;
  arahan_id: string;
  arahan_nama: string;
  arahan_created_at: string;
  wajib: number;
  punia: number;
  jumlah: number;
  transaksi: number;
};

function roundRp(n: number): number {
  return Math.round(Number(n) || 0);
}

function sumRows(rows: { wajib: number; punia: number; jumlah: number; transaksi: number }[]) {
  return rows.reduce(
    (acc, r) => ({
      wajib: acc.wajib + r.wajib,
      punia: acc.punia + r.punia,
      jumlah: acc.jumlah + r.jumlah,
      transaksi: acc.transaksi + r.transaksi,
    }),
    { wajib: 0, punia: 0, jumlah: 0, transaksi: 0 }
  );
}


function compareCreatedAt(
  createdA: string | undefined,
  namaA: string,
  createdB: string | undefined,
  namaB: string
): number {
  const byCreated = compareWilayahCreatedAt(createdA, createdB);
  if (byCreated !== 0) return byCreated;
  return namaA.localeCompare(namaB, "id");
}

function buildTree(flat: AggRow[]): RekapPenerimaanPaturunan {
  const banjarMap = new Map<
    string,
    {
      banjar_nama: string;
      banjar_kode: string;
      tempekMap: Map<
        string,
        {
          tempek_nama: string;
          tempek_created_at: string;
          arahan: (RekapPenerimaanArahanRow & { arahan_created_at: string })[];
        }
      >;
    }
  >();

  for (const row of flat) {
    if (!banjarMap.has(row.banjar_id)) {
      banjarMap.set(row.banjar_id, {
        banjar_nama: row.banjar_nama,
        banjar_kode: row.banjar_kode,
        tempekMap: new Map(),
      });
    }
    const banjarBucket = banjarMap.get(row.banjar_id)!;
    const tempekKey = row.tempek_id || `nama:${row.tempek_nama}`;
    if (!banjarBucket.tempekMap.has(tempekKey)) {
      banjarBucket.tempekMap.set(tempekKey, {
        tempek_nama: row.tempek_nama,
        tempek_created_at: row.tempek_created_at,
        arahan: [],
      });
    }
    banjarBucket.tempekMap.get(tempekKey)!.arahan.push({
      arahan_nama: row.arahan_nama,
      wajib: row.wajib,
      punia: row.punia,
      jumlah: row.jumlah,
      transaksi: row.transaksi,
      arahan_created_at: row.arahan_created_at,
    });
  }

  const banjar: RekapPenerimaanBanjarRow[] = [...banjarMap.values()]
    .sort((a, b) => compareBanjarKode(a.banjar_kode, b.banjar_kode))
    .map((banjarBucket) => {
      const tempek: RekapPenerimaanTempekRow[] = [...banjarBucket.tempekMap.values()]
        .sort((a, b) =>
          compareCreatedAt(a.tempek_created_at, a.tempek_nama, b.tempek_created_at, b.tempek_nama)
        )
        .map((tempekBucket) => {
          const arahan = [...tempekBucket.arahan]
            .sort((a, b) =>
              compareCreatedAt(
                a.arahan_created_at,
                a.arahan_nama,
                b.arahan_created_at,
                b.arahan_nama
              )
            )
            .map(({ arahan_created_at: _c, ...rest }) => rest);
          const sub = sumRows(arahan);
          return { tempek_nama: tempekBucket.tempek_nama, arahan, ...sub };
        });
      const sub = sumRows(tempek);
      return { banjar_nama: banjarBucket.banjar_nama, tempek, ...sub };
    });

  const totals = sumRows(banjar);
  return {
    banjar,
    ...totals,
    total_wajib: totals.wajib,
    total_punia: totals.punia,
    total_jumlah: totals.jumlah,
    total_transaksi: totals.transaksi,
  };
}

export async function getRekapPenerimaanPaturunan(params: {
  dari?: string;
  sampai?: string;
  iuranId?: string;
}): Promise<RekapPenerimaanPaturunan> {
  const db = await getDb();
  let sql = `
    SELECT b.id as banjar_id,
           b.kode as banjar_kode,
           b.nama as banjar_nama,
           COALESCE(tp.id, '') as tempek_id,
           COALESCE(NULLIF(TRIM(tp.nama), ''), '—') as tempek_nama,
           COALESCE(tp.created_at, '') as tempek_created_at,
           COALESCE(ar.id, '') as arahan_id,
           COALESCE(NULLIF(TRIM(ar.nama), ''), '—') as arahan_nama,
           COALESCE(ar.created_at, '') as arahan_created_at,
           COALESCE(SUM(CASE WHEN COALESCE(p.jenis, 'wajib') = 'wajib' THEN p.jumlah ELSE 0 END), 0) as wajib,
           COALESCE(SUM(CASE WHEN COALESCE(p.jenis, 'wajib') = 'punia' THEN p.jumlah ELSE 0 END), 0) as punia,
           COALESCE(SUM(p.jumlah), 0) as jumlah,
           COUNT(*) as transaksi
    FROM paturunan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tempek tp ON tp.id = k.tempek_id
    LEFT JOIN arahan ar ON ar.id = k.arahan_id
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
  if (params.iuranId?.trim()) {
    sql += ` AND p.iuran_id = $${n++}`;
    args.push(params.iuranId.trim());
  }
  sql += `
    GROUP BY b.id, b.kode, b.nama,
             COALESCE(tp.id, ''),
             COALESCE(NULLIF(TRIM(tp.nama), ''), '—'),
             COALESCE(tp.created_at, ''),
             COALESCE(ar.id, ''),
             COALESCE(NULLIF(TRIM(ar.nama), ''), '—'),
             COALESCE(ar.created_at, '')
    HAVING COALESCE(SUM(p.jumlah), 0) > 0
    ORDER BY b.kode ASC, COALESCE(tp.created_at, '') ASC, COALESCE(ar.created_at, '') ASC
  `;

  const flat = await db.select<AggRow[]>(sql, args);
  return buildTree(
    flat.map((r) => ({
      banjar_id: r.banjar_id,
      banjar_kode: r.banjar_kode,
      banjar_nama: r.banjar_nama,
      tempek_id: r.tempek_id,
      tempek_nama: r.tempek_nama,
      tempek_created_at: r.tempek_created_at,
      arahan_id: r.arahan_id,
      arahan_nama: r.arahan_nama,
      arahan_created_at: r.arahan_created_at,
      wajib: roundRp(r.wajib),
      punia: roundRp(r.punia),
      jumlah: roundRp(r.jumlah),
      transaksi: Math.round(Number(r.transaksi) || 0),
    }))
  );
}

type AggBulanRow = {
  banjar_id: string;
  banjar_kode: string;
  banjar_nama: string;
  tempek_id: string;
  tempek_nama: string;
  tempek_created_at: string;
  bulan_bayar: string;
  jumlah: number;
};

export async function getRekapPenerimaanPaturunanPerBulan(params: {
  dari?: string;
  sampai?: string;
  iuranId?: string;
}): Promise<RekapPenerimaanPaturunanPerBulan> {
  const db = await getDb();
  let sql = `
    SELECT b.id as banjar_id,
           b.kode as banjar_kode,
           b.nama as banjar_nama,
           COALESCE(tp.id, '') as tempek_id,
           COALESCE(NULLIF(TRIM(tp.nama), ''), '—') as tempek_nama,
           COALESCE(tp.created_at, '') as tempek_created_at,
           strftime('%Y-%m', p.tanggal) as bulan_bayar,
           COALESCE(SUM(p.jumlah), 0) as jumlah
    FROM paturunan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tempek tp ON tp.id = k.tempek_id
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
  if (params.iuranId?.trim()) {
    sql += ` AND p.iuran_id = $${n++}`;
    args.push(params.iuranId.trim());
  }
  sql += `
    GROUP BY b.id, b.kode, b.nama,
             COALESCE(tp.id, ''),
             COALESCE(NULLIF(TRIM(tp.nama), ''), '—'),
             COALESCE(tp.created_at, ''),
             strftime('%Y-%m', p.tanggal)
    HAVING COALESCE(SUM(p.jumlah), 0) > 0
    ORDER BY b.kode ASC, COALESCE(tp.created_at, '') ASC, bulan_bayar ASC
  `;

  const flat = await db.select<AggBulanRow[]>(sql, args);
  const monthSet = new Set<string>();
  for (const r of flat) {
    if (r.bulan_bayar?.trim()) monthSet.add(r.bulan_bayar.trim());
  }

  const d = params.dari?.trim();
  const s = params.sampai?.trim();
  let bulan: string[];
  if (d && s) {
    bulan = enumerateMonthsBetween(d, s);
  } else {
    bulan = [...monthSet].sort();
  }

  type TempekBucket = {
    banjar_nama: string;
    banjar_kode: string;
    tempek_nama: string;
    tempek_created_at: string;
    perBulan: Record<string, number>;
    total: number;
  };

  const tempekMap = new Map<string, TempekBucket>();
  for (const r of flat) {
    const key = `${r.banjar_id}:${r.tempek_id || `nama:${r.tempek_nama}`}`;
    if (!tempekMap.has(key)) {
      tempekMap.set(key, {
        banjar_nama: r.banjar_nama,
        banjar_kode: r.banjar_kode,
        tempek_nama: r.tempek_nama,
        tempek_created_at: r.tempek_created_at,
        perBulan: {},
        total: 0,
      });
    }
    const bucket = tempekMap.get(key)!;
    const amt = roundRp(r.jumlah);
    const bk = r.bulan_bayar?.trim() || "";
    if (bk) {
      bucket.perBulan[bk] = (bucket.perBulan[bk] ?? 0) + amt;
    }
    bucket.total += amt;
  }

  const rows: RekapPenerimaanBulanTempekRow[] = [...tempekMap.values()]
    .sort((a, b) => {
      const byBanjar = compareBanjarKode(a.banjar_kode, b.banjar_kode);
      if (byBanjar !== 0) return byBanjar;
      return compareCreatedAt(
        a.tempek_created_at,
        a.tempek_nama,
        b.tempek_created_at,
        b.tempek_nama
      );
    })
    .map(({ banjar_nama, banjar_kode, tempek_nama, perBulan, total }) => ({
      banjar_nama,
      banjar_kode,
      tempek_nama,
      perBulan,
      total,
    }));

  const totalPerBulan: Record<string, number> = {};
  for (const bk of bulan) totalPerBulan[bk] = 0;
  let grandTotal = 0;
  for (const row of rows) {
    grandTotal += row.total;
    for (const bk of bulan) {
      totalPerBulan[bk] = (totalPerBulan[bk] ?? 0) + (row.perBulan[bk] ?? 0);
    }
  }

  return {
    bulan,
    bulanLabel: bulan.map(formatBulanBayarLabel),
    rows,
    totalPerBulan,
    grandTotal,
  };
}
