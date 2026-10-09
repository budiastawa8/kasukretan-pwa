import { getSyncMeta, setSyncMeta } from "./sync-meta";

const META_KEY = "pending_payment_deletions";

export type PendingPaymentDeletions = {
  paturunan: string[];
  dudukan: string[];
};

function emptyPending(): PendingPaymentDeletions {
  return { paturunan: [], dudukan: [] };
}

export async function readPendingPaymentDeletions(): Promise<PendingPaymentDeletions> {
  const raw = await getSyncMeta(META_KEY);
  if (!raw) return emptyPending();
  try {
    const parsed = JSON.parse(raw) as Partial<PendingPaymentDeletions>;
    return {
      paturunan: Array.isArray(parsed.paturunan) ? parsed.paturunan.filter(Boolean) : [],
      dudukan: Array.isArray(parsed.dudukan) ? parsed.dudukan.filter(Boolean) : [],
    };
  } catch {
    return emptyPending();
  }
}

export async function queuePaymentDeletion(
  kind: keyof PendingPaymentDeletions,
  id: string
): Promise<void> {
  const trimmed = id.trim();
  if (!trimmed) return;
  const pending = await readPendingPaymentDeletions();
  if (!pending[kind].includes(trimmed)) {
    pending[kind].push(trimmed);
    await setSyncMeta(META_KEY, JSON.stringify(pending));
  }
}

export async function clearPendingPaymentDeletions(): Promise<void> {
  await setSyncMeta(META_KEY, JSON.stringify(emptyPending()));
}
