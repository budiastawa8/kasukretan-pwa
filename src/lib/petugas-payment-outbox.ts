/**
 * Antrian pembayaran petugas saat offline / gagal jaringan.
 * IndexedDB terpisah dari cache SELECT — tidak dihapus saat tulis sukses lain.
 */

import { getDb } from "./db/client";
import { isLanClientMode } from "./lan-client";

const IDB_NAME = "kasukretan_petugas_outbox";
const IDB_STORE = "payments";
const IDB_VERSION = 1;

export const PETUGAS_OUTBOX_CHANGED_EVENT = "kasukretan:petugas-outbox-changed";

export type PetugasOutboxKind = "paturunan" | "dudukan" | "dana_lain";

export type PetugasOutboxWrite = {
  paymentId: string;
  table: "paturunan_pembayaran" | "dudukan_pembayaran" | "penerimaan_dana_lain";
  sql: string;
  bind: unknown[];
};

export type PetugasOutboxItem = {
  id: string;
  createdAt: number;
  status: "pending" | "syncing" | "failed";
  kind: PetugasOutboxKind;
  label: string;
  writes: PetugasOutboxWrite[];
  error?: string;
};

export type CommitPaymentWritesResult = {
  mode: "synced" | "queued";
  paymentIds: string[];
};

function emitChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PETUGAS_OUTBOX_CHANGED_EVENT));
}

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

function newOutboxId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ob-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

/** Gagal karena jaringan / server down — boleh masuk outbox. */
export function isLikelyNetworkError(err: unknown): boolean {
  if (!isBrowserOnline()) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /Tidak dapat terhubung|Failed to fetch|NetworkError|Load failed|internet|ECONN|ETIMEDOUT|aborted|timeout|HTTP 5\d\d|502|503|504|network/i.test(
    msg
  );
}

async function idbGetAll(): Promise<PetugasOutboxItem[]> {
  const db = await openIdb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        const rows = (req.result as PetugasOutboxItem[] | undefined) ?? [];
        resolve(rows.filter((r) => r && typeof r.id === "string" && Array.isArray(r.writes)));
      };
      tx.oncomplete = () => db.close();
    } catch {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      resolve([]);
    }
  });
}

async function idbPut(item: PetugasOutboxItem): Promise<void> {
  const db = await openIdb();
  if (!db) throw new Error("Penyimpanan lokal tidak tersedia di perangkat ini.");
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(item);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Gagal menyimpan outbox"));
      };
    } catch (e) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      reject(e);
    }
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      resolve();
    }
  });
}

export async function listPetugasPaymentOutbox(): Promise<PetugasOutboxItem[]> {
  const rows = await idbGetAll();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPendingPetugasPaymentOutbox(): Promise<number> {
  const rows = await listPetugasPaymentOutbox();
  return rows.filter((r) => r.status === "pending" || r.status === "failed" || r.status === "syncing")
    .length;
}

export async function enqueuePetugasPaymentOutbox(params: {
  kind: PetugasOutboxKind;
  label: string;
  writes: PetugasOutboxWrite[];
}): Promise<PetugasOutboxItem> {
  if (!params.writes.length) throw new Error("Tidak ada data pembayaran untuk diantrikan.");
  const item: PetugasOutboxItem = {
    id: newOutboxId(),
    createdAt: Date.now(),
    status: "pending",
    kind: params.kind,
    label: params.label.trim() || "Pembayaran",
    writes: params.writes,
  };
  await idbPut(item);
  emitChanged();
  return item;
}

async function paymentExists(table: PetugasOutboxWrite["table"], paymentId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM ${table} WHERE id = ? LIMIT 1`,
    [paymentId]
  );
  return Boolean(rows[0]?.id);
}

async function applyWrites(writes: PetugasOutboxWrite[]): Promise<void> {
  const db = await getDb();
  for (const w of writes) {
    if (await paymentExists(w.table, w.paymentId)) continue;
    await db.execute(w.sql, w.bind);
  }
}

/**
 * Tulis ke server, atau antrikan jika `allowOfflineQueue` dan offline/gagal jaringan.
 * Hanya untuk pembayaran petugas lapangan (`disetorLangsung === false`).
 */
export async function commitPaymentWrites(params: {
  kind: PetugasOutboxKind;
  label: string;
  writes: PetugasOutboxWrite[];
  allowOfflineQueue: boolean;
}): Promise<CommitPaymentWritesResult> {
  const paymentIds = params.writes.map((w) => w.paymentId);
  if (!params.writes.length) return { mode: "synced", paymentIds };

  const tryQueue = async (): Promise<CommitPaymentWritesResult> => {
    await enqueuePetugasPaymentOutbox({
      kind: params.kind,
      label: params.label,
      writes: params.writes,
    });
    return { mode: "queued", paymentIds };
  };

  if (params.allowOfflineQueue && (!isBrowserOnline() || !isLanClientMode())) {
    return tryQueue();
  }

  try {
    await applyWrites(params.writes);
    return { mode: "synced", paymentIds };
  } catch (err) {
    if (params.allowOfflineQueue && isLikelyNetworkError(err)) {
      return tryQueue();
    }
    throw err;
  }
}

export type FlushPetugasOutboxResult = {
  synced: number;
  failed: number;
  remaining: number;
};

let flushInFlight: Promise<FlushPetugasOutboxResult> | null = null;

export async function flushPetugasPaymentOutbox(): Promise<FlushPetugasOutboxResult> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    let synced = 0;
    let failed = 0;
    if (!isBrowserOnline()) {
      const remaining = await countPendingPetugasPaymentOutbox();
      return { synced: 0, failed: 0, remaining };
    }

    const items = await listPetugasPaymentOutbox();
    for (const item of items) {
      if (item.status === "syncing") continue;
      const next: PetugasOutboxItem = { ...item, status: "syncing", error: undefined };
      await idbPut(next);
      emitChanged();
      try {
        await applyWrites(item.writes);
        await idbDelete(item.id);
        synced += 1;
        emitChanged();
      } catch (err) {
        failed += 1;
        const msg = err instanceof Error ? err.message : String(err);
        await idbPut({
          ...item,
          status: "failed",
          error: msg.slice(0, 240),
        });
        emitChanged();
        if (!isLikelyNetworkError(err)) {
          // validasi/bisnis — biarkan failed, lanjut item lain
          continue;
        }
        // jaringan putus lagi — hentikan flush
        break;
      }
    }

    const remaining = await countPendingPetugasPaymentOutbox();
    return { synced, failed, remaining };
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}

/** Dengarkan online + flush; kembalikan cleanup. */
export function startPetugasOutboxAutoFlush(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => {
    void flushPetugasPaymentOutbox();
  };
  window.addEventListener("online", onOnline);
  // Coba sekali saat start (setelah login/boot).
  window.setTimeout(() => {
    void flushPetugasPaymentOutbox();
  }, 1500);

  return () => {
    window.removeEventListener("online", onOnline);
  };
}
