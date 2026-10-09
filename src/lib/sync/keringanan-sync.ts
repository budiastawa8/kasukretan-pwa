import { parseIsoDateString } from "../date-iso";
import { parseBulan, parseJumlahPembayaran, parseTahun } from "../dudukan-hitung";
import { getDb } from "../db/client";
import { cloudFetch } from "./cloud-config";
import type { FetchWithRetryOptions } from "../fetch-retry";
import {
  clearPendingKeringananDeletions,
  readPendingKeringananDeletions,
} from "./keringanan-deletions";

export type KeringananSyncBucket = {
  inserted: number;
  skipped: number;
  deleted: number;
  errors: string[];
};

export type KeringananPullResult = KeringananSyncBucket & {
  processedCreatedAt: string[];
};

export type KeringananRow = {
  id: string;
  nomor_kartu: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  tanggal: string;
  banjar_kode: string;
  petugas_nama: string;
  keterangan: string | null;
  created_at: string;
};

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

const KERINGANAN_PUSH_FETCH_OPTS: FetchWithRetryOptions = {
  timeoutMs: 180_000,
  maxAttempts: 2,
  retryDelaysMs: [4_000],
};

async function postKeringananPayload(
  keringanan: KeringananRow[],
  deleted: string[]
): Promise<KeringananSyncBucket> {
  const res = await cloudFetch<{
    ok: boolean;
    result: { keringanan: KeringananSyncBucket };
  }>("/sync/pembayaran/push", {
    method: "POST",
    body: JSON.stringify({
      replicate: true,
      keringanan,
      deleted: { keringanan: deleted },
    }),
  }, { fetch: KERINGANAN_PUSH_FETCH_OPTS });
  return res.result.keringanan;
}

async function selectKeringananRowsByIds(ids: string[]): Promise<KeringananRow[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map(() => "?").join(",");
  return db.select<KeringananRow[]>(
    `SELECT k.id, kr.nomor_kartu, k.tahun, k.bulan, k.jumlah, k.tanggal,
            b.kode as banjar_kode, COALESCE(t.nama, '') as petugas_nama,
            k.keterangan, k.created_at
     FROM dudukan_keringanan k
     JOIN krama kr ON kr.id = k.krama_id
     JOIN banjar b ON b.id = kr.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = k.petugas_id
     WHERE k.id IN (${placeholders})`,
    ids
  );
}

export async function applyKeringananPullRows(
  rows: KeringananRow[]
): Promise<KeringananPullResult> {
  const result: KeringananPullResult = {
    inserted: 0,
    skipped: 0,
    deleted: 0,
    errors: [],
    processedCreatedAt: [],
  };

  const db = await getDb();

  for (const row of rows) {
    try {
      const existsById = await db.select<{ id: string }[]>(
        `SELECT id FROM dudukan_keringanan WHERE id = ?`,
        [row.id]
      );
      if (existsById[0]) {
        result.skipped++;
        result.processedCreatedAt.push(row.created_at);
        continue;
      }

      const kramaId = await resolveLocalKramaId(row.nomor_kartu);
      if (!kramaId) {
        result.errors.push(`${row.nomor_kartu}: kartu tidak ada di desktop`);
        continue;
      }

      const tahun = parseTahun(row.tahun);
      const bulan = parseBulan(row.bulan);
      const existsPeriode = await db.select<{ id: string }[]>(
        `SELECT id FROM dudukan_keringanan
         WHERE krama_id = ? AND tahun = ? AND bulan = ?`,
        [kramaId, tahun, bulan]
      );
      if (existsPeriode[0]) {
        result.skipped++;
        result.processedCreatedAt.push(row.created_at);
        continue;
      }

      const petugasId = row.petugas_nama
        ? await resolveLocalPetugasId(row.banjar_kode, row.petugas_nama)
        : null;
      const tanggal = parseIsoDateString(row.tanggal);
      if (!tanggal) throw new Error("tanggal tidak valid");
      const jumlah = parseJumlahPembayaran(Number(row.jumlah));

      await db.execute(
        `INSERT INTO dudukan_keringanan
          (id, krama_id, tahun, bulan, jumlah, tanggal, petugas_id, keterangan, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          kramaId,
          tahun,
          bulan,
          jumlah,
          tanggal,
          petugasId,
          row.keterangan,
          row.created_at,
        ]
      );
      result.inserted++;
      result.processedCreatedAt.push(row.created_at);
    } catch (e) {
      result.errors.push(`${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

export async function pushKeringananToCloud(opts?: { full?: boolean }): Promise<KeringananSyncBucket> {
  const { getSyncMeta } = await import("./sync-meta");
  const since = opts?.full ? "" : ((await getSyncMeta("last_push_at")) ?? "");
  const params: string[] = [];
  const sinceClause = since?.trim()
    ? (params.push(since.trim()), " AND k.created_at > ?")
    : "";
  const db = await getDb();
  const rows = await db.select<KeringananRow[]>(
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
  const deleted = await readPendingKeringananDeletions();
  const result = await postKeringananPayload(rows, deleted);
  if (result.errors.length === 0) {
    await clearPendingKeringananDeletions();
  }
  return result;
}

export async function pushKeringananByIds(ids: string[]): Promise<KeringananSyncBucket> {
  const rows = await selectKeringananRowsByIds(ids);
  if (rows.length === 0) {
    return { inserted: 0, skipped: 0, deleted: 0, errors: [] };
  }
  return postKeringananPayload(rows, []);
}

export async function pushKeringananDeletions(deleted: string[]): Promise<KeringananSyncBucket> {
  const result = await postKeringananPayload([], deleted);
  if (result.errors.length === 0) {
    await clearPendingKeringananDeletions();
  }
  return result;
}
