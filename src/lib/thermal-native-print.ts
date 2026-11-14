import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import {
  PrinterNotConfiguredError,
  type PrinterReadiness,
  type ThermalPrintResult,
} from "./thermal-bluetooth-print-types";

type ThermalTransport = "auto" | "spp" | "ble";

type ThermalPrinterDevice = {
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

async function pickDeviceInteractive(): Promise<ThermalPrinterDevice> {
  let devices = (await ThermalPrinter.listBonded()).devices;
  if (!devices.length) {
    devices = (await ThermalPrinter.scan({ timeoutMs: 8_000 })).devices;
  }
  if (!devices.length) {
    throw new Error(
      "Tidak ada printer Bluetooth. Pair printer di Pengaturan Bluetooth HP, nyalakan printer, lalu tap ikon Bluetooth lagi."
    );
  }
  if (devices.length === 1) return devices[0];

  const lines = devices.map((d, i) => `${i + 1}. ${d.name} (${d.address})`).join("\n");
  const ans = window.prompt(`Pilih printer (ketik nomor):\n\n${lines}`, "1");
  if (ans == null) throw new Error("Pemilihan printer dibatalkan.");
  const idx = Number.parseInt(ans.trim(), 10) - 1;
  if (!Number.isFinite(idx) || idx < 0 || idx >= devices.length) {
    throw new Error("Nomor printer tidak valid.");
  }
  return devices[idx];
}

export async function pairNativeThermalPrinter(): Promise<string | null> {
  if (!(await isThermalNativeAvailable())) {
    throw new Error("Cetak native hanya tersedia di APK Kasukretan Petugas.");
  }
  const device = await pickDeviceInteractive();
  const result = await ThermalPrinter.pairAndConnect({
    address: device.address,
    name: device.name,
    transport: "auto",
  });
  cachedName = result.name || device.name || "Printer thermal";
  return cachedName;
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
