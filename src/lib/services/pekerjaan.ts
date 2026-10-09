import { getDb } from "../db/client";

let cached: string[] | null = null;
let loadPromise: Promise<string[]> | null = null;

function sortPekerjaan(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b, "id", { sensitivity: "base" }));
}

function dedupePekerjaan(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return sortPekerjaan(out);
}

async function loadPekerjaanFromDb(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ pekerjaan: string }[]>(
    `SELECT DISTINCT pekerjaan
     FROM penduduk
     WHERE pekerjaan IS NOT NULL AND TRIM(pekerjaan) != ''
     ORDER BY pekerjaan COLLATE NOCASE ASC`
  );
  return dedupePekerjaan(rows.map((r) => r.pekerjaan));
}

/** Jenis pekerjaan unik yang sudah pernah dipakai di data penduduk. */
export async function listPekerjaan(): Promise<string[]> {
  if (cached) return [...cached];
  if (!loadPromise) {
    loadPromise = loadPekerjaanFromDb()
      .then((list) => {
        cached = list;
        return list;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise.then((list) => [...list]);
}

/** Simpan jenis pekerjaan baru ke cache lokal (setelah dipakai di form). */
export function rememberPekerjaan(label: string): void {
  const trimmed = label.trim();
  if (!trimmed) return;
  const next = dedupePekerjaan([...(cached ?? []), trimmed]);
  cached = next;
}

export function invalidatePekerjaanCache(): void {
  cached = null;
  loadPromise = null;
}

export function mergePekerjaanOptions(existing: string[], extra: string | null | undefined): string[] {
  if (!extra?.trim()) return existing;
  return dedupePekerjaan([...existing, extra]);
}
