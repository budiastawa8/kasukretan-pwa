import { invoke } from "./desktop/core";
import { isDesktopApp } from "./runtime";

export type LicenseStatus = {
  activated: boolean;
  enforced: boolean;
  desa_kode?: string | null;
  desa_nama?: string | null;
  /** ID kontrak lisensi desa (sama untuk kedua komputer). */
  license_id?: string | null;
  machine_count: number;
  max_machines: number;
  cloud_enabled: boolean;
  cloud_expires_at?: number | null;
  desktop_expires_at?: number | null;
  current_fingerprint: string;
  message?: string | null;
  /** Trial gratis lokal 30 hari (belum ada kode vendor). */
  local_trial?: boolean;
};

export async function getMachineFingerprint(): Promise<string> {
  return invoke<string>("license_get_machine_fingerprint");
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  if (!isDesktopApp()) {
    return {
      activated: true,
      enforced: false,
      machine_count: 0,
      max_machines: 2,
      cloud_enabled: true,
      cloud_expires_at: null,
      desktop_expires_at: null,
      current_fingerprint: "",
      message: "Mode browser — lisensi tidak diterapkan.",
      local_trial: false,
    };
  }
  return invoke<LicenseStatus>("license_get_status");
}

export async function activateLicense(code: string): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("license_activate", { code: code.trim() });
}

export async function activateCloudSubscription(code: string): Promise<LicenseStatus> {
  return invoke<LicenseStatus>("license_activate_cloud", { code: code.trim() });
}

export function isCloudModuleLicensed(status: LicenseStatus | null): boolean {
  if (!status) return false;
  if (!status.enforced) return true;
  return status.activated && status.cloud_enabled && !status.local_trial;
}

export function isDesktopTrial(status: LicenseStatus | null): boolean {
  if (!status?.activated) return false;
  if (status.local_trial) return true;
  const exp = status.desktop_expires_at;
  return exp != null && exp > 0;
}

export function desktopTrialDaysRemaining(status: LicenseStatus | null): number | null {
  if (!isDesktopTrial(status)) return null;
  const exp = status?.desktop_expires_at;
  if (exp == null || exp <= 0) return null;
  const secs = exp - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 0;
  return Math.ceil(secs / 86400);
}

export function formatLicenseExpiry(unixSeconds: number | null | undefined): string | null {
  if (unixSeconds == null || unixSeconds <= 0) return null;
  return new Date(unixSeconds * 1000).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** @deprecated Gunakan formatLicenseExpiry */
export function formatCloudExpiry(unixSeconds: number | null | undefined): string | null {
  return formatLicenseExpiry(unixSeconds);
}
