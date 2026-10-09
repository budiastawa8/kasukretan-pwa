import { getSyncMeta, setSyncMeta } from "./sync-meta";

const META_KEY = "pending_keringanan_deletions";

export async function readPendingKeringananDeletions(): Promise<string[]> {
  const raw = await getSyncMeta(META_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && !!id.trim()) : [];
  } catch {
    return [];
  }
}

export async function queueKeringananDeletion(id: string): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) return;
  const pending = await readPendingKeringananDeletions();
  if (!pending.includes(trimmed)) {
    pending.push(trimmed);
    await setSyncMeta(META_KEY, JSON.stringify(pending));
  }
}

export async function clearPendingKeringananDeletions(): Promise<void> {
  await setSyncMeta(META_KEY, JSON.stringify([]));
}
