import { isDesktopShell } from "./desktop/core";
import { isLanClientMode } from "./lan-client";

/** True jika berjalan di shell Electron (desktop). False di browser biasa. */
export function isDesktopApp(): boolean {
  return isDesktopShell();
}

/** True untuk PC Electron atau HP/browser klien LAN (SQLite server). */
export function canUseStaffApp(): boolean {
  return isDesktopApp() || isLanClientMode();
}
