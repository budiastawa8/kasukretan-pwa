/** Barrel modul desktop Electron. */

export { invoke, isDesktopShell, isTauri } from "./core";
export { open, save } from "./dialog";
export { readFile, writeFile } from "./fs";
export { openUrl } from "./opener";
export { getCurrentWindow } from "./window";
export { default as Database } from "./sql";
