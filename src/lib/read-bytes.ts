import { isDesktopShell } from "./desktop/core";

export type ReadFileFilter = { name: string; extensions: string[] };

export type ReadBytesResult = {
  bytes: Uint8Array;
  filename: string;
};

/** Buka berkas: dialog native di Electron, input file di browser. */
export async function readBytes(
  filters: ReadFileFilter[] = [{ name: "Excel", extensions: ["xlsx", "xls"] }]
): Promise<ReadBytesResult | null> {
  if (isDesktopShell()) {
    const { open } = await import("./desktop/dialog");
    const { readFile } = await import("./desktop/fs");

    const path = await open({
      multiple: false,
      filters,
    });
    if (!path || Array.isArray(path)) return null;

    const bytes = await readFile(path);
    const filename = path.split(/[/\\]/).pop() ?? "import.xlsx";
    return { bytes: new Uint8Array(bytes), filename };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = filters
      .flatMap((f) => f.extensions.map((ext) => `.${ext}`))
      .join(",");
    input.style.display = "none";
    document.body.appendChild(input);

    const cleanup = () => {
      input.remove();
    };

    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      const buf = await file.arrayBuffer();
      resolve({ bytes: new Uint8Array(buf), filename: file.name });
    });

    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    });

    input.click();
  });
}
