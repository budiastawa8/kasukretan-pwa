import { fetchWithRetry } from "../fetch-retry";

/** Basis URL API. Di dev, Vite mem-proxy `/api` ke localhost:3001. */
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

const API_MISCONFIG_MSG =
  "URL API salah. Build UI Petugas wajib memakai VITE_API_BASE=https://api.domain-anda.net/api " +
  "(subdomain api, bukan petugas). Buat .env.production lalu npm run build:petugas ulang.";

function apiMisconfigDetail(res: Response): string {
  const base = API_BASE;
  if (res.status === 405 || /not allowed/i.test(res.statusText)) {
    return (
      `Login ditolak server (HTTP ${res.status}). UI memanggil "${base}" — ` +
      "seharusnya https://api.kasukretan.net/api (subdomain api, bukan petugas). " +
      "Buat .env.production, npm run build:petugas, upload dist/ ke VPS."
    );
  }
  return `${API_MISCONFIG_MSG} (URL build: ${base})`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<!doctype")) {
    throw new ApiError(apiMisconfigDetail(res), res.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(
      "Respons server bukan JSON. Periksa VITE_API_BASE saat build UI Petugas.",
      res.status
    );
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Server cloud sedang menyala atau tidak terjangkau — tunggu sebentar lalu coba lagi.",
      0
    );
  }
  if (!res.ok) {
    if (res.status === 405 || /not allowed/i.test(res.statusText)) {
      throw new ApiError(apiMisconfigDetail(res), res.status);
    }
    let detail = res.statusText;
    try {
      const err = await parseJsonResponse<{ error?: string }>(res);
      if (err.error) detail = err.error;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  return parseJsonResponse<T>(res);
}

export type ApiHealth = {
  ok: boolean;
  service: string;
  version: string;
  mode?: string;
  database?: string;
};

export async function fetchApiHealth(): Promise<ApiHealth> {
  return apiFetch<ApiHealth>("/health");
}
