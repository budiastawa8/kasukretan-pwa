/**
 * Persist hasil SELECT untuk stale-while-revalidate.
 * Hasil kecil → sessionStorage; hasil besar → IndexedDB.
 */

export type SelectPersistEntry = { at: number; rows: unknown };

const SESSION_PREFIX = "kasukretan_sel:";
const SESSION_MAX_BYTES = 100_000;
const IDB_MAX_BYTES = 2_000_000;
const IDB_NAME = "kasukretan_select_cache";
const IDB_STORE = "selects";
const IDB_VERSION = 1;

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
    } catch {
      resolve(null);
    }
  });
}

function readSession(key: string): SelectPersistEntry | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectPersistEntry;
    if (!parsed || typeof parsed.at !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(key: string, payload: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (payload.length > SESSION_MAX_BYTES) return false;
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, payload);
    return true;
  } catch {
    return false;
  }
}

async function readIdb(key: string): Promise<SelectPersistEntry | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        const v = req.result as SelectPersistEntry | undefined;
        resolve(v && typeof v.at === "number" ? v : null);
      };
      tx.oncomplete = () => db.close();
    } catch {
      try {
        db.close();
      } catch {
        /* ignore */
      }
      resolve(null);
    }
  });
}

async function writeIdb(key: string, entry: SelectPersistEntry): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(entry, key);
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

async function clearIdb(): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
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

function clearSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export async function readSelectPersist(key: string): Promise<SelectPersistEntry | null> {
  const session = readSession(key);
  if (session) return session;
  return readIdb(key);
}

export async function writeSelectPersist(key: string, rows: unknown): Promise<void> {
  const entry: SelectPersistEntry = { at: Date.now(), rows };
  let payload: string;
  try {
    payload = JSON.stringify(entry);
  } catch {
    return;
  }
  if (payload.length > IDB_MAX_BYTES) return;
  if (writeSession(key, payload)) return;
  await writeIdb(key, entry);
}

export function clearSelectPersist(): void {
  clearSession();
  void clearIdb();
}
