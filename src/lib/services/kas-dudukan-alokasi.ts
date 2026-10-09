import { parseIsoDateString } from "../date-iso";
import { formatRupiah } from "../dudukan-hitung";
import { getDb } from "../db/client";
import type { KasDudukanAlokasiRow, PlafonAlokasiDudukanRow } from "../types";
import { uuid } from "../utils";
import {
  getDefaultAkunDudukanId,
  getKelompokAkunIntiId,
  isAkunInKelompokInti,
  listAkunIdsInKelompok,
  resolveKelompokIdForAkun,
} from "./akun-keuangan";

export const DEFAULT_ALOKASI_POS: { nama: string; persen: number; urutan: number }[] = [
  { nama: "Operasional Tim", persen: 30, urutan: 1 },
  { nama: "Administrasi dan Perawatan Sistem", persen: 5, urutan: 2 },
  { nama: "Sipandu Beradat", persen: 5, urutan: 3 },
  { nama: "Dana Pembangunan Desa Adat", persen: 60, urutan: 4 },
];

function roundRp(n: number): number {
  return Math.round(Number(n) || 0);
}

export function tahunDariTanggal(tanggal: string): number {
  const iso = parseIsoDateString(tanggal);
  if (!iso) throw new Error("Tanggal tidak valid");
  return parseInt(iso.slice(0, 4), 10);
}

export async function listAlokasiKasDudukan(): Promise<KasDudukanAlokasiRow[]> {
  const db = await getDb();
  return db.select<KasDudukanAlokasiRow[]>(
    `SELECT a.id, a.pos_biaya_id, a.persen, a.urutan, pb.nama as pos_biaya_nama
     FROM kas_dudukan_alokasi a
     JOIN pos_biaya pb ON pb.id = a.pos_biaya_id
     ORDER BY a.urutan, pb.nama`
  );
}

export async function listPosBiayaIdAlokasiKasDudukan(): Promise<Set<string>> {
  const rows = await listAlokasiKasDudukan();
  return new Set(rows.map((r) => r.pos_biaya_id));
}

export async function isPosAlokasiKasDudukan(posBiayaId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM kas_dudukan_alokasi WHERE pos_biaya_id = ? LIMIT 1`,
    [posBiayaId]
  );
  return rows.length > 0;
}

function assertPersenTotal(items: { persen: number }[]): void {
  const total = items.reduce((s, i) => s + (Number(i.persen) || 0), 0);
  if (Math.abs(total - 100) > 0.001) {
    throw new Error(`Total persentase alokasi harus 100% (saat ini ${total}%).`);
  }
  for (const item of items) {
    const p = Number(item.persen);
    if (!Number.isFinite(p) || p <= 0 || p > 100) {
      throw new Error("Setiap persentase alokasi harus antara 0 dan 100.");
    }
  }
}

export async function updateAlokasiKasDudukan(
  items: { id: string; persen: number }[]
): Promise<void> {
  const existing = await listAlokasiKasDudukan();
  if (items.length !== existing.length) {
    throw new Error("Semua baris alokasi Dana Dudukan wajib disertakan.");
  }
  const byId = new Map(existing.map((r) => [r.id, r]));
  const updates: { id: string; persen: number }[] = [];
  for (const item of items) {
    if (!byId.has(item.id)) throw new Error("Baris alokasi tidak valid.");
    updates.push({ id: item.id, persen: Number(item.persen) });
  }
  assertPersenTotal(updates);

  const db = await getDb();
  for (const u of updates) {
    await db.execute(`UPDATE kas_dudukan_alokasi SET persen = ? WHERE id = ?`, [u.persen, u.id]);
  }
}

async function resolvePlafonAkunIds(akunKeuanganId: string): Promise<string[]> {
  const kelompokId = await resolveKelompokIdForAkun(akunKeuanganId);
  if (kelompokId && (await isAkunInKelompokInti(akunKeuanganId, "kas_dudukan"))) {
    const ids = await listAkunIdsInKelompok(kelompokId);
    if (ids.length > 0) return ids;
  }
  const fallbackKelompok = await getKelompokAkunIntiId("kas_dudukan");
  if (fallbackKelompok) {
    const ids = await listAkunIdsInKelompok(fallbackKelompok);
    if (ids.length > 0) return ids;
  }
  return [akunKeuanganId];
}

function sqlInPlaceholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

export async function getTotalPenerimaanDudukanTahun(
  akunKeuanganId: string,
  tahun: number
): Promise<number> {
  const akunIds = await resolvePlafonAkunIds(akunKeuanganId);
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE akun_keuangan_id IN (${sqlInPlaceholders(akunIds.length)})
       AND strftime('%Y', tanggal) = ?`,
    [...akunIds, String(tahun)]
  );
  return roundRp(rows[0]?.total ?? 0);
}

export async function getRealisasiPengeluaranPerPos(
  akunKeuanganId: string,
  tahun: number,
  excludeTransaksiId?: string
): Promise<Map<string, number>> {
  const akunIds = await resolvePlafonAkunIds(akunKeuanganId);
  const db = await getDb();
  let sql = `
    SELECT pp.pos_biaya_id, COALESCE(SUM(pp.jumlah), 0) as total
    FROM transaksi_pengeluaran_pos pp
    JOIN transaksi_pengeluaran t ON t.id = pp.transaksi_id
    WHERE t.akun_keuangan_id IN (${sqlInPlaceholders(akunIds.length)})
      AND strftime('%Y', t.tanggal) = ?
  `;
  const args: unknown[] = [...akunIds, String(tahun)];
  if (excludeTransaksiId?.trim()) {
    sql += ` AND t.id != ?`;
    args.push(excludeTransaksiId.trim());
  }
  sql += ` GROUP BY pp.pos_biaya_id`;

  const rows = await db.select<{ pos_biaya_id: string; total: number }[]>(sql, args);
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.pos_biaya_id, roundRp(r.total));
  }
  return map;
}

export type PengeluaranDanaDudukanPerPosRow = {
  transaksi_id: string;
  pos_biaya_id: string;
  tanggal: string;
  akun_keuangan_nama: string;
  transaksi_keterangan: string | null;
  pos_keterangan: string | null;
  jumlah: number;
};

/** Daftar transaksi pengeluaran Dana Dudukan per tahun (opsional filter satu pos). */
export async function listPengeluaranDanaDudukanPerPos(
  akunKeuanganId: string,
  tahun: number,
  posBiayaId?: string
): Promise<PengeluaranDanaDudukanPerPosRow[]> {
  const akunIds = await resolvePlafonAkunIds(akunKeuanganId);
  const db = await getDb();
  let sql = `
    SELECT t.id as transaksi_id, pp.pos_biaya_id, t.tanggal, a.nama as akun_keuangan_nama,
           t.keterangan as transaksi_keterangan, pp.keterangan as pos_keterangan,
           pp.jumlah
    FROM transaksi_pengeluaran_pos pp
    JOIN transaksi_pengeluaran t ON t.id = pp.transaksi_id
    JOIN akun_keuangan a ON a.id = t.akun_keuangan_id
    WHERE t.akun_keuangan_id IN (${sqlInPlaceholders(akunIds.length)})
      AND strftime('%Y', t.tanggal) = ?
  `;
  const args: unknown[] = [...akunIds, String(tahun)];
  if (posBiayaId?.trim()) {
    sql += ` AND pp.pos_biaya_id = ?`;
    args.push(posBiayaId.trim());
  }
  sql += ` ORDER BY t.tanggal ASC, t.created_at ASC, pp.id ASC`;

  const rows = await db.select<PengeluaranDanaDudukanPerPosRow[]>(sql, args);
  return rows.map((r) => ({
    ...r,
    jumlah: roundRp(r.jumlah),
  }));
}

export async function listPengeluaranDanaDudukanPerPosDefaultAkun(
  tahun: number,
  posBiayaId?: string
): Promise<PengeluaranDanaDudukanPerPosRow[]> {
  const akunId = await getDefaultAkunDudukanId();
  return listPengeluaranDanaDudukanPerPos(akunId, tahun, posBiayaId);
}

export async function getPlafonAlokasiDudukan(
  akunKeuanganId: string,
  tahun: number,
  excludeTransaksiId?: string
): Promise<{
  tahun: number;
  total_penerimaan: number;
  rows: PlafonAlokasiDudukanRow[];
}> {
  const [alokasi, totalPenerimaan, realisasi] = await Promise.all([
    listAlokasiKasDudukan(),
    getTotalPenerimaanDudukanTahun(akunKeuanganId, tahun),
    getRealisasiPengeluaranPerPos(akunKeuanganId, tahun, excludeTransaksiId),
  ]);

  const rows: PlafonAlokasiDudukanRow[] = alokasi.map((a) => {
    const plafon = roundRp((totalPenerimaan * a.persen) / 100);
    const terpakai = realisasi.get(a.pos_biaya_id) ?? 0;
    return {
      pos_biaya_id: a.pos_biaya_id,
      pos_biaya_nama: a.pos_biaya_nama ?? "",
      persen: a.persen,
      plafon,
      terpakai,
      sisa: plafon - terpakai,
    };
  });

  return { tahun, total_penerimaan: totalPenerimaan, rows };
}

export async function assertPengeluaranKasDudukanAllowed(
  akunKeuanganId: string,
  tanggal: string,
  lines: { posBiayaId: string; jumlah: number }[],
  excludeTransaksiId?: string
): Promise<void> {
  const tahun = tahunDariTanggal(tanggal);
  const alokasi = await listAlokasiKasDudukan();
  const allowedIds = new Set(alokasi.map((a) => a.pos_biaya_id));
  const byPosNama = new Map(alokasi.map((a) => [a.pos_biaya_id, a.pos_biaya_nama ?? ""]));

  for (const line of lines) {
    if (!allowedIds.has(line.posBiayaId)) {
      const names = alokasi.map((a) => a.pos_biaya_nama).join(", ");
      throw new Error(
        `Pengeluaran Dana Dudukan hanya boleh memakai pos alokasi resmi: ${names}.`
      );
    }
  }

  const { rows: plafonRows } = await getPlafonAlokasiDudukan(
    akunKeuanganId,
    tahun,
    excludeTransaksiId
  );
  const plafonMap = new Map(plafonRows.map((r) => [r.pos_biaya_id, r]));

  const deltaByPos = new Map<string, number>();
  for (const line of lines) {
    deltaByPos.set(line.posBiayaId, (deltaByPos.get(line.posBiayaId) ?? 0) + line.jumlah);
  }

  for (const [posId, delta] of deltaByPos) {
    const p = plafonMap.get(posId);
    if (!p) continue;
    const setelah = p.terpakai + delta;
    if (setelah > p.plafon) {
      const nama = byPosNama.get(posId) ?? "Pos";
      throw new Error(
        `${nama} melebihi plafon tahun ${tahun}. Plafon: ${formatRupiah(p.plafon)} · sudah terpakai: ${formatRupiah(p.terpakai)} · diajukan: ${formatRupiah(delta)} · sisa: ${formatRupiah(Math.max(0, p.sisa))}.`
      );
    }
  }
}

/** Dipanggil dari migration — seed pos + alokasi default. */
export async function seedKasDudukanAlokasiIfEmpty(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const count = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM kas_dudukan_alokasi`
  );
  if ((count[0]?.c ?? 0) > 0) return;

  for (const item of DEFAULT_ALOKASI_POS) {
    const existingPos = await db.select<{ id: string }[]>(
      `SELECT id FROM pos_biaya WHERE TRIM(nama) = ? LIMIT 1`,
      [item.nama]
    );
    let posId = existingPos[0]?.id;
    if (!posId) {
      posId = uuid();
      await db.execute(
        `INSERT INTO pos_biaya (id, nama, urutan, aktif, created_at) VALUES (?, ?, ?, 1, datetime('now'))`,
        [posId, item.nama, item.urutan]
      );
    } else {
      await db.execute(`UPDATE pos_biaya SET urutan = ?, aktif = 1 WHERE id = ?`, [
        item.urutan,
        posId,
      ]);
    }
    await db.execute(
      `INSERT INTO kas_dudukan_alokasi (id, pos_biaya_id, persen, urutan, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [uuid(), posId, item.persen, item.urutan]
    );
  }
}

export async function getPlafonAlokasiDudukanDefaultAkun(
  tahun: number,
  excludeTransaksiId?: string
): Promise<ReturnType<typeof getPlafonAlokasiDudukan>> {
  const akunId = await getDefaultAkunDudukanId();
  return getPlafonAlokasiDudukan(akunId, tahun, excludeTransaksiId);
}
