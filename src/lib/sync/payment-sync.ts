import { parseIsoDateString } from "../date-iso";
import { parseJumlahPembayaran, parsePembayaranJenis } from "../paturunan-hitung";
import { parseBulan, parseTahun } from "../dudukan-hitung";
import { getDb } from "../db/client";
import {
  getDefaultAkunDudukanId,
  getDefaultAkunPaturunanId,
} from "../services/akun-keuangan";
import { cloudFetch } from "./cloud-config";
import type { FetchWithRetryOptions } from "../fetch-retry";
import {
  clearPendingPaymentDeletions,
  readPendingPaymentDeletions,
  type PendingPaymentDeletions,
} from "./payment-deletions";
import { clearPendingKeringananDeletions, readPendingKeringananDeletions } from "./keringanan-deletions";
import {
  applyKeringananPullRows,
  type KeringananRow,
} from "./keringanan-sync";
import { getSyncMeta, setSyncMeta } from "./sync-meta";

export type PushPaymentBucketResult = {
  inserted: number;
  skipped: number;
  deleted: number;
  errors: string[];
};

export type SyncPaymentBucket = {
  inserted: number;
  skipped: number;
  ignored: number;
  errors: string[];
};

export type SyncKeringananBucket = {
  inserted: number;
  skipped: number;
  errors: string[];
};

export type SyncPaymentResult = {
  paturunan: SyncPaymentBucket;
  dudukan: SyncPaymentBucket;
  keringanan: SyncKeringananBucket;
  lastPullAt: string;
};

const PAYMENT_PUSH_BATCH_SIZE = 300;
const PAYMENT_PUSH_FETCH_OPTS: FetchWithRetryOptions = {
  timeoutMs: 180_000,
  maxAttempts: 2,
  retryDelaysMs: [4_000],
};

const EMPTY_PAYMENT_DELETIONS: PendingPaymentDeletions = { paturunan: [], dudukan: [] };

function emptyPushBucket(): PushPaymentBucketResult {
  return { inserted: 0, skipped: 0, deleted: 0, errors: [] };
}

function mergePushBucket(a: PushPaymentBucketResult, b: PushPaymentBucketResult): PushPaymentBucketResult {
  return {
    inserted: a.inserted + b.inserted,
    skipped: a.skipped + b.skipped,
    deleted: a.deleted + b.deleted,
    errors: [...a.errors, ...b.errors],
  };
}

function chunkCount(length: number, size: number): number {
  return length === 0 ? 0 : Math.ceil(length / size);
}

const CLOUD_DEMO_IURAN_IDS = new Set(["iuran-001"]);
const CLOUD_DEMO_IURAN_NAMES = new Set(["iuran paturunan 2026"]);
const CLOUD_DEMO_KARTU = new Set(["npk01010001", "npkt01010001"]);

type PaturunanRow = {
  id: string;
  nomor_kartu: string;
  iuran_id: string;
  iuran_nama: string;
  jenis: string;
  jumlah: number;
  tanggal: string;
  banjar_kode: string;
  petugas_nama: string;
  akun_keuangan_id: string | null;
  keterangan: string | null;
  created_at: string;
};

type DudukanRow = {
  id: string;
  nomor_kartu: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  tanggal: string;
  banjar_kode: string;
  petugas_nama: string;
  akun_keuangan_id: string | null;
  keterangan: string | null;
  jenis_krama_tamiu_id: string | null;
  jenis_tamiu_id: string | null;
  jenis_nama: string | null;
  created_at: string;
};

async function resolveLocalAkunId(
  akunId: string | null | undefined,
  jenis: "kas_paturunan" | "kas_dudukan"
): Promise<string> {
  if (akunId?.trim()) {
    const db = await getDb();
    const rows = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan WHERE id = ? AND aktif = 1 LIMIT 1`,
      [akunId.trim()]
    );
    if (rows[0]) return rows[0].id;
  }
  return jenis === "kas_paturunan"
    ? await getDefaultAkunPaturunanId()
    : await getDefaultAkunDudukanId();
}

async function resolveLocalKramaId(nomorKartu: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM krama
     WHERE lower(replace(nomor_kartu, '-', '')) = lower(replace(?, '-', ''))
       AND status_krama = 'aktif'
     LIMIT 1`,
    [nomorKartu.trim()]
  );
  return rows[0]?.id ?? null;
}

function isCloudDemoIuran(iuranId?: string, nama?: string): boolean {
  if (iuranId && CLOUD_DEMO_IURAN_IDS.has(iuranId)) return true;
  if (nama && CLOUD_DEMO_IURAN_NAMES.has(nama.trim().toLowerCase())) return true;
  return false;
}

function isCloudDemoKartu(nomorKartu: string): boolean {
  return CLOUD_DEMO_KARTU.has(nomorKartu.trim().toLowerCase());
}

async function resolveLocalIuranId(iuranId?: string, nama?: string): Promise<string | null> {
  const db = await getDb();
  if (iuranId?.trim()) {
    const byId = await db.select<{ id: string }[]>(
      `SELECT id FROM iuran_paturunan WHERE id = ? LIMIT 1`,
      [iuranId.trim()]
    );
    if (byId[0]) return byId[0].id;
  }
  if (nama?.trim()) {
    const byNameAktif = await db.select<{ id: string }[]>(
      `SELECT id FROM iuran_paturunan WHERE lower(nama) = lower(?) AND aktif = 1 LIMIT 1`,
      [nama.trim()]
    );
    if (byNameAktif[0]) return byNameAktif[0].id;
    const byNameAny = await db.select<{ id: string }[]>(
      `SELECT id FROM iuran_paturunan WHERE lower(nama) = lower(?) LIMIT 1`,
      [nama.trim()]
    );
    if (byNameAny[0]) return byNameAny[0].id;
  }
  return null;
}

async function resolveLocalPetugasId(banjarKode: string, nama: string): Promise<string | null> {
  const kode = banjarKode.padStart(2, "0").slice(-2);
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT t.id FROM tim_kasukretan t
     JOIN banjar b ON b.id = t.banjar_id
     WHERE b.kode = ? AND lower(t.nama) = lower(?) LIMIT 1`,
    [kode, nama.trim()]
  );
  return rows[0]?.id ?? null;
}

function toIsoTimestamp(raw: string): string {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}

function latestIsoTimestamp(current: string, candidate: string): string {
  if (!candidate) return current;
  const next = toIsoTimestamp(candidate);
  if (!current) return next;
  return next > toIsoTimestamp(current) ? next : current;
}

function advanceWatermarkFromProcessed(
  since: string,
  processedCreatedAt: string[]
): string {
  let nextPullAt = since;
  for (const createdAt of processedCreatedAt) {
    nextPullAt = latestIsoTimestamp(nextPullAt, createdAt);
  }
  return nextPullAt;
}

export async function pullPembayaranFromCloud(opts?: {
  /** Lewati filter since — tarik semua pembayaran dari cloud (dedupe by id). */
  full?: boolean;
}): Promise<SyncPaymentResult> {
  const since = opts?.full ? "" : ((await getSyncMeta("last_pull_at")) ?? "");
  const sp = since ? `?since=${encodeURIComponent(since)}` : "";
  const res = await cloudFetch<{
    ok: boolean;
    data: { paturunan: PaturunanRow[]; dudukan: DudukanRow[]; keringanan: KeringananRow[] };
  }>(`/sync/pembayaran/pull${sp}`);

  const result: SyncPaymentResult = {
    paturunan: { inserted: 0, skipped: 0, ignored: 0, errors: [] },
    dudukan: { inserted: 0, skipped: 0, ignored: 0, errors: [] },
    keringanan: { inserted: 0, skipped: 0, errors: [] },
    lastPullAt: since,
  };

  const db = await getDb();
  const processedCreatedAt: string[] = [];

  for (const p of res.data.paturunan) {
    try {
      const exists = await db.select<{ id: string }[]>(
        `SELECT id FROM paturunan_pembayaran WHERE id = ?`,
        [p.id]
      );
      if (exists[0]) {
        result.paturunan.skipped++;
        processedCreatedAt.push(p.created_at);
        continue;
      }
      const kramaId = await resolveLocalKramaId(p.nomor_kartu);
      if (!kramaId) {
        if (isCloudDemoKartu(p.nomor_kartu) || isCloudDemoIuran(p.iuran_id, p.iuran_nama)) {
          result.paturunan.ignored++;
          processedCreatedAt.push(p.created_at);
          continue;
        }
        result.paturunan.errors.push(`${p.nomor_kartu}: kartu tidak ada di desktop`);
        continue;
      }
      const iuranId = await resolveLocalIuranId(p.iuran_id, p.iuran_nama);
      if (!iuranId) {
        if (isCloudDemoIuran(p.iuran_id, p.iuran_nama)) {
          result.paturunan.ignored++;
          processedCreatedAt.push(p.created_at);
          continue;
        }
        result.paturunan.errors.push(
          `${p.nomor_kartu}: iuran "${p.iuran_nama}" tidak ada di desktop`
        );
        continue;
      }
      const petugasId = p.petugas_nama
        ? await resolveLocalPetugasId(p.banjar_kode, p.petugas_nama)
        : null;
      const akunId = await resolveLocalAkunId(p.akun_keuangan_id, "kas_paturunan");
      const tanggal = parseIsoDateString(p.tanggal);
      if (!tanggal) throw new Error("tanggal tidak valid");
      const jenis = parsePembayaranJenis(p.jenis);
      const jumlah = parseJumlahPembayaran(Number(p.jumlah));
      await db.execute(
        `INSERT INTO paturunan_pembayaran
          (id, krama_id, iuran_id, jenis, jumlah, tanggal, petugas_id, akun_keuangan_id, keterangan, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          kramaId,
          iuranId,
          jenis,
          jumlah,
          tanggal,
          petugasId,
          akunId,
          p.keterangan,
          p.created_at,
        ]
      );
      result.paturunan.inserted++;
      processedCreatedAt.push(p.created_at);
    } catch (e) {
      result.paturunan.errors.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const p of res.data.dudukan) {
    try {
      const exists = await db.select<{ id: string }[]>(
        `SELECT id FROM dudukan_pembayaran WHERE id = ?`,
        [p.id]
      );
      if (exists[0]) {
        result.dudukan.skipped++;
        processedCreatedAt.push(p.created_at);
        continue;
      }
      const kramaId = await resolveLocalKramaId(p.nomor_kartu);
      if (!kramaId) {
        if (isCloudDemoKartu(p.nomor_kartu)) {
          result.dudukan.ignored++;
          processedCreatedAt.push(p.created_at);
          continue;
        }
        result.dudukan.errors.push(`${p.nomor_kartu}: kartu tidak ada di desktop`);
        continue;
      }
      const petugasId = p.petugas_nama
        ? await resolveLocalPetugasId(p.banjar_kode, p.petugas_nama)
        : null;
      const akunId = await resolveLocalAkunId(p.akun_keuangan_id, "kas_dudukan");
      const tanggal = parseIsoDateString(p.tanggal);
      if (!tanggal) throw new Error("tanggal tidak valid");
      const tahun = parseTahun(p.tahun);
      const bulan = parseBulan(p.bulan);
      const jumlah = parseJumlahPembayaran(Number(p.jumlah));
      let jenisKramaTamiuId = p.jenis_krama_tamiu_id ?? null;
      let jenisTamiuId = p.jenis_tamiu_id ?? null;
      let jenisNama = p.jenis_nama?.trim() || null;
      if (!jenisNama) {
        const { getJenisSnapshotForKrama } = await import("../services/dudukan-pembayaran");
        const snap = await getJenisSnapshotForKrama(kramaId);
        jenisKramaTamiuId = jenisKramaTamiuId ?? snap.jenis_krama_tamiu_id;
        jenisTamiuId = jenisTamiuId ?? snap.jenis_tamiu_id;
        jenisNama = snap.jenis_nama;
      }
      await db.execute(
        `INSERT INTO dudukan_pembayaran
          (id, krama_id, tahun, bulan, jumlah, tanggal, petugas_id, akun_keuangan_id, keterangan,
           jenis_krama_tamiu_id, jenis_tamiu_id, jenis_nama, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          kramaId,
          tahun,
          bulan,
          jumlah,
          tanggal,
          petugasId,
          akunId,
          p.keterangan,
          jenisKramaTamiuId,
          jenisTamiuId,
          jenisNama,
          p.created_at,
        ]
      );
      result.dudukan.inserted++;
      processedCreatedAt.push(p.created_at);
    } catch (e) {
      result.dudukan.errors.push(`${p.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const keringananPull = await applyKeringananPullRows(res.data.keringanan ?? []);
  result.keringanan.inserted = keringananPull.inserted;
  result.keringanan.skipped = keringananPull.skipped;
  result.keringanan.errors = keringananPull.errors;
  processedCreatedAt.push(...keringananPull.processedCreatedAt);

  const nextPullAt =
    processedCreatedAt.length > 0
      ? advanceWatermarkFromProcessed(since, processedCreatedAt)
      : since;
  result.lastPullAt = nextPullAt;
  if (processedCreatedAt.length > 0) {
    await setSyncMeta("last_pull_at", nextPullAt);
  }
  return result;
}

async function selectPaturunanRowsByIds(ids: string[]): Promise<PaturunanRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db.select<PaturunanRow[]>(
    `SELECT p.id, k.nomor_kartu, i.id as iuran_id, i.nama as iuran_nama, COALESCE(p.jenis, 'wajib') as jenis,
            p.jumlah, p.tanggal, b.kode as banjar_kode, COALESCE(t.nama, '') as petugas_nama,
            p.akun_keuangan_id, p.keterangan, p.created_at
     FROM paturunan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN iuran_paturunan i ON i.id = p.iuran_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE p.id IN (${placeholders})`,
    ids
  );
}

async function selectDudukanRowsByIds(ids: string[]): Promise<DudukanRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db.select<DudukanRow[]>(
    `SELECT p.id, k.nomor_kartu, p.tahun, p.bulan, p.jumlah, p.tanggal,
            b.kode as banjar_kode, COALESCE(t.nama, '') as petugas_nama,
            p.akun_keuangan_id, p.keterangan,
            p.jenis_krama_tamiu_id, p.jenis_tamiu_id, p.jenis_nama,
            p.created_at
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE p.id IN (${placeholders})`,
    ids
  );
}

async function selectKeringananRows(since?: string): Promise<KeringananRow[]> {
  const db = await getDb();
  const params: string[] = [];
  const sinceClause = since?.trim()
    ? (params.push(since.trim()), " AND k.created_at > ?")
    : "";
  return db.select<KeringananRow[]>(
    `SELECT k.id, kr.nomor_kartu, k.tahun, k.bulan, k.jumlah, k.tanggal,
            b.kode as banjar_kode, COALESCE(t.nama, '') as petugas_nama,
            k.keterangan, k.created_at
     FROM dudukan_keringanan k
     JOIN krama kr ON kr.id = k.krama_id
     JOIN banjar b ON b.id = kr.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = k.petugas_id
     WHERE 1=1${sinceClause}
     ORDER BY k.created_at ASC`,
    params
  );
}

function collectPushWatermarkRows(
  paturunan: PaturunanRow[],
  dudukan: DudukanRow[],
  keringanan: KeringananRow[] = []
): { created_at: string }[] {
  return [...paturunan, ...dudukan, ...keringanan];
}

async function advancePushWatermark(rows: { created_at: string }[]): Promise<void> {
  if (rows.length === 0) return;
  const since = (await getSyncMeta("last_push_at")) ?? "";
  let next = since;
  for (const row of rows) {
    next = latestIsoTimestamp(next, row.created_at);
  }
  if (next) await setSyncMeta("last_push_at", next);
}

async function postPembayaranPayloadOnce(
  paturunan: PaturunanRow[],
  dudukan: DudukanRow[],
  deleted?: PendingPaymentDeletions,
  keringanan?: KeringananRow[],
  deletedKeringanan?: string[]
): Promise<{
  paturunan: PushPaymentBucketResult;
  dudukan: PushPaymentBucketResult;
  keringanan: PushPaymentBucketResult;
}> {
  const res = await cloudFetch<{
    ok: boolean;
    result: {
      paturunan: PushPaymentBucketResult;
      dudukan: PushPaymentBucketResult;
      keringanan: PushPaymentBucketResult;
    };
  }>(
    "/sync/pembayaran/push",
    {
      method: "POST",
      body: JSON.stringify({
        replicate: true,
        paturunan,
        dudukan,
        keringanan,
        deleted: {
          paturunan: deleted?.paturunan ?? [],
          dudukan: deleted?.dudukan ?? [],
          keringanan: deletedKeringanan ?? [],
        },
      }),
    },
    { fetch: PAYMENT_PUSH_FETCH_OPTS }
  );
  if (
    paturunan.length > 0 ||
    dudukan.length > 0 ||
    (keringanan?.length ?? 0) > 0
  ) {
    await advancePushWatermark(collectPushWatermarkRows(paturunan, dudukan, keringanan ?? []));
  }
  return res.result;
}

async function postPembayaranPayload(
  paturunan: PaturunanRow[],
  dudukan: DudukanRow[],
  deleted?: PendingPaymentDeletions,
  keringanan?: KeringananRow[],
  deletedKeringanan?: string[]
): Promise<{
  paturunan: PushPaymentBucketResult;
  dudukan: PushPaymentBucketResult;
  keringanan: PushPaymentBucketResult;
}> {
  const kerRows = keringanan ?? [];
  const hasDeletions =
    (deleted?.paturunan.length ?? 0) > 0 ||
    (deleted?.dudukan.length ?? 0) > 0 ||
    (deletedKeringanan?.length ?? 0) > 0;

  if (paturunan.length === 0 && dudukan.length === 0 && kerRows.length === 0) {
    if (!hasDeletions) {
      return {
        paturunan: emptyPushBucket(),
        dudukan: emptyPushBucket(),
        keringanan: emptyPushBucket(),
      };
    }
    return postPembayaranPayloadOnce([], [], deleted, [], deletedKeringanan);
  }

  const batchSize = PAYMENT_PUSH_BATCH_SIZE;
  const nChunks = Math.max(
    chunkCount(paturunan.length, batchSize),
    chunkCount(dudukan.length, batchSize),
    chunkCount(kerRows.length, batchSize),
    1
  );

  let merged = {
    paturunan: emptyPushBucket(),
    dudukan: emptyPushBucket(),
    keringanan: emptyPushBucket(),
  };

  for (let c = 0; c < nChunks; c++) {
    const pSlice = paturunan.slice(c * batchSize, (c + 1) * batchSize);
    const dSlice = dudukan.slice(c * batchSize, (c + 1) * batchSize);
    const kSlice = kerRows.slice(c * batchSize, (c + 1) * batchSize);
    if (pSlice.length === 0 && dSlice.length === 0 && kSlice.length === 0) continue;

    const batchResult = await postPembayaranPayloadOnce(
      pSlice,
      dSlice,
      c === 0 ? deleted : EMPTY_PAYMENT_DELETIONS,
      kSlice,
      c === 0 ? deletedKeringanan : []
    );
    merged = {
      paturunan: mergePushBucket(merged.paturunan, batchResult.paturunan),
      dudukan: mergePushBucket(merged.dudukan, batchResult.dudukan),
      keringanan: mergePushBucket(merged.keringanan, batchResult.keringanan),
    };
  }

  return merged;
}

/** Kirim hanya pembayaran tertentu (untuk auto-push setelah bayar di kantor). */
export async function pushPembayaranByIds(ids: {
  paturunanIds?: string[];
  dudukanIds?: string[];
}): Promise<{
  paturunan: PushPaymentBucketResult;
  dudukan: PushPaymentBucketResult;
  keringanan: PushPaymentBucketResult;
}> {
  const paturunan = await selectPaturunanRowsByIds(ids.paturunanIds ?? []);
  const dudukan = await selectDudukanRowsByIds(ids.dudukanIds ?? []);
  if (paturunan.length === 0 && dudukan.length === 0) {
    return {
      paturunan: { inserted: 0, skipped: 0, deleted: 0, errors: [] },
      dudukan: { inserted: 0, skipped: 0, deleted: 0, errors: [] },
      keringanan: { inserted: 0, skipped: 0, deleted: 0, errors: [] },
    };
  }
  const result = await postPembayaranPayload(paturunan, dudukan);
  return result;
}

/** Hapus pembayaran di cloud (setelah dihapus di desktop). */
export async function pushPaymentDeletions(
  deleted: PendingPaymentDeletions
): Promise<{
  paturunan: PushPaymentBucketResult;
  dudukan: PushPaymentBucketResult;
  keringanan: PushPaymentBucketResult;
}> {
  const result = await postPembayaranPayload([], [], deleted);
  const errCount =
    result.paturunan.errors.length +
    result.dudukan.errors.length +
    result.keringanan.errors.length;
  if (errCount === 0) {
    await clearPendingPaymentDeletions();
  }
  return result;
}

async function selectPaturunanRowsSince(since?: string): Promise<PaturunanRow[]> {
  const db = await getDb();
  const params: string[] = [];
  const sinceClause = since?.trim()
    ? (params.push(since.trim()), " AND p.created_at > ?")
    : "";
  return db.select<PaturunanRow[]>(
    `SELECT p.id, k.nomor_kartu, i.id as iuran_id, i.nama as iuran_nama, COALESCE(p.jenis, 'wajib') as jenis,
            p.jumlah, p.tanggal, b.kode as banjar_kode, COALESCE(t.nama, '') as petugas_nama,
            p.akun_keuangan_id, p.keterangan, p.created_at
     FROM paturunan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN iuran_paturunan i ON i.id = p.iuran_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE 1=1${sinceClause}
     ORDER BY p.created_at ASC`,
    params
  );
}

async function selectDudukanRowsSince(since?: string): Promise<DudukanRow[]> {
  const db = await getDb();
  const params: string[] = [];
  const sinceClause = since?.trim()
    ? (params.push(since.trim()), " AND p.created_at > ?")
    : "";
  return db.select<DudukanRow[]>(
    `SELECT p.id, k.nomor_kartu, p.tahun, p.bulan, p.jumlah, p.tanggal,
            b.kode as banjar_kode, COALESCE(t.nama, '') as petugas_nama,
            p.akun_keuangan_id, p.keterangan,
            p.jenis_krama_tamiu_id, p.jenis_tamiu_id, p.jenis_nama,
            p.created_at
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE 1=1${sinceClause}
     ORDER BY p.created_at ASC`,
    params
  );
}

export async function pushPembayaranToCloud(opts?: {
  /** Kirim semua pembayaran (abaikan watermark kirim terakhir). */
  full?: boolean;
}): Promise<{
  paturunan: PushPaymentBucketResult;
  dudukan: PushPaymentBucketResult;
  keringanan: PushPaymentBucketResult;
  pushed: { paturunan: number; dudukan: number; keringanan: number };
}> {
  const since = opts?.full ? "" : ((await getSyncMeta("last_push_at")) ?? "");

  const paturunan = await selectPaturunanRowsSince(since);
  const dudukan = await selectDudukanRowsSince(since);
  const keringanan = await selectKeringananRows(since);
  const pending = await readPendingPaymentDeletions();
  const pendingKeringanan = await readPendingKeringananDeletions();
  const hasDeletions =
    pending.paturunan.length > 0 ||
    pending.dudukan.length > 0 ||
    pendingKeringanan.length > 0;
  if (paturunan.length === 0 && dudukan.length === 0 && keringanan.length === 0 && !hasDeletions) {
    return {
      paturunan: { inserted: 0, skipped: 0, deleted: 0, errors: [] },
      dudukan: { inserted: 0, skipped: 0, deleted: 0, errors: [] },
      keringanan: { inserted: 0, skipped: 0, deleted: 0, errors: [] },
      pushed: { paturunan: 0, dudukan: 0, keringanan: 0 },
    };
  }
  const result = await postPembayaranPayload(
    paturunan,
    dudukan,
    pending,
    keringanan,
    pendingKeringanan
  );
  const errCount =
    result.paturunan.errors.length +
    result.dudukan.errors.length +
    result.keringanan.errors.length;
  if (errCount === 0) {
    await clearPendingPaymentDeletions();
    await clearPendingKeringananDeletions();
  }
  return {
    ...result,
    pushed: {
      paturunan: paturunan.length,
      dudukan: dudukan.length,
      keringanan: keringanan.length,
    },
  };
}

export async function syncPembayaranBidirectional(opts?: {
  pushFull?: boolean;
  pullFull?: boolean;
}): Promise<{
  pull: SyncPaymentResult;
  push: Awaited<ReturnType<typeof pushPembayaranToCloud>>;
}> {
  const pull = await pullPembayaranFromCloud(opts?.pullFull ? { full: true } : undefined);
  const push = await pushPembayaranToCloud(opts?.pushFull ? { full: true } : undefined);
  return { pull, push };
}
