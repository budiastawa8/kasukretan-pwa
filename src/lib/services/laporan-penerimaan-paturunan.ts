import { getDb } from "../db/client";

export type LaporanPenerimaanPaturunan = {
  rows: LaporanPenerimaanPaturunanDataRow[];
  grandTotal: number;
  rowCount: number;
};

export type LaporanPenerimaanPaturunanDataRow = {
  tanggal: string;
  uraian: string;
  jumlah: number;
};

export type LaporanPenerimaanPaturunanTableRow =
  | { kind: "data"; tanggal: string; uraian: string; jumlah: number }
  | { kind: "grand-total"; total: number };

/** Uraian baris: Tempek — nama petugas. */
export function formatUraianPenerimaanPaturunan(tempekNama: string, petugasNama: string): string {
  const tempek = tempekNama.trim() || "—";
  const petugas = petugasNama.trim() || "—";
  return `${tempek} - ${petugas}`;
}

function roundRp(n: number): number {
  return Math.round(Number(n) || 0);
}

type AggRow = {
  tanggal: string;
  tempek_nama: string;
  tempek_created_at: string;
  petugas_nama: string;
  jumlah: number;
};

export function buildLaporanPenerimaanPaturunanTableRows(
  laporan: LaporanPenerimaanPaturunan
): LaporanPenerimaanPaturunanTableRow[] {
  const out: LaporanPenerimaanPaturunanTableRow[] = laporan.rows.map((r) => ({
    kind: "data",
    tanggal: r.tanggal,
    uraian: r.uraian,
    jumlah: r.jumlah,
  }));
  out.push({ kind: "grand-total", total: laporan.grandTotal });
  return out;
}

export async function getLaporanPenerimaanPaturunan(params: {
  dari?: string;
  sampai?: string;
  banjarId?: string;
  tempekId?: string;
  arahanId?: string;
}): Promise<LaporanPenerimaanPaturunan> {
  const db = await getDb();
  let sql = `
    SELECT p.tanggal,
           COALESCE(NULLIF(TRIM(tp.nama), ''), '—') as tempek_nama,
           COALESCE(tp.created_at, '') as tempek_created_at,
           COALESCE(NULLIF(TRIM(tk.nama), ''), '—') as petugas_nama,
           COALESCE(SUM(p.jumlah), 0) as jumlah
    FROM paturunan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
    LEFT JOIN tempek tp ON tp.id = k.tempek_id
    LEFT JOIN tim_kasukretan tk ON tk.id = p.petugas_id
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
  if (params.tempekId?.trim()) {
    sql += ` AND k.tempek_id = $${n++}`;
    args.push(params.tempekId.trim());
  }
  if (params.arahanId?.trim()) {
    sql += ` AND k.arahan_id = $${n++}`;
    args.push(params.arahanId.trim());
  }
  sql += `
    GROUP BY p.tanggal, k.tempek_id, p.petugas_id
    HAVING COALESCE(SUM(p.jumlah), 0) > 0
    ORDER BY p.tanggal ASC, COALESCE(tp.created_at, '') ASC, petugas_nama ASC
  `;

  const flat = await db.select<AggRow[]>(sql, args);
  const rows: LaporanPenerimaanPaturunanDataRow[] = [];
  let grandTotal = 0;

  for (const r of flat) {
    const jumlah = roundRp(r.jumlah);
    if (jumlah <= 0) continue;
    rows.push({
      tanggal: r.tanggal,
      uraian: formatUraianPenerimaanPaturunan(r.tempek_nama, r.petugas_nama),
      jumlah,
    });
    grandTotal += jumlah;
  }

  return { rows, grandTotal, rowCount: rows.length };
}
