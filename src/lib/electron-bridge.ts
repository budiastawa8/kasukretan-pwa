/**
 * Electron preload bridge types.
 * Runtime diisi oleh electron/preload.cjs.
 */

export type ElectronLanServerState = {
  running: boolean;
  port: number | null;
  host: string;
  apiPort: number;
  apiSpawned: boolean;
  spaMode: "static" | "vite-proxy" | "none";
  startedAt: string | null;
  lastError: string | null;
  lanUrls?: string[];
};

export type ElectronSession = {
  mode: "server" | "client" | null;
  clientUrl: string | null;
  entered: boolean;
};

export type ElectronSqlApi = {
  load: (dbKey: string) => Promise<{ ok: boolean; path: string }>;
  execute: (
    dbKey: string,
    sql: string,
    bind?: unknown[]
  ) => Promise<{ rowsAffected: number }>;
  select: (dbKey: string, sql: string, bind?: unknown[]) => Promise<unknown>;
  close: (dbKey: string) => Promise<{ ok: boolean }>;
};

export type KasukretanElectronApi = {
  isElectron: true;
  getEnv: () => Promise<{ isDev: boolean; defaultPort: number; userData: string }>;
  getSession: () => Promise<ElectronSession>;
  setSession: (patch: Partial<ElectronSession>) => Promise<ElectronSession>;
  getLocalIps: () => Promise<string[]>;
  getServerState: () => Promise<ElectronLanServerState>;
  startServer: (opts?: {
    port?: number;
    spawnApi?: boolean;
  }) => Promise<ElectronLanServerState>;
  stopServer: () => Promise<ElectronLanServerState>;
  loadUrl: (url: string) => Promise<{ ok: boolean; url: string }>;
  reloadLocal: () => Promise<{ ok: boolean }>;

  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  sql: ElectronSqlApi;
  dialog: {
    open: (options?: Record<string, unknown>) => Promise<string | string[] | null>;
    save: (options?: Record<string, unknown>) => Promise<string | null>;
  };
  fs: {
    readFile: (filePath: string) => Promise<number[]>;
    writeFile: (filePath: string, data: number[] | Uint8Array) => Promise<null>;
  };
  opener: {
    openUrl: (url: string) => Promise<null>;
  };
  window: {
    onCloseRequested: (
      callback: (event: { preventDefault: () => void }) => void | Promise<void>
    ) => () => void;
    destroy: () => Promise<{ ok: boolean }>;
    allowClose: () => Promise<{ ok: boolean }>;
  };
};

declare global {
  interface Window {
    kasukretanElectron?: KasukretanElectronApi;
  }
}

export function isElectronShell(): boolean {
  return typeof window !== "undefined" && Boolean(window.kasukretanElectron?.isElectron);
}

export function getElectronApi(): KasukretanElectronApi | null {
  return window.kasukretanElectron ?? null;
}
