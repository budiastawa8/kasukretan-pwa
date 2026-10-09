import type { FetchWithRetryOptions } from "../fetch-retry";
import { getDb } from "../db/client";
import { cloudFetch } from "./cloud-config";
import { getSyncMeta, setSyncMeta } from "./sync-meta";

const KRAMA_PUSH_META_KEY = "last_krama_push_at";

/** Kartu per request — batch kecil agar respons lebih cepat di koneksi lambat. */
const KRAMA_PUSH_BATCH_SIZE = 25;

const KRAMA_PUSH_FETCH_OPTS: FetchWithRetryOptions = {
  timeoutMs: 120_000,
  maxAttempts: 3,
  retryDelaysMs: [2_000, 5_000],
};

export type KramaPushProgress = {
  batch: number;
  batchCount: number;
  sent: number;
  total: number;
};

const KRAMA_BASE_SQL = `
  SELECT k.*, kk.kode as klasifikasi_kode, b.kode as banjar_kode,
         d.kode_kabupaten, d.kode_kecamatan, d.kode_desa_adat,
         jm.nama as jenis_mipil_nama, jkt.nama as jenis_kt_nama, jt.nama as jenis_t_nama,
         jprev.nama as jenis_sebelum_nyada_nama
  FROM krama k
  JOIN desa_adat d ON d.id = k.desa_adat_id
  JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
  JOIN banjar b ON b.id = k.banjar_id
  LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
  LEFT JOIN jenis_krama_mipil jprev ON jprev.id = k.jenis_sebelum_nyada_id
  LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
  LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
`;

/** Kolom penduduk untuk sync — tanpa foto_url agar payload tidak membengkak. */
const PENDUDUK_SYNC_SQL = `
  SELECT id, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir, status_kawin,
         pekerjaan, nama_ibu, nama_ayah, nik_kependudukan, nik_atau_nika, nama_gelar,
         agama, alamat_domisili, no_hp, status_hidup, catatan, created_at, updated_at
  FROM penduduk
`;

export type KramaPushResult = {
  penduduk: number;
  krama: number;
  errors: string[];
};

export type KramaPushResponse = {
  ok: boolean;
  result: KramaPushResult;
  /** Tidak ada krama yang perlu dikirim (mode inkremental). */
  empty?: boolean;
};

function latestIsoTimestamp(current: string, candidate: string): string {
  if (!candidate?.trim()) return current;
  if (!current?.trim()) return candidate;
  return candidate > current ? candidate : current;
}

async function advanceKramaPushWatermark(
  kramaRows: { updated_at?: unknown }[]
): Promise<void> {
  if (kramaRows.length === 0) return;
  let next = (await getSyncMeta(KRAMA_PUSH_META_KEY)) ?? "";
  for (const row of kramaRows) {
    const ts = String(row.updated_at ?? "");
    next = latestIsoTimestamp(next, ts);
  }
  if (next) await setSyncMeta(KRAMA_PUSH_META_KEY, next);
}

export async function collectKramaFromDesktop(opts?: {
  since?: string;
  kramaIds?: string[];
}): Promise<{ penduduk: Record<string, unknown>[]; krama: Record<string, unknown>[] }> {
  const db = await getDb();
  const params: unknown[] = [];
  let sql = `${KRAMA_BASE_SQL} WHERE k.status_krama = 'aktif'`;

  if (opts?.kramaIds?.length) {
    const placeholders = opts.kramaIds.map(() => "?").join(",");
    sql += ` AND k.id IN (${placeholders})`;
    params.push(...opts.kramaIds);
  } else if (opts?.since?.trim()) {
    sql += ` AND k.updated_at > ?`;
    params.push(opts.since.trim());
  }

  sql += ` ORDER BY k.updated_at ASC`;

  const krama = await db.select<Record<string, unknown>[]>(sql, params);
  const kepalaIds = [...new Set(krama.map((k) => String(k.kepala_penduduk_id)))];
  if (kepalaIds.length === 0) {
    return { penduduk: [], krama: [] };
  }
  const placeholders = kepalaIds.map(() => "?").join(",");
  const penduduk = await db.select<Record<string, unknown>[]>(
    `${PENDUDUK_SYNC_SQL} WHERE id IN (${placeholders})`,
    kepalaIds
  );
  return { penduduk, krama };
}

async function postKramaPayloadOnce(payload: {
  penduduk: Record<string, unknown>[];
  krama: Record<string, unknown>[];
}): Promise<KramaPushResponse> {
  const res = await cloudFetch<KramaPushResponse>(
    "/sync/krama/push",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { fetch: KRAMA_PUSH_FETCH_OPTS }
  );

  if (payload.krama.length > 0 && res.result.errors.length === 0) {
    await advanceKramaPushWatermark(payload.krama);
  }

  return res;
}

function mergeKramaPushResults(a: KramaPushResult, b: KramaPushResult): KramaPushResult {
  return {
    penduduk: a.penduduk + b.penduduk,
    krama: a.krama + b.krama,
    errors: [...a.errors, ...b.errors],
  };
}

async function postKramaPayload(
  payload: {
    penduduk: Record<string, unknown>[];
    krama: Record<string, unknown>[];
  },
  onProgress?: (p: KramaPushProgress) => void
): Promise<KramaPushResponse> {
  const { krama, penduduk } = payload;
  if (krama.length === 0) {
    return { ok: true, result: { penduduk: 0, krama: 0, errors: [] } };
  }

  const pendudukById = new Map(penduduk.map((p) => [String(p.id), p]));
  let merged: KramaPushResult = { penduduk: 0, krama: 0, errors: [] };
  const batchCount = Math.ceil(krama.length / KRAMA_PUSH_BATCH_SIZE);

  for (let i = 0; i < krama.length; i += KRAMA_PUSH_BATCH_SIZE) {
    const batchIndex = Math.floor(i / KRAMA_PUSH_BATCH_SIZE) + 1;
    const kramaChunk = krama.slice(i, i + KRAMA_PUSH_BATCH_SIZE);
    const kepalaIds = new Set(kramaChunk.map((k) => String(k.kepala_penduduk_id)));
    const pendudukChunk = [...kepalaIds]
      .map((id) => pendudukById.get(id))
      .filter((p): p is Record<string, unknown> => p != null);

    onProgress?.({
      batch: batchIndex,
      batchCount,
      sent: Math.min(i + kramaChunk.length, krama.length),
      total: krama.length,
    });

    const res = await postKramaPayloadOnce({ penduduk: pendudukChunk, krama: kramaChunk });
    merged = mergeKramaPushResults(merged, res.result);
  }

  return { ok: merged.errors.length === 0, result: merged };
}

/** Kirim krama ke cloud — default inkremental (baru/diubah sejak kirim terakhir). */
export async function pushKramaToCloud(opts?: {
  /** Kirim semua krama aktif (abaikan watermark). */
  full?: boolean;
  onProgress?: (p: KramaPushProgress) => void;
}): Promise<KramaPushResponse> {
  const since = opts?.full ? "" : ((await getSyncMeta(KRAMA_PUSH_META_KEY)) ?? "");
  const payload = await collectKramaFromDesktop(since ? { since } : undefined);

  if (payload.krama.length === 0) {
    return {
      ok: true,
      empty: true,
      result: { penduduk: 0, krama: 0, errors: [] },
    };
  }

  opts?.onProgress?.({
    batch: 0,
    batchCount: Math.ceil(payload.krama.length / KRAMA_PUSH_BATCH_SIZE),
    sent: 0,
    total: payload.krama.length,
  });

  return postKramaPayload(payload, opts?.onProgress);
}

/** Kirim satu atau beberapa krama tertentu (mis. setelah tambah/edit). */
export async function pushKramaByIds(kramaIds: string[]): Promise<KramaPushResponse> {
  const ids = [...new Set(kramaIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return {
      ok: true,
      empty: true,
      result: { penduduk: 0, krama: 0, errors: [] },
    };
  }

  const payload = await collectKramaFromDesktop({ kramaIds: ids });
  if (payload.krama.length === 0) {
    return {
      ok: true,
      empty: true,
      result: { penduduk: 0, krama: 0, errors: [] },
    };
  }

  return postKramaPayload(payload);
}

/** Kirim satu krama berdasarkan nomor kartu (untuk perbaikan sinkron per kartu). */
export async function pushKramaByNomorKartu(nomorKartu: string): Promise<KramaPushResponse> {
  const key = nomorKartu.trim().replace(/-/g, "");
  if (!key) {
    return {
      ok: true,
      empty: true,
      result: { penduduk: 0, krama: 0, errors: [] },
    };
  }

  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM krama
     WHERE replace(nomor_kartu, '-', '') = ?
       AND status_krama = 'aktif'
     LIMIT 1`,
    [key]
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new Error(`Kartu ${nomorKartu.trim()} tidak ditemukan atau tidak aktif`);
  }
  return pushKramaByIds([id]);
}

export async function fetchCloudStatus() {
  return cloudFetch<{ ok: boolean; counts: Record<string, number> }>("/sync/status");
}
