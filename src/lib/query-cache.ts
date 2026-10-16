/**
 * Cache singkat untuk hasil ringkasan (dashboard/laporan). Dikosongkan setiap ada penulisan DB
 * dari klien ini; TTL menutup perubahan yang dilakukan klien LAN lain.
 */
const DEFAULT_TTL_MS = 90_000;

type Entry = { at: number; promise: Promise<unknown> };
const entries = new Map<string, Entry>();

export function invalidateQueryCache(): void {
  entries.clear();
}

export function cachedQuery<T>(
  key: string,
  load: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && now - hit.at <= ttlMs) return hit.promise as Promise<T>;

  const promise = load();
  const entry: Entry = { at: now, promise };
  entries.set(key, entry);
  promise.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  return promise;
}
