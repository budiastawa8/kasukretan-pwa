/** File system desktop via IPC Electron. */

import { getElectronApi } from "../electron-bridge";

function requireFs() {
  const api = getElectronApi();
  if (!api?.fs) {
    throw new Error("File system desktop hanya tersedia di Electron.");
  }
  return api.fs;
}

export async function readFile(path: string): Promise<Uint8Array> {
  const arr = await requireFs().readFile(path);
  return new Uint8Array(arr);
}

export async function writeFile(
  path: string,
  data: Uint8Array
): Promise<void> {
  await requireFs().writeFile(path, Array.from(data));
}
