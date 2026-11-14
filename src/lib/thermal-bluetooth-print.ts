/**
 * Facade cetak thermal: native Capacitor (SPP+BLE) di APK petugas,
 * Web Bluetooth di Chrome Android.
 */
export type {
  PrinterPermissionKind,
  PrinterReadiness,
  ThermalPrintResult,
} from "./thermal-bluetooth-print-types";
export { PrinterNotConfiguredError } from "./thermal-bluetooth-print-types";

import type { PrinterReadiness, ThermalPrintResult } from "./thermal-bluetooth-print-types";
import {
  connectNativeThermalPrinter,
  getNativeCachedPrinterName,
  isThermalNativeRuntime,
  listNativeThermalDevices,
  onNativePrinterConnectionChange,
  printEscPosViaNative,
  probeNativePrinterReadiness,
  type ThermalPrinterDevice,
} from "./thermal-native-print";
import * as web from "./thermal-web-bluetooth-print";

export type { ThermalPrinterDevice };

export function isThermalNativeShell(): boolean {
  return isThermalNativeRuntime();
}

export async function listThermalPrinterDevices(options?: {
  scan?: boolean;
}): Promise<ThermalPrinterDevice[]> {
  if (!isThermalNativeRuntime()) return [];
  return listNativeThermalDevices(options);
}

export async function connectThermalPrinterDevice(
  device: Pick<ThermalPrinterDevice, "address" | "name">
): Promise<string | null> {
  if (!isThermalNativeRuntime()) {
    throw new Error("Pemilihan printer daftar hanya tersedia di APK petugas.");
  }
  return connectNativeThermalPrinter(device);
}

export function isThermalBluetoothSupported(): boolean {
  return isThermalNativeRuntime() || web.isThermalBluetoothSupported();
}

export function getCachedPrinterName(): string | null {
  if (isThermalNativeRuntime()) {
    return getNativeCachedPrinterName() || web.getCachedPrinterName();
  }
  return web.getCachedPrinterName();
}

export function hasKnownPrinter(): boolean {
  if (isThermalNativeRuntime()) {
    return !!getNativeCachedPrinterName() || web.hasKnownPrinter();
  }
  return web.hasKnownPrinter();
}

export function onPrinterConnectionChange(cb: (connected: boolean) => void): () => void {
  if (isThermalNativeRuntime()) {
    return onNativePrinterConnectionChange(cb);
  }
  return web.onPrinterConnectionChange(cb);
}

export async function probePrinterReadiness(): Promise<PrinterReadiness> {
  if (isThermalNativeRuntime()) {
    return probeNativePrinterReadiness();
  }
  return web.probePrinterReadiness();
}

export async function warmUpSavedPrinter(): Promise<unknown> {
  if (isThermalNativeRuntime()) {
    await probeNativePrinterReadiness();
    return null;
  }
  return web.warmUpSavedPrinter();
}

export async function printEscPosViaBluetooth(data: Uint8Array): Promise<ThermalPrintResult> {
  if (isThermalNativeRuntime()) {
    return printEscPosViaNative(data);
  }
  return web.printEscPosViaBluetooth(data);
}

/** Web Bluetooth: dialog browser. Native: gunakan listThermalPrinterDevices + connectThermalPrinterDevice. */
export async function pairThermalPrinter(): Promise<string | null> {
  if (isThermalNativeRuntime()) {
    throw new Error("Gunakan pemilih printer di layar (tap nama printer).");
  }
  return web.pairThermalPrinter();
}
