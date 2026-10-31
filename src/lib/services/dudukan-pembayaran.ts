import { getDb } from "../db/client";
import { parseIsoDateString } from "../date-iso";
import {
  hitungSisaDudukan,
  hitungTagihanDudukanPeriode,
  isDudukanBerlakuUntukPeriode,
  isPeriodeDudukanDalamMasaBerlaku,
  parseBulan,
  parseJumlahPembayaran,
  parseTahun,
  periodeKey,
  pesanDudukanBelumBerlakuPeriode,
} from "../dudukan-hitung";
import { isJabatanPenerimaSemuaBanjar } from "../petugas-jabatan";
import type { DudukanPembayaranRow } from "../types";
import { uuid } from "../utils";
import {
  assertAkunForPembayaranDudukan,
  getDefaultAkunDudukanId,
} from "./akun-keuangan";
import { getKeringananPeriodeMapForKrama } from "./dudukan-keringanan";
import { assertKramaAktifUntukPembayaran } from "./krama";
import { assertPembayaranBelumMasukSetoran } from "./setoran";

/** Data krama+jenis yang dipakai hitung tagihan/sisa — dimuat sekali per simpan multi-bulan. */
type KramaDudukanTagihanContext = {
  tanggal_terdaftar: string;
  tanggal_berlaku_mulai_pemasih: string | null;
  masa_berlaku_tahun: number | null;
  tarif_nominal: number;
};

export type DudukanPembayaranSaveOptions = {
  /** Impor riwayat — izinkan krama nonaktif & lewati validasi tagihan periode. */
  riwayatImport?: boolean;
};

export type JenisSnapshot = {
  jenis_krama_tamiu_id: string | null;
  jenis_tamiu_id: string | null;
  jenis_nama: string | null;
};

/** Ambil jenis krama saat ini untuk disimpan sebagai snapshot pembayaran. */
export async function getJenisSnapshotForKrama(kramaId: string): Promise<JenisSnapshot> {
  const db = await getDb();
  const rows = await db.select<
    {
      jenis_krama_tamiu_id: string | null;
      jenis_tamiu_id: string | null;
      jenis_nama: string | null;
    }[]
  >(
    `SELECT k.jenis_krama_tamiu_id, k.jenis_tamiu_id,
            COALESCE(jt.nama, jkt.nama) as jenis_nama
     FROM krama k
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     WHERE k.id = $1`,
    [kramaId]
  );
  const row = rows[0];
  if (!row) throw new Error("Krama tidak ditemukan");
  const nama = row.jenis_nama?.trim();
  return {
    jenis_krama_tamiu_id: row.jenis_krama_tamiu_id,
    jenis_tamiu_id: row.jenis_tamiu_id,
    jenis_nama: nama || null,
  };
}

async function loadKramaDudukanTagihanContext(
  kramaId: string
): Promise<KramaDudukanTagihanContext> {
  const loaded = await loadKramaDudukanSaveContext(kramaId);
  return loaded.ctx;
}

/** Konteks tagihan + snapshot jenis dalam satu SELECT (hemat round-trip multi-bulan). */
async function loadKramaDudukanSaveContext(kramaId: string): Promise<{
  ctx: KramaDudukanTagihanContext;
  jenisSnap: JenisSnapshot;
}> {
  const db = await getDb();
  const rows = await db.select<
    (KramaDudukanTagihanContext & {
      jenis_krama_tamiu_id: string | null;
      jenis_tamiu_id: string | null;
      jenis_nama: string | null;
    })[]
  >(
    `SELECT k.tanggal_terdaftar, k.tanggal_berlaku_mulai_pemasih,
            COALESCE(jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun,
            COALESCE(jkt.dudukan_nominal, jt.dudukan_nominal, 0) as tarif_nominal,
            k.jenis_krama_tamiu_id, k.jenis_tamiu_id,
            COALESCE(jt.nama, jkt.nama) as jenis_nama
     FROM krama k
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.id = $1`,
    [kramaId]
  );
  const row = rows[0];
  if (!row) throw new Error("Krama tidak ditemukan");
  const nama = row.jenis_nama?.trim();
  return {
    ctx: {
      tanggal_terdaftar: row.tanggal_terdaftar,
      tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
      masa_berlaku_tahun: row.masa_berlaku_tahun,
      tarif_nominal: Number(row.tarif_nominal) || 0,
    },
    jenisSnap: {
      jenis_krama_tamiu_id: row.jenis_krama_tamiu_id,
      jenis_tamiu_id: row.jenis_tamiu_id,
      jenis_nama: nama || null,
    },
  };
}

function assertDudukanBerlakuDenganContext(
  ctx: KramaDudukanTagihanContext,
  tahun: number,
  bulan: number
): void {
  if (!isDudukanBerlakuUntukPeriode(ctx.tanggal_terdaftar, tahun, bulan)) {
    throw new Error(pesanDudukanBelumBerlakuPeriode(ctx.tanggal_terdaftar));
  }
  if (
    !isPeriodeDudukanDalamMasaBerlaku(
      ctx.tanggal_terdaftar,
      ctx.tanggal_berlaku_mulai_pemasih,
      ctx.masa_berlaku_tahun,
      tahun,
      bulan
    )
  ) {
    throw new Error("Periode di luar masa berlaku pemasih");
  }
  const tagihan = hitungTagihanDudukanPeriode(
    ctx.tarif_nominal,
    ctx.tanggal_terdaftar,
    tahun,
    bulan
  );
  if (tagihan <= 0) {
    throw new Error("Tidak ada kewajiban dudukan untuk periode ini");
  }
}

function sisaDudukanDenganContext(
  ctx: KramaDudukanTagihanContext,
  tahun: number,
  bulan: number,
  dibayar: number,
  keringanan: number
): number {
  if (
    !isPeriodeDudukanDalamMasaBerlaku(
      ctx.tanggal_terdaftar,
      ctx.tanggal_berlaku_mulai_pemasih,
      ctx.masa_berlaku_tahun,
      tahun,
      bulan
    )
  ) {
    return 0;
  }
  const tagihan = hitungTagihanDudukanPeriode(
    ctx.tarif_nominal,
    ctx.tanggal_terdaftar,
    tahun,
    bulan
  );
  return hitungSisaDudukan(tagihan, dibayar, keringanan);
}

function assertPembayaranDudukanItemDenganContext(
  ctx: KramaDudukanTagihanContext,
  tahun: number,
  bulan: number,
  jumlah: number,
  dibayar: number,
  keringanan: number
): void {
  assertDudukanBerlakuDenganContext(ctx, tahun, bulan);
  const sisa = sisaDudukanDenganContext(ctx, tahun, bulan, dibayar, keringanan);
  const amt = parseJumlahPembayaran(jumlah);
  if (sisa <= 0) {
    throw new Error(`Tidak ada sisa tagihan untuk ${bulan}/${tahun}`);
  }
  if (amt > sisa) {
    throw new Error(`Jumlah melebihi sisa tagihan untuk ${bulan}/${tahun}`);
  }
}

async function assertDudukanBerlakuUntukKrama(
  kramaId: string,
  tahun: number,
  bulan: number
): Promise<void> {
  const ctx = await loadKramaDudukanTagihanContext(kramaId);
  assertDudukanBerlakuDenganContext(ctx, tahun, bulan);
}

async function assertPetugasForKrama(petugasId: string, kramaId: string): Promise<void> {
  if (!petugasId?.trim()) throw new Error("Petugas wajib dipilih");
  const db = await getDb();
  const rows = await db.select<{ jabatan: string; same_banjar: number }[]>(
    `SELECT t.jabatan,
            CASE WHEN t.banjar_id = k.banjar_id THEN 1 ELSE 0 END as same_banjar
     FROM tim_kasukretan t
     CROSS JOIN krama k
     WHERE t.id = $1 AND k.id = $2`,
    [petugasId, kramaId]
  );
  const row = rows[0];
  if (!row) throw new Error("Petugas atau krama tidak ditemukan");
  if (row.same_banjar === 1 || isJabatanPenerimaSemuaBanjar(row.jabatan)) return;
  throw new Error("Petugas harus dari banjar krama yang sama");
}

export async function getTotalDibayarMap(
  tahun: number,
  bulan: number
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ krama_id: string; total: number }[]>(
    `SELECT krama_id, COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE tahun = $1 AND bulan = $2
     GROUP BY krama_id`,
    [parseTahun(tahun), parseBulan(bulan)]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.krama_id, Math.round(Number(row.total) || 0));
  }
  return map;
}

/** Total uang diterima per krama berdasarkan TANGGAL transaksi (bukan periode tagihan). */
export async function getDiterimaTanggalRangeMap(
  dari: string,
  sampai: string
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ krama_id: string; total: number }[]>(
    `SELECT krama_id, COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE tanggal >= $1 AND tanggal <= $2
     GROUP BY krama_id`,
    [dari, sampai]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.krama_id, Math.round(Number(row.total) || 0));
  }
  return map;
}

export async function getDibayarPeriodeMapForKrama(
  kramaId: string
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ tahun: number; bulan: number; total: number }[]>(
    `SELECT tahun, bulan, COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE krama_id = $1
     GROUP BY tahun, bulan`,
    [kramaId]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(
      periodeKey(row.tahun, row.bulan),
      Math.round(Number(row.total) || 0)
    );
  }
  return map;
}

export type DibayarPeriodeByKrama = Map<string, Map<string, number>>;

function buildDibayarPeriodeMaps(
  rows: { krama_id: string; tahun: number; bulan: number; total: number }[]
): DibayarPeriodeByKrama {
  const result: DibayarPeriodeByKrama = new Map();
  for (const row of rows) {
    let map = result.get(row.krama_id);
    if (!map) {
      map = new Map();
      result.set(row.krama_id, map);
    }
    map.set(
      periodeKey(row.tahun, row.bulan),
      Math.round(Number(row.total) || 0)
    );
  }
  return result;
}

/** Pembayaran dudukan per periode, diindeks per krama pemasih aktif (satu query). */
export async function getDibayarPeriodeMapsForPemasihAktif(): Promise<DibayarPeriodeByKrama> {
  const db = await getDb();
  const rows = await db.select<
    { krama_id: string; tahun: number; bulan: number; total: number }[]
  >(
    `SELECT p.krama_id, p.tahun, p.bulan, COALESCE(SUM(p.jumlah), 0) as total
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU') AND k.status_krama = 'aktif'
     GROUP BY p.krama_id, p.tahun, p.bulan`
  );
  return buildDibayarPeriodeMaps(rows);
}

/** Sama seperti di atas, tetapi hanya untuk id krama tertentu (filter daftar). */
export async function getDibayarPeriodeMapsForKramaIds(
  kramaIds: string[]
): Promise<DibayarPeriodeByKrama> {
  if (kramaIds.length === 0) return new Map();
  const db = await getDb();
  const ph = kramaIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<
    { krama_id: string; tahun: number; bulan: number; total: number }[]
  >(
    `SELECT p.krama_id, p.tahun, p.bulan, COALESCE(SUM(p.jumlah), 0) as total
     FROM dudukan_pembayaran p
     WHERE p.krama_id IN (${ph})
     GROUP BY p.krama_id, p.tahun, p.bulan`,
    kramaIds
  );
  return buildDibayarPeriodeMaps(rows);
}

export async function getTotalDibayarMapForKramaIds(
  tahun: number,
  bulan: number,
  kramaIds: string[]
): Promise<Map<string, number>> {
  if (kramaIds.length === 0) return new Map();
  const db = await getDb();
  const ph = kramaIds.map((_, i) => `$${i + 3}`).join(", ");
  const rows = await db.select<{ krama_id: string; total: number }[]>(
    `SELECT krama_id, COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE tahun = $1 AND bulan = $2 AND krama_id IN (${ph})
     GROUP BY krama_id`,
    [parseTahun(tahun), parseBulan(bulan), ...kramaIds]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.krama_id, Math.round(Number(row.total) || 0));
  }
  return map;
}

export type LastPembayaranTanggalByKrama = Map<string, Map<string, string>>;

export async function getLastPembayaranTanggalMapsForPemasihAktif(): Promise<LastPembayaranTanggalByKrama> {
  const db = await getDb();
  const rows = await db.select<
    { krama_id: string; tahun: number; bulan: number; tanggal: string }[]
  >(
    `SELECT p.krama_id, p.tahun, p.bulan, MAX(p.tanggal) as tanggal
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU') AND k.status_krama = 'aktif'
     GROUP BY p.krama_id, p.tahun, p.bulan`
  );
  const result: LastPembayaranTanggalByKrama = new Map();
  for (const row of rows) {
    if (!row.tanggal) continue;
    let map = result.get(row.krama_id);
    if (!map) {
      map = new Map();
      result.set(row.krama_id, map);
    }
    map.set(periodeKey(row.tahun, row.bulan), row.tanggal);
  }
  return result;
}

export type LastPembayaranPeriodeInfo = {
  tanggal: string;
  petugas_nama: string;
};

export async function getLastPembayaranInfoPeriodeMapForKrama(
  kramaId: string
): Promise<Map<string, LastPembayaranPeriodeInfo>> {
  const db = await getDb();
  const rows = await db.select<
    {
      tahun: number;
      bulan: number;
      tanggal: string;
      petugas_nama: string | null;
      created_at: string;
    }[]
  >(
    `SELECT p.tahun, p.bulan, p.tanggal, t.nama as petugas_nama, p.created_at
     FROM dudukan_pembayaran p
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE p.krama_id = $1
     ORDER BY p.tanggal DESC, p.created_at DESC`,
    [kramaId]
  );
  const map = new Map<string, LastPembayaranPeriodeInfo>();
  for (const row of rows) {
    if (!row.tanggal) continue;
    const key = periodeKey(row.tahun, row.bulan);
    if (map.has(key)) continue;
    map.set(key, {
      tanggal: row.tanggal,
      petugas_nama: row.petugas_nama?.trim() || "—",
    });
  }
  return map;
}

export async function getLastPembayaranTanggalPeriodeMapForKrama(
  kramaId: string
): Promise<Map<string, string>> {
  const info = await getLastPembayaranInfoPeriodeMapForKrama(kramaId);
  const map = new Map<string, string>();
  for (const [key, row] of info) {
    map.set(key, row.tanggal);
  }
  return map;
}

export async function getTotalDibayar(kramaId: string, tahun: number, bulan: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE krama_id = $1 AND tahun = $2 AND bulan = $3`,
    [kramaId, parseTahun(tahun), parseBulan(bulan)]
  );
  return Math.round(Number(rows[0]?.total) || 0);
}

export type DudukanRiwayatRow = {
  id: string;
  krama_id: string;
  nomor_kartu: string;
  kepala_nama: string;
  banjar_id: string;
  banjar_nama: string;
  alamat: string;
  rt_btn: string;
  klasifikasi_kode: string;
  jenis_nama: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  tanggal: string;
  petugas_nama?: string | null;
  keterangan?: string | null;
};

export async function listRiwayatPembayaranDudukan(params?: {
  tahun?: number;
  bulan?: number;
  banjarId?: string;
  rtBtn?: string;
  petugasId?: string;
  dari?: string;
  sampai?: string;
  klasifikasi?: "KRAMA_TAMIU" | "TAMIU";
  q?: string;
}): Promise<DudukanRiwayatRow[]> {
  const db = await getDb();
  let sql = `
    SELECT p.id, p.krama_id, k.nomor_kartu, pd.nama_lengkap as kepala_nama,
           k.banjar_id, b.nama as banjar_nama,
           COALESCE(NULLIF(TRIM(k.alamat), ''), '—') as alamat,
           COALESCE(NULLIF(TRIM(k.rt_btn), ''), '—') as rt_btn,
           kk.kode as klasifikasi_kode,
           COALESCE(
             NULLIF(TRIM(p.jenis_nama), ''),
             jt_snap.nama,
             jkt_snap.nama,
             jt.nama,
             jkt.nama,
             '—'
           ) as jenis_nama,
           p.tahun, p.bulan, p.jumlah, p.tanggal,
           t.nama as petugas_nama, p.keterangan
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
    LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
    WHERE 1=1
  `;
  const args: unknown[] = [];
  let n = 1;
  if (params?.tahun != null) {
    sql += ` AND p.tahun = $${n++}`;
    args.push(parseTahun(params.tahun));
  }
  if (params?.bulan != null) {
    sql += ` AND p.bulan = $${n++}`;
    args.push(parseBulan(params.bulan));
  }
  if (params?.banjarId) {
    sql += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId);
  }
  if (params?.rtBtn?.trim()) {
    sql += ` AND TRIM(k.rt_btn) = $${n++}`;
    args.push(params.rtBtn.trim());
  }
  if (params?.petugasId) {
    sql += ` AND p.petugas_id = $${n++}`;
    args.push(params.petugasId);
  }
  if (params?.dari?.trim()) {
    sql += ` AND p.tanggal >= $${n++}`;
    args.push(params.dari.trim());
  }
  if (params?.sampai?.trim()) {
    sql += ` AND p.tanggal <= $${n++}`;
    args.push(params.sampai.trim());
  }
  if (params?.klasifikasi) {
    sql += ` AND kk.kode = $${n++}`;
    args.push(params.klasifikasi);
  }
  if (params?.q?.trim()) {
    const q = `%${params.q.trim()}%`;
    sql += ` AND (k.nomor_kartu LIKE $${n} OR pd.nama_lengkap LIKE $${n + 1})`;
    args.push(q, q);
    n += 2;
  }
  sql += ` ORDER BY p.tanggal DESC, p.created_at DESC, k.nomor_kartu ASC`;

  const rows = await db.select<DudukanRiwayatRow[]>(sql, args);
  return rows.map((r) => ({
    ...r,
    tahun: Number(r.tahun),
    bulan: Number(r.bulan),
    jumlah: Math.round(Number(r.jumlah) || 0),
  }));
}

export async function listPembayaranDudukan(
  kramaId: string,
  tahun: number,
  bulan: number
): Promise<DudukanPembayaranRow[]> {
  const db = await getDb();
  return db.select<DudukanPembayaranRow[]>(
    `SELECT p.*, t.nama as petugas_nama, t.jabatan as petugas_jabatan,
            a.nama as akun_keuangan_nama
     FROM dudukan_pembayaran p
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
     WHERE p.krama_id = $1 AND p.tahun = $2 AND p.bulan = $3
     ORDER BY p.tanggal DESC, p.created_at DESC`,
    [kramaId, parseTahun(tahun), parseBulan(bulan)]
  );
}

export async function getSisaDudukanKramaPeriode(
  kramaId: string,
  tahun: number,
  bulan: number
): Promise<number> {
  const ctx = await loadKramaDudukanTagihanContext(kramaId);
  const t = parseTahun(tahun);
  const b = parseBulan(bulan);
  const db = await getDb();
  const [dibayar, kerRows] = await Promise.all([
    getTotalDibayar(kramaId, t, b),
    db.select<{ jumlah: number }[]>(
      `SELECT jumlah FROM dudukan_keringanan
       WHERE krama_id = $1 AND tahun = $2 AND bulan = $3`,
      [kramaId, t, b]
    ),
  ]);
  const keringanan = Math.round(Number(kerRows[0]?.jumlah) || 0);
  return sisaDudukanDenganContext(ctx, t, b, dibayar, keringanan);
}

export async function assertDudukanPaymentAllowed(
  kramaId: string,
  tahun: number,
  bulan: number,
  jumlah: number
): Promise<void> {
  const ctx = await loadKramaDudukanTagihanContext(kramaId);
  const t = parseTahun(tahun);
  const b = parseBulan(bulan);
  const db = await getDb();
  const [dibayar, kerRows] = await Promise.all([
    getTotalDibayar(kramaId, t, b),
    db.select<{ jumlah: number }[]>(
      `SELECT jumlah FROM dudukan_keringanan
       WHERE krama_id = $1 AND tahun = $2 AND bulan = $3`,
      [kramaId, t, b]
    ),
  ]);
  const keringanan = Math.round(Number(kerRows[0]?.jumlah) || 0);
  assertPembayaranDudukanItemDenganContext(ctx, t, b, jumlah, dibayar, keringanan);
}

export async function listRiwayatDudukanKrama(
  kramaId: string,
  limit = 30
): Promise<DudukanPembayaranRow[]> {
  const db = await getDb();
  return db.select<DudukanPembayaranRow[]>(
    `SELECT p.*, t.nama as petugas_nama, t.jabatan as petugas_jabatan,
            a.nama as akun_keuangan_nama
     FROM dudukan_pembayaran p
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
     WHERE p.krama_id = $1
     ORDER BY p.tanggal DESC, p.tahun DESC, p.bulan DESC, p.created_at DESC
     LIMIT $2`,
    [kramaId, limit]
  );
}

/** Jumlah placeholder bind per baris (created_at memakai datetime('now')). */
const DUDUKAN_PEMBAYARAN_INSERT_COLS = 13;

/** Simpan pembayaran untuk beberapa bulan sekaligus (validasi batch, satu INSERT multi-row). */
export async function createPembayaranDudukanMulti(
  params: {
    kramaId: string;
    tanggal: string;
    petugasId: string;
    keterangan?: string;
    akunKeuanganId?: string;
    items: { tahun: number; bulan: number; jumlah: number }[];
    /** `false` = uang masih dipegang petugas, masuk buku kas saat disetor. */
    disetorLangsung?: boolean;
  },
  opts?: DudukanPembayaranSaveOptions
): Promise<string[]> {
  if (!params.items.length) {
    throw new Error("Pilih minimal satu bulan untuk dibayar");
  }

  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal pembayaran tidak valid");
  if (!opts?.riwayatImport) await assertKramaAktifUntukPembayaran(params.kramaId);
  await assertPetugasForKrama(params.petugasId, params.kramaId);

  const db = await getDb();
  const akunId = params.akunKeuanganId?.trim() || (await getDefaultAkunDudukanId());
  await assertAkunForPembayaranDudukan(akunId);

  const skipValidasi = Boolean(opts?.riwayatImport);
  const [saveCtx, dibayarMap, keringananMap] = await Promise.all([
    loadKramaDudukanSaveContext(params.kramaId),
    skipValidasi
      ? Promise.resolve(new Map<string, number>())
      : getDibayarPeriodeMapForKrama(params.kramaId),
    skipValidasi
      ? Promise.resolve(new Map<string, number>())
      : getKeringananPeriodeMapForKrama(params.kramaId),
  ]);
  const { ctx, jenisSnap } = saveCtx;
  const ctxValidasi = skipValidasi ? null : ctx;

  const keterangan = params.keterangan?.trim() || null;
  const tanggalSetor = params.disetorLangsung === false ? null : tanggal;
  const pendingDibayar = new Map<string, number>();
  const rows: { id: string; args: unknown[] }[] = [];

  for (const item of params.items) {
    const tahun = parseTahun(item.tahun);
    const bulan = parseBulan(item.bulan);
    const jumlah = parseJumlahPembayaran(item.jumlah);
    const key = periodeKey(tahun, bulan);

    if (ctxValidasi) {
      const dibayar =
        (dibayarMap.get(key) ?? 0) + (pendingDibayar.get(key) ?? 0);
      const keringanan = keringananMap.get(key) ?? 0;
      assertPembayaranDudukanItemDenganContext(
        ctxValidasi,
        tahun,
        bulan,
        jumlah,
        dibayar,
        keringanan
      );
      pendingDibayar.set(key, (pendingDibayar.get(key) ?? 0) + jumlah);
    }

    const id = uuid();
    rows.push({
      id,
      args: [
        id,
        params.kramaId,
        tahun,
        bulan,
        jumlah,
        tanggal,
        params.petugasId,
        akunId,
        keterangan,
        jenisSnap.jenis_krama_tamiu_id,
        jenisSnap.jenis_tamiu_id,
        jenisSnap.jenis_nama,
        tanggalSetor,
      ],
    });
  }

  const valueParts: string[] = [];
  const bindArgs: unknown[] = [];
  for (let i = 0; i < rows.length; i++) {
    const base = i * DUDUKAN_PEMBAYARAN_INSERT_COLS;
    const ph = Array.from(
      { length: DUDUKAN_PEMBAYARAN_INSERT_COLS },
      (_, j) => `$${base + j + 1}`
    ).join(", ");
    valueParts.push(`(${ph}, datetime('now'))`);
    bindArgs.push(...rows[i]!.args);
  }

  await db.execute(
    `INSERT INTO dudukan_pembayaran
      (id, krama_id, tahun, bulan, jumlah, tanggal, petugas_id, akun_keuangan_id, keterangan,
       jenis_krama_tamiu_id, jenis_tamiu_id, jenis_nama, tanggal_setor, created_at)
     VALUES ${valueParts.join(", ")}`,
    bindArgs
  );

  const ids = rows.map((r) => r.id);
  const { tryAutoPushPayments } = await import("../sync/auto-push-payment");
  void tryAutoPushPayments({ dudukanIds: ids });

  return ids;
}

export async function createPembayaranDudukan(
  params: {
    kramaId: string;
    tahun: number;
    bulan: number;
    jumlah: number;
    tanggal: string;
    petugasId: string;
    keterangan?: string;
    akunKeuanganId?: string;
  },
  opts?: DudukanPembayaranSaveOptions
): Promise<string> {
  const ids = await createPembayaranDudukanMulti(
    {
      kramaId: params.kramaId,
      tanggal: params.tanggal,
      petugasId: params.petugasId,
      keterangan: params.keterangan,
      akunKeuanganId: params.akunKeuanganId,
      items: [
        { tahun: params.tahun, bulan: params.bulan, jumlah: params.jumlah },
      ],
    },
    opts
  );
  return ids[0]!;
}

export async function updatePembayaranDudukan(
  id: string,
  params: {
    kramaId: string;
    tahun: number;
    bulan: number;
    jumlah: number;
    tanggal: string;
    petugasId: string;
    keterangan?: string;
    akunKeuanganId?: string;
  },
  opts?: DudukanPembayaranSaveOptions
): Promise<void> {
  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal pembayaran tidak valid");
  if (!opts?.riwayatImport) {
    await assertDudukanBerlakuUntukKrama(params.kramaId, params.tahun, params.bulan);
  }
  await assertPembayaranBelumMasukSetoran("dudukan", id);
  await assertPetugasForKrama(params.petugasId, params.kramaId);

  const db = await getDb();
  const akunId = params.akunKeuanganId?.trim();
  if (akunId) await assertAkunForPembayaranDudukan(akunId);
  await db.execute(
    `UPDATE dudukan_pembayaran SET
      tahun = $1, bulan = $2, jumlah = $3, tanggal = $4, petugas_id = $5, keterangan = $6,
      akun_keuangan_id = COALESCE($7, akun_keuangan_id),
      tanggal_setor = CASE WHEN tanggal_setor IS NULL THEN NULL ELSE $4 END
     WHERE id = $8`,
    [
      parseTahun(params.tahun),
      parseBulan(params.bulan),
      parseJumlahPembayaran(params.jumlah),
      tanggal,
      params.petugasId,
      params.keterangan?.trim() || null,
      akunId ?? null,
      id,
    ]
  );
}

export async function deletePembayaranDudukan(
  id: string,
  alasan: import("./pembayaran-hapus-log").AlasanHapusPembayaran
): Promise<void> {
  await assertPembayaranBelumMasukSetoran("dudukan", id);
  const { catatHapusPembayaran } = await import("./pembayaran-hapus-log");
  await catatHapusPembayaran("dudukan", id, alasan);
  const db = await getDb();
  await db.execute(`DELETE FROM dudukan_pembayaran WHERE id = $1`, [id]);
  const { queuePaymentDeletion } = await import("../sync/payment-deletions");
  const { tryAutoPushPaymentDeletions } = await import("../sync/auto-push-payment");
  await queuePaymentDeletion("dudukan", id);
  void tryAutoPushPaymentDeletions();
}
