import { isDesktopShell } from "./desktop/core";

export type DownloadFileFilter = { name: string; extensions: string[] };

/** Simpan berkas: dialog native di Electron, unduh browser di web. */
export async function downloadBytes(
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
  filters: DownloadFileFilter[] = [{ name: "PDF", extensions: ["pdf"] }]
): Promise<boolean> {
  if (isDesktopShell()) {
    const { save } = await import("./desktop/dialog");
    const { writeFile } = await import("./desktop/fs");

    const path = await save({
      defaultPath: filename,
      filters,
    });
    if (!path) return false;

    await writeFile(path, bytes);
    return true;
  }

  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 2000);
  return true;
}
