export const SETTINGS_PATH = "/pengaturan";

export type SettingsTab = "umum" | "database" | "pengguna" | "online" | "jaringan";

const VALID_TABS = new Set<SettingsTab>([
  "umum",
  "database",
  "pengguna",
  "online",
  "jaringan",
]);

export function parseSettingsTab(raw: string | null): SettingsTab {
  if (raw && VALID_TABS.has(raw as SettingsTab) && raw !== "umum") {
    return raw as SettingsTab;
  }
  return "umum";
}

export function settingsPath(tab?: SettingsTab): string {
  if (!tab || tab === "umum") return SETTINGS_PATH;
  return `${SETTINGS_PATH}?tab=${tab}`;
}
