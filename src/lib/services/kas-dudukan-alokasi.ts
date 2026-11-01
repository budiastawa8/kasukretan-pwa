import { parseIsoDateString } from "../date-iso";
import { formatRupiah } from "../dudukan-hitung";
import { getDb } from "../db/client";
import { isTimBantuanFiturAktif } from "../tim-bantuan";
import type {
  AkunKeuanganKelompok,
  KasDudukanAlokasiRow,
  PlafonAlokasiDudukanRow,
} from "../types";
import { uuid } from "../utils";
import {
  getDefaultAkunDudukanId,
  getKelompokAkunIntiId,
  isAkunInKelompokDanaKasukretanLainnya,
  isAkunInKelompokDanaTimBantuan,
  isAkunInKelompokKasDudukan,
  listAkunIdsInKelompok,
} from "./akun-keuangan";
import { getDesaAdat } from "./desa";

export const DEFAULT_ALOKASI_POS: { nama: string; persen: number; urutan: number }[] = [
  { nama: "Operasional Tim", persen: 30, urutan: 1 },
  { nama: "Administrasi dan Perawatan Sistem", persen: 5, urutan: 2 },
  { nama: "Sipandu Beradat", persen: 5, urutan: 3 },
  { nama: "Dana Pembangunan Desa Adat", persen: 60, urutan: 4 },
];

/** Pool plafon: Tim Banjar (+kantor) vs Tim Bantuan. */
export type PlafonPool = "utama" | "bantuan";

export function normalizePlafonPool(value: unknown): PlafonPool {
  return value === "bantuan" ? "bantuan" : "utama";
}

export function labelPlafonPool(pool: PlafonPool): string {
  return pool === "bantuan" ? "Tim Bantuan" : "Tim Banjar";
}

function roundRp(n: number): number {
  return Math.round(Number(n) || 0);
}

export function tahunDariTanggal(tanggal: string): number {
  const iso = parseIsoDateString(tanggal);
  if (!iso) throw new Error("Tanggal tidak valid");
  return parseInt(iso.slice(0, 4), 10);
}

/** Akun yang terikat plafon (Tim Banjar atau Tim Bantuan). */
export async function isAkunDalamPlafonUtama(akunId: string): Promise<boolean> {
  return (
    (await isAkunInKelompokKasDudukan(akunId)) ||
    (await isAkunInKelompokDanaKasukretanLainnya(akunId)) ||
    (await isAkunInKelompokDanaTimBantuan(akunId))
  );
}

/** Tentukan pool plafon dari akun pengeluaran. */
export async function resolvePlafonPoolFromAkun(akunId: string): Promise<PlafonPool> {
  if (await isAkunInKelompokDanaTimBantuan(akunId)) return "bantuan";
  return "utama";
}

export async function isPlafonTimBantuanAktif(): Promise<boolean> {
  const desa = await getDesaAdat();
  return isTimBantuanFiturAktif(desa);
}

function alokasiTable(pool: PlafonPool): string {
  return pool === "bantuan" ? "kas_tim_bantuan_alokasi" : "kas_dudukan_alokasi";
}

export async function listAlokasiKasDudukan(): Promise<KasDudukanAlokasiRow[]> {
  return listAlokasiPlafon("utama");
}

export async function listAlokasiPlafon(pool: PlafonPool = "utama"): Promise<KasDudukanAlokasiRow[]> {
  const db = await getDb();
  const table = alokasiTable(pool);
  return db.select<KasDudukanAlokasiRow[]>(
    `SELECT a.id, a.pos_biaya_id, a.persen, a.urutan, pb.nama as pos_biaya_nama
     FROM ${table} a
     JOIN pos_biaya pb ON pb.id = a.pos_biaya_id
     ORDER BY a.urutan, pb.nama`
  );
}

export async function listPosBiayaIdAlokasiKasDudukan(): Promise<Set<string>> {
  return listPosBiayaIdAlokasiPlafon("utama");
}

export async function listPosBiayaIdAlokasiPlafon(pool: PlafonPool): Promise<Set<string>> {
  const rows = await listAlokasiPlafon(pool);
  return new Set(rows.map((r) => r.pos_biaya_id));
}

export async function isPosAlokasiKasDudukan(posBiayaId: string): Promise<boolean> {
  const db = await getDb();
  const utama = await db.select<{ id: string }[]>(
    `SELECT id FROM kas_dudukan_alokasi WHERE pos_biaya_id = ? LIMIT 1`,
    [posBiayaId]
  );
  if (utama.length > 0) return true;
  const bantuan = await db.select<{ id: string }[]>(
    `SELECT id FROM kas_tim_bantuan_alokasi WHERE pos_biaya_id = ? LIMIT 1`,
    [posBiayaId]
  );
  return bantuan.length > 0;
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
  return updateAlokasiPlafon("utama", items);
}

export async function updateAlokasiPlafon(
  pool: PlafonPool,
  items: { id: string; persen: number }[]
): Promise<void> {
  const existing = await listAlokasiPlafon(pool);
  const label = labelPlafonPool(pool);
  if (items.length !== existing.length) {
    throw new Error(`Semua baris alokasi ${label} wajib disertakan.`);
  }
  const byId = new Map(existing.map((r) => [r.id, r]));
  const updates: { id: string; persen: number }[] = [];
  for (const item of items) {
    if (!byId.has(item.id)) throw new Error("Baris alokasi tidak valid.");
    updates.push({ id: item.id, persen: Number(item.persen) });
  }
  assertPersenTotal(updates);

  const db = await getDb();
  const table = alokasiTable(pool);
  for (const u of updates) {
    await db.execute(`UPDATE ${table} SET persen = ? WHERE id = ?`, [u.persen, u.id]);
  }
}

async function listAkunIdsKelompokJenis(jenis: AkunKeuanganKelompok): Promise<string[]> {
  const kelompokId = await getKelompokAkunIntiId(jenis);
  if (kelompokId) {
    const ids = await listAkunIdsInKelompok(kelompokId);
    if (ids.length > 0) return ids;
  }
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM akun_keuangan
     WHERE jenis = ? AND COALESCE(is_kelompok, 0) = 0 AND aktif = 1
     ORDER BY urutan, nama`,
    [jenis]
  );
  return rows.map((r) => r.id);
}

async function resolvePlafonPengeluaranAkunIds(pool: PlafonPool): Promise<string[]> {
  const timBantuanAktif = await isPlafonTimBantuanAktif();
  if (pool === "bantuan") {
    if (!timBantuanAktif) return [];
    return listAkunIdsKelompokJenis("dana_tim_bantuan");
  }
  const [dudukan, danaLain] = await Promise.all([
    listAkunIdsKelompokJenis("kas_dudukan"),
    listAkunIdsKelompokJenis("dana_kasukretan_lainnya"),
  ]);
  const ids = [...dudukan, ...danaLain];
  // Toggle mati: pengeluaran dari akun Tim Bantuan (jika ada) ikut plafon utama.
  if (!timBantuanAktif) {
    ids.push(...(await listAkunIdsKelompokJenis("dana_tim_bantuan")));
  }
  return [...new Set(ids)];
}

function sqlInPlaceholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}

/**
 * Filter penerimaan menurut pool.
 * - Toggle mati: semua masuk pool utama; pool bantuan = 0.
 * - Toggle hidup: Tim Bantuan → bantuan; Tim Banjar + tanpa petugas → utama.
 */
function sqlPetugasPoolFilter(
  pool: PlafonPool,
  timBantuanAktif: boolean,
  petugasAlias: string
): { sql: string; args: unknown[] } {
  if (!timBantuanAktif) {
    if (pool === "bantuan") return { sql: " AND 1=0", args: [] };
    return { sql: "", args: [] };
  }
  if (pool === "bantuan") {
    return {
      sql: ` AND EXISTS (
        SELECT 1 FROM tim_kasukretan ${petugasAlias}
        WHERE ${petugasAlias}.id = p.petugas_id AND ${petugasAlias}.tipe = 'bantuan'
      )`,
      args: [],
    };
  }
  return {
    sql: ` AND (
      p.petugas_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM tim_kasukretan ${petugasAlias}
        WHERE ${petugasAlias}.id = p.petugas_id AND ${petugasAlias}.tipe = 'bantuan'
      )
    )`,
    args: [],
  };
}

export type RincianPenerimaanPlafonUtama = {
  dudukan: number;
  dana_lain: number;
  total: number;
};

export async function getRincianPenerimaanPlafonUtamaTahun(
  tahun: number,
  pool: PlafonPool = "utama"
): Promise<RincianPenerimaanPlafonUtama> {
  const db = await getDb();
  const timBantuanAktif = await isPlafonTimBantuanAktif();
  const petugasFilter = sqlPetugasPoolFilter(pool, timBantuanAktif, "tb");

  const dudukanAkunIds = await listAkunIdsKelompokJenis("kas_dudukan");
  let dudukan = 0;
  if (dudukanAkunIds.length > 0) {
    const rows = await db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(p.jumlah), 0) as total
       FROM dudukan_pembayaran p
       WHERE p.akun_keuangan_id IN (${sqlInPlaceholders(dudukanAkunIds.length)})
         AND p.tanggal_setor IS NOT NULL
         AND strftime('%Y', p.tanggal_setor) = ?
         ${petugasFilter.sql}`,
      [...dudukanAkunIds, String(tahun), ...petugasFilter.args]
    );
    dudukan = roundRp(rows[0]?.total ?? 0);
  }

  const rowsLain = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(p.jumlah), 0) as total
     FROM penerimaan_dana_lain p
     WHERE p.tanggal_setor IS NOT NULL
       AND strftime('%Y', p.tanggal_setor) = ?
       ${petugasFilter.sql}`,
    [String(tahun), ...petugasFilter.args]
  );
  const dana_lain = roundRp(rowsLain[0]?.total ?? 0);

  return { dudukan, dana_lain, total: roundRp(dudukan + dana_lain) };
}

/** @deprecated Gunakan getRincianPenerimaanPlafonUtamaTahun */
export async function getTotalPenerimaanDudukanTahun(
  _akunKeuanganId: string,
  tahun: number
): Promise<number> {
  const r = await getRincianPenerimaanPlafonUtamaTahun(tahun, "utama");
  return r.total;
}

export async function getRealisasiPengeluaranPerPos(
  _akunKeuanganId: string,
  tahun: number,
  excludeTransaksiId?: string,
  pool: PlafonPool = "utama"
): Promise<Map<string, number>> {
  const akunIds = await resolvePlafonPengeluaranAkunIds(pool);
  const map = new Map<string, number>();
  if (akunIds.length === 0) return map;

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
  plafon_pool?: PlafonPool;
};

export async function listPengeluaranDanaDudukanPerPos(
  _akunKeuanganId: string,
  tahun: number,
  posBiayaId?: string,
  pool: PlafonPool = "utama"
): Promise<PengeluaranDanaDudukanPerPosRow[]> {
  const akunIds = await resolvePlafonPengeluaranAkunIds(pool);
  if (akunIds.length === 0) return [];

  const db = await getDb();
  let sql = `
    SELECT t.id as transaksi_id, pp.pos_biaya_id, t.tanggal, a.nama as akun_keuangan_nama,
           t.keterangan as transaksi_keterangan, pp.keterangan as pos_keterangan,
           pp.jumlah, COALESCE(t.plafon_pool, 'utama') as plafon_pool
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
    plafon_pool: normalizePlafonPool(r.plafon_pool),
  }));
}

export async function listPengeluaranDanaDudukanPerPosDefaultAkun(
  tahun: number,
  posBiayaId?: string,
  pool: PlafonPool = "utama"
): Promise<PengeluaranDanaDudukanPerPosRow[]> {
  const akunId = await getDefaultAkunDudukanId();
  return listPengeluaranDanaDudukanPerPos(akunId, tahun, posBiayaId, pool);
}

export async function getPlafonAlokasiDudukan(
  akunKeuanganId: string,
  tahun: number,
  excludeTransaksiId?: string,
  pool: PlafonPool = "utama"
): Promise<{
  tahun: number;
  pool: PlafonPool;
  total_penerimaan: number;
  total_penerimaan_dudukan: number;
  total_penerimaan_dana_lain: number;
  rows: PlafonAlokasiDudukanRow[];
}> {
  const [alokasi, rincian, realisasi] = await Promise.all([
    listAlokasiPlafon(pool),
    getRincianPenerimaanPlafonUtamaTahun(tahun, pool),
    getRealisasiPengeluaranPerPos(akunKeuanganId, tahun, excludeTransaksiId, pool),
  ]);

  const totalPenerimaan = rincian.total;
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

  return {
    tahun,
    pool,
    total_penerimaan: totalPenerimaan,
    total_penerimaan_dudukan: rincian.dudukan,
    total_penerimaan_dana_lain: rincian.dana_lain,
    rows,
  };
}

export async function assertPengeluaranKasDudukanAllowed(
  akunKeuanganId: string,
  tanggal: string,
  lines: { posBiayaId: string; jumlah: number }[],
  excludeTransaksiId?: string,
  pool: PlafonPool = "utama"
): Promise<void> {
  const tahun = tahunDariTanggal(tanggal);
  const resolvedPool =
    pool === "bantuan" && !(await isPlafonTimBantuanAktif()) ? "utama" : normalizePlafonPool(pool);

  const alokasi = await listAlokasiPlafon(resolvedPool);
  const allowedIds = new Set(alokasi.map((a) => a.pos_biaya_id));
  const byPosNama = new Map(alokasi.map((a) => [a.pos_biaya_id, a.pos_biaya_nama ?? ""]));
  const poolLabel = labelPlafonPool(resolvedPool);

  for (const line of lines) {
    if (!allowedIds.has(line.posBiayaId)) {
      const names = alokasi.map((a) => a.pos_biaya_nama).join(", ");
      throw new Error(
        `Pengeluaran plafon ${poolLabel} hanya boleh memakai pos alokasi resmi: ${names}.`
      );
    }
  }

  const { rows: plafonRows } = await getPlafonAlokasiDudukan(
    akunKeuanganId,
    tahun,
    excludeTransaksiId,
    resolvedPool
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
        `${nama} (${poolLabel}) melebihi plafon tahun ${tahun}. Plafon: ${formatRupiah(p.plafon)} · sudah terpakai: ${formatRupiah(p.terpakai)} · diajukan: ${formatRupiah(delta)} · sisa: ${formatRupiah(Math.max(0, p.sisa))}.`
      );
    }
  }
}

async function seedAlokasiRowsIntoTable(
  db: Awaited<ReturnType<typeof getDb>>,
  table: "kas_dudukan_alokasi" | "kas_tim_bantuan_alokasi",
  items: { pos_biaya_id: string; persen: number; urutan: number }[]
): Promise<void> {
  for (const item of items) {
    await db.execute(
      `INSERT INTO ${table} (id, pos_biaya_id, persen, urutan, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [uuid(), item.pos_biaya_id, item.persen, item.urutan]
    );
  }
}

async function ensurePosForDefaultAlokasi(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<{ pos_biaya_id: string; persen: number; urutan: number }[]> {
  const out: { pos_biaya_id: string; persen: number; urutan: number }[] = [];
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
    out.push({ pos_biaya_id: posId, persen: item.persen, urutan: item.urutan });
  }
  return out;
}

/** Dipanggil dari migration — seed pos + alokasi default Tim Banjar. */
export async function seedKasDudukanAlokasiIfEmpty(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const count = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM kas_dudukan_alokasi`
  );
  if ((count[0]?.c ?? 0) > 0) return;
  const items = await ensurePosForDefaultAlokasi(db);
  await seedAlokasiRowsIntoTable(db, "kas_dudukan_alokasi", items);
}

/** Seed alokasi Tim Bantuan (salin dari Tim Banjar bila ada). */
export async function seedKasTimBantuanAlokasiIfEmpty(
  db: Awaited<ReturnType<typeof getDb>>
): Promise<void> {
  const count = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM kas_tim_bantuan_alokasi`
  );
  if ((count[0]?.c ?? 0) > 0) return;

  const dariUtama = await db.select<{ pos_biaya_id: string; persen: number; urutan: number }[]>(
    `SELECT pos_biaya_id, persen, urutan FROM kas_dudukan_alokasi ORDER BY urutan`
  );
  if (dariUtama.length > 0) {
    await seedAlokasiRowsIntoTable(db, "kas_tim_bantuan_alokasi", dariUtama);
    return;
  }
  const items = await ensurePosForDefaultAlokasi(db);
  await seedAlokasiRowsIntoTable(db, "kas_tim_bantuan_alokasi", items);
}

export async function getPlafonAlokasiDudukanDefaultAkun(
  tahun: number,
  excludeTransaksiId?: string,
  pool: PlafonPool = "utama"
): Promise<ReturnType<typeof getPlafonAlokasiDudukan>> {
  const akunId = await getDefaultAkunDudukanId();
  return getPlafonAlokasiDudukan(akunId, tahun, excludeTransaksiId, pool);
}
