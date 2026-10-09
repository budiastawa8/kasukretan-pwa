import {
  fetchWithRetry,
  formatRetryExhaustedMessage,
  isRetryableFetchError,
  type FetchWithRetryOptions,
} from "../fetch-retry";

const API_BASE_KEY = "kasukretan_cloud_api_base";
const API_TOKEN_KEY = "kasukretan_api_token";
const API_USER_KEY = "kasukretan_api_user";

const DEFAULT_API_BASE = "http://localhost:3001/api";

export function getCloudApiBase(): string {
  return localStorage.getItem(API_BASE_KEY)?.trim() || DEFAULT_API_BASE;
}

/** Normalisasi URL API cloud — wajib berakhiran /api (bukan URI Postgres). */
export function normalizeCloudApiBase(url: string): string {
  let trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed) return DEFAULT_API_BASE;
  if (/^postgres(ql)?:\/\//i.test(trimmed)) {
    throw new Error(
      "URL API salah — ini URI database Postgres. Gunakan URL server API (mis. https://api.kasukretan.net/api), bukan DATABASE_URL Supabase."
    );
  }
  if (!trimmed.endsWith("/api")) {
    trimmed = `${trimmed}/api`;
  }
  return trimmed;
}

export function setCloudApiBase(url: string): void {
  localStorage.setItem(API_BASE_KEY, normalizeCloudApiBase(url));
}

export function getCloudApiToken(): string | null {
  return localStorage.getItem(API_TOKEN_KEY);
}

export function getCloudApiUser(): { username: string; peran: string; nama?: string | null } | null {
  const raw = localStorage.getItem(API_USER_KEY);
  return raw ? (JSON.parse(raw) as { username: string; peran: string; nama?: string | null }) : null;
}

export function saveCloudSession(
  token: string,
  user: { username: string; peran: string; nama?: string | null }
): void {
  localStorage.setItem(API_TOKEN_KEY, token);
  localStorage.setItem(API_USER_KEY, JSON.stringify(user));
}

export function clearCloudSession(): void {
  localStorage.removeItem(API_TOKEN_KEY);
  localStorage.removeItem(API_USER_KEY);
}

export function formatCloudFetchError(e: unknown, base?: string): string {
  const apiBase = base ?? getCloudApiBase();
  if (isRetryableFetchError(e)) {
    return formatRetryExhaustedMessage(apiBase);
  }
  const raw = e instanceof Error ? e.message : String(e);
  if (
    raw === "Failed to fetch" ||
    raw.includes("Failed to fetch") ||
    raw.includes("NetworkError") ||
    raw.includes("Network request failed")
  ) {
    return formatRetryExhaustedMessage(apiBase);
  }
  return raw || "Terjadi kesalahan tidak diketahui";
}

export type CloudApiHealth = {
  ok?: boolean;
  version?: string;
  features?: { petugasUsersSync?: boolean };
};

export async function fetchCloudApiHealth(): Promise<CloudApiHealth> {
  const base = getCloudApiBase();
  try {
    const res = await fetchWithRetry(`${base}/health`, undefined, { maxAttempts: 3 });
    if (!res.ok) return {};
    return (await res.json()) as CloudApiHealth;
  } catch {
    return {};
  }
}

export type CloudFetchOptions = {
  fetch?: FetchWithRetryOptions;
};

export async function cloudFetch<T>(
  path: string,
  init?: RequestInit,
  opts?: CloudFetchOptions
): Promise<T> {
  const base = getCloudApiBase();
  const token = getCloudApiToken();
  if (!token) throw new Error("Belum login ke API cloud");

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetchWithRetry(
      url,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...init?.headers,
        },
      },
      opts?.fetch
    );
  } catch (e) {
    throw new Error(formatCloudFetchError(e, base));
  }
  if (res.status === 401) {
    clearCloudSession();
    throw new Error("Sesi API habis — login ulang di Pengaturan → tab Modul Online");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

async function readCloudApiError(res: Response): Promise<string> {
  let detail = res.statusText || `HTTP ${res.status}`;
  try {
    const err = (await res.json()) as { error?: string; message?: string };
    if (err.error?.trim()) detail = err.error.trim();
    else if (err.message?.trim()) detail = err.message.trim();
  } catch {
    /* ignore */
  }
  return detail;
}

function formatCloudLoginError(base: string, status: number, detail: string): string {
  if (status === 401) {
    return `Username atau password salah untuk ${base}. (${detail}) Pastikan akun ada di database cloud (bukan login desktop SQLite) — jalankan: npm run db:seed:admin --prefix api`;
  }
  if (status === 404) {
    return `Endpoint login tidak ditemukan di ${base}/auth/login. Pastikan URL diakhiri /api (mis. https://api.kasukretan.net/api).`;
  }
  if (status === 500 && detail.includes("JWT_SECRET")) {
    return `${detail} — set JWT_SECRET di server API (VPS/Hugging Face) lalu restart service.`;
  }
  return `Login API gagal (HTTP ${status}): ${detail}`;
}

export async function cloudLogin(
  username: string,
  password: string
): Promise<{ username: string; peran: string; nama?: string | null }> {
  const base = normalizeCloudApiBase(getCloudApiBase());
  localStorage.setItem(API_BASE_KEY, base);
  const user = username.trim();
  if (!user || !password) {
    throw new Error("Username dan password API wajib diisi");
  }

  const loginUrl = `${base}/auth/login`;
  let res: Response;
  try {
    res = await fetchWithRetry(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password }),
    });
  } catch (e) {
    throw new Error(formatCloudFetchError(e, base));
  }
  if (!res.ok) {
    const detail = await readCloudApiError(res);
    throw new Error(formatCloudLoginError(base, res.status, detail));
  }
  const data = (await res.json()) as {
    token: string;
    user: { username: string; peran: string; nama?: string | null };
  };
  if (!data.token) {
    throw new Error("Login API gagal — server tidak mengembalikan token");
  }
  saveCloudSession(data.token, data.user);
  return data.user;
}
