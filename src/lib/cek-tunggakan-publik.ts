import { getCloudApiBase } from "./sync/cloud-config";
import { isDesktopApp } from "./runtime";

/** Path stabil untuk dibagikan ke grup WA — tidak berubah saat toggle on/off. */
export const CEK_TUNGGAKAN_PATURUNAN_PATH = "/cek-tunggakan-paturunan";

/** Apakah desa mengaktifkan halaman publik cek tunggakan Paturunan. */
export function isCekTunggakanPaturunanPublikAktif(
  desa: { cek_tunggakan_paturunan_publik?: number | null } | null | undefined
): boolean {
  return !!Number(desa?.cek_tunggakan_paturunan_publik);
}

/**
 * URL yang dibagikan ke krama.
 * Di browser: origin saat ini. Di desktop: infer dari URL API cloud (api.X → X).
 */
export function publicCekTunggakanPaturunanUrl(): string {
  if (typeof window !== "undefined" && !isDesktopApp()) {
    const origin = window.location?.origin?.trim();
    if (origin && /^https?:\/\//i.test(origin)) {
      return `${origin.replace(/\/$/, "")}${CEK_TUNGGAKAN_PATURUNAN_PATH}`;
    }
  }
  try {
    const apiBase = getCloudApiBase().replace(/\/api\/?$/i, "");
    const u = new URL(apiBase);
    if (u.hostname.startsWith("api.")) {
      u.hostname = u.hostname.slice(4);
    }
    return `${u.origin}${CEK_TUNGGAKAN_PATURUNAN_PATH}`;
  } catch {
    return CEK_TUNGGAKAN_PATURUNAN_PATH;
  }
}
