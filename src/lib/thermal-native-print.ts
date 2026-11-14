import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import {
  PrinterNotConfiguredError,
  type PrinterReadiness,
  type ThermalPrintResult,
} from "./thermal-bluetooth-print-types";

type ThermalTransport = "auto" | "spp" | "ble";

export type ThermalPrinterDevice = {
  address: string;
  name: string;
  bonded?: boolean;
  transportHint?: "spp" | "ble" | "unknown";
};

type SavedThermalPrinter = {
  address: string;
  name: string;
  transport: "spp" | "ble";
};

type ThermalPrinterStatus = {
  status: "connected" | "disconnected" | "never_paired";
  address?: string | null;
  name?: string | null;
  transport?: "spp" | "ble" | null;
};

interface ThermalPrinterPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  listBonded(): Promise<{ devices: ThermalPrinterDevice[] }>;
  scan(options?: { timeoutMs?: number }): Promise<{ devices: ThermalPrinterDevice[] }>;
  pairAndConnect(options: {
    address: string;
    name?: string;
    transport?: ThermalTransport;
  }): Promise<SavedThermalPrinter>;
  print(options: { dataBase64: string }): Promise<{ deviceName: string; transport: "spp" | "ble" }>;
  getSavedPrinter(): Promise<{ printer: SavedThermalPrinter | null }>;
  clearSavedPrinter(): Promise<void>;
  getStatus(): Promise<ThermalPrinterStatus>;
  addListener(
    eventName: "connectionChange",
    listenerFunc: (event: { connected: boolean }) => void
  ): Promise<PluginListenerHandle>;
}

const ThermalPrinter = registerPlugin<ThermalPrinterPlugin>("ThermalPrinter");

const PRINTER_NAME_RE =
  /printer|print|thermal|rpp|mtp|pos[-_ ]?|goojprt|xprinter|oase|cat\b|inner\s*printer|bluetooth\s*printer|kd\d+/i;

let cachedName: string | null = null;
let nativeAvailableCache: boolean | null = null;

function bytesToBase64(data: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function looksLikePrinter(d: ThermalPrinterDevice): boolean {
  return PRINTER_NAME_RE.test(d.name || "");
}

function sortDevices(devices: ThermalPrinterDevice[]): ThermalPrinterDevice[] {
  return [...devices].sort((a, b) => {
    const ap = looksLikePrinter(a) ? 0 : 1;
    const bp = looksLikePrinter(b) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    const ab = a.bonded ? 0 : 1;
    const bb = b.bonded ? 0 : 1;
    if (ab !== bb) return ab - bb;
    return (a.name || "").localeCompare(b.name || "", "id");
  });
}

function preferPrinters(devices: ThermalPrinterDevice[]): ThermalPrinterDevice[] {
  const printers = devices.filter(looksLikePrinter);
  return sortDevices(printers.length ? printers : devices);
}

/** True hanya di shell Capacitor Android (bukan browser biasa). */
export function isThermalNativeRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function isThermalNativeAvailable(): Promise<boolean> {
  if (!isThermalNativeRuntime()) return false;
  if (nativeAvailableCache != null) return nativeAvailableCache;
  try {
    const r = await ThermalPrinter.isAvailable();
    nativeAvailableCache = !!r.available;
  } catch {
    nativeAvailableCache = false;
  }
  return nativeAvailableCache;
}

export function getNativeCachedPrinterName(): string | null {
  return cachedName;
}

export async function probeNativePrinterReadiness(): Promise<PrinterReadiness> {
  if (!(await isThermalNativeAvailable())) return { status: "unsupported" };
  try {
    const status = await ThermalPrinter.getStatus();
    if (status.status === "never_paired") return { status: "never_paired" };
    const name = status.name?.trim() || cachedName || "Printer thermal";
    cachedName = name;
    return { status: "ready", name };
  } catch {
    return { status: "never_paired" };
  }
}

export function onNativePrinterConnectionChange(cb: (connected: boolean) => void): () => void {
  let handle: PluginListenerHandle | null = null;
  let cancelled = false;
  void ThermalPrinter.addListener("connectionChange", (ev) => {
    cb(!!ev.connected);
  }).then((h) => {
    if (cancelled) {
      void h.remove();
      return;
    }
    handle = h;
  });
  return () => {
    cancelled = true;
    void handle?.remove();
  };
}

/** Daftar perangkat untuk dipilih di UI (tap), bukan window.prompt. */
export async function listNativeThermalDevices(options?: {
  scan?: boolean;
}): Promise<ThermalPrinterDevice[]> {
  if (!(await isThermalNativeAvailable())) {
    throw new Error("Cetak native hanya tersedia di APK Kasukretan Petugas.");
  }
  const scan = options?.scan === true;
  if (scan) {
    const scanned = (await ThermalPrinter.scan({ timeoutMs: 8_000 })).devices;
    return preferPrinters(scanned);
  }
  const bonded = (await ThermalPrinter.listBonded()).devices;
  if (bonded.length) return preferPrinters(bonded);
  const scanned = (await ThermalPrinter.scan({ timeoutMs: 8_000 })).devices;
  return preferPrinters(scanned);
}

export async function connectNativeThermalPrinter(
  device: Pick<ThermalPrinterDevice, "address" | "name">
): Promise<string | null> {
  if (!(await isThermalNativeAvailable())) {
    throw new Error("Cetak native hanya tersedia di APK Kasukretan Petugas.");
  }
  const result = await ThermalPrinter.pairAndConnect({
    address: device.address,
    name: device.name,
    transport: "auto",
  });
  cachedName = result.name || device.name || "Printer thermal";
  return cachedName;
}

/** @deprecated Gunakan listNativeThermalDevices + connectNativeThermalPrinter + UI tap. */
export async function pairNativeThermalPrinter(): Promise<string | null> {
  const devices = await listNativeThermalDevices();
  if (!devices.length) {
    throw new Error(
      "Tidak ada printer Bluetooth. Pair printer di Pengaturan Bluetooth HP, nyalakan printer, lalu tap ikon Bluetooth lagi."
    );
  }
  if (devices.length === 1) {
    return connectNativeThermalPrinter(devices[0]);
  }
  throw new Error("PilihPrinterUI");
}

export async function printEscPosViaNative(data: Uint8Array): Promise<ThermalPrintResult> {
  if (!(await isThermalNativeAvailable())) {
    throw new Error("Cetak native hanya tersedia di APK Kasukretan Petugas.");
  }
  const saved = (await ThermalPrinter.getSavedPrinter()).printer;
  if (!saved) {
    throw new PrinterNotConfiguredError("never_paired");
  }
  try {
    const result = await ThermalPrinter.print({ dataBase64: bytesToBase64(data) });
    cachedName = result.deviceName || saved.name || "Printer thermal";
    return { mode: "bluetooth", deviceName: cachedName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("NEVER_PAIRED") || /belum dihubungkan/i.test(msg)) {
      throw new PrinterNotConfiguredError("never_paired");
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}
