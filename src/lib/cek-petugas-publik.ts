import { getCloudApiBase } from "./sync/cloud-config";
import { isDesktopApp } from "./runtime";

export const CEK_PETUGAS_PATH = "/cek-petugas";

/**
 * URL halaman verifikasi kartu petugas.
 * Di browser: origin saat ini. Di desktop: infer dari URL API cloud.
 */
export function publicCekPetugasUrl(): string {
  if (typeof window !== "undefined" && !isDesktopApp()) {
    const origin = window.location?.origin?.trim();
    if (origin && /^https?:\/\//i.test(origin)) {
      return `${origin.replace(/\/$/, "")}${CEK_PETUGAS_PATH}`;
    }
  }
  try {
    const apiBase = getCloudApiBase().replace(/\/api\/?$/i, "");
    const u = new URL(apiBase);
    if (u.hostname.startsWith("api.")) {
      u.hostname = u.hostname.slice(4);
    }
    return `${u.origin}${CEK_PETUGAS_PATH}`;
  } catch {
    return CEK_PETUGAS_PATH;
  }
}
