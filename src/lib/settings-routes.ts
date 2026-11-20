export const SETTINGS_PATH = "/pengaturan";

export type SettingsTab = "umum" | "akun" | "database" | "pengguna" | "portal" | "jaringan";

const VALID_TABS = new Set<SettingsTab>([
  "umum",
  "akun",
  "database",
  "pengguna",
  "portal",
  "jaringan",
]);

export function parseSettingsTab(raw: string | null): SettingsTab {
  // Tab lama "Modul Online" — isinya yang masih dipakai adalah PIN portal.
  if (raw === "online") return "portal";
  if (raw && VALID_TABS.has(raw as SettingsTab) && raw !== "umum") {
    return raw as SettingsTab;
  }
  return "umum";
}

export function settingsPath(tab?: SettingsTab): string {
  if (!tab || tab === "umum") return SETTINGS_PATH;
  return `${SETTINGS_PATH}?tab=${tab}`;
}
