import { useEffect, useState } from "react";
import { isDesktopApp } from "./runtime";
import { getLicenseStatus, isCloudModuleLicensed } from "./license";

let cachedLicensedCloud: boolean | null = null;

/**
 * Di aplikasi desktop, modul online (sinkronisasi) menunggu langganan cloud.
 * Di PWA/browser modul itu bagian dari aplikasi: PIN portal dan akun petugas
 * tidak dikunci lisensi desktop. `VITE_ENABLE_ONLINE=false` mematikan semuanya.
 */
export function isOnlineModuleEnabled(): boolean {
  const raw = import.meta.env.VITE_ENABLE_ONLINE;
  if (raw === "false") return false;

  if (!isDesktopApp()) return true;

  if (cachedLicensedCloud != null) return cachedLicensedCloud;
  return import.meta.env.DEV;
}

/** Muat status lisensi cloud (panggil sekali saat app/desktop siap). */
export async function refreshOnlineModuleLicense(): Promise<boolean> {
  if (!isDesktopApp()) {
    cachedLicensedCloud = isOnlineModuleEnabled();
    return cachedLicensedCloud;
  }
  const raw = import.meta.env.VITE_ENABLE_ONLINE;
  if (raw === "false") {
    cachedLicensedCloud = false;
    return false;
  }
  try {
    const status = await getLicenseStatus();
    cachedLicensedCloud = isCloudModuleLicensed(status);
  } catch {
    cachedLicensedCloud = import.meta.env.DEV;
  }
  return cachedLicensedCloud ?? false;
}

export function isOnlineModuleEnabledSync(): boolean {
  if (!isDesktopApp()) return isOnlineModuleEnabled();
  if (cachedLicensedCloud != null) return cachedLicensedCloud;
  return import.meta.env.DEV;
}

/** Hook reaktif — refresh lisensi cloud saat komponen mount. */
export function useOnlineModuleEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => isOnlineModuleEnabledSync());
  useEffect(() => {
    void refreshOnlineModuleLicense().then(setEnabled);
  }, []);
  return enabled;
}
