const RETRYABLE_HTTP = new Set([502, 503, 504]);

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableFetchError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (!(e instanceof Error)) return false;
  const msg = e.message;
  return (
    e.name === "AbortError" ||
    e.name === "TimeoutError" ||
    msg === "Failed to fetch" ||
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Network request failed") ||
    msg.toLowerCase().includes("timeout")
  );
}

export type FetchWithRetryOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
  retryDelaysMs?: number[];
};

/** Fetch dengan retry otomatis untuk gangguan jaringan sementara. */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: FetchWithRetryOptions
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelaysMs = opts?.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)]);
    }

    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (RETRYABLE_HTTP.has(res.status) && attempt < maxAttempts - 1) {
        continue;
      }

      return res;
    } catch (e) {
      lastError = e;
      if (!isRetryableFetchError(e) || attempt >= maxAttempts - 1) {
        throw e;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function formatRetryExhaustedMessage(baseUrl?: string): string {
  const hint = baseUrl ? ` (${baseUrl})` : "";
  return (
    `Tidak bisa menghubungi API${hint} setelah beberapa percobaan. ` +
    "Periksa koneksi internet, pastikan server API berjalan, lalu coba lagi. " +
    "Jika data banyak, ulangi setelah beberapa menit atau gunakan mode inkremental."
  );
}
