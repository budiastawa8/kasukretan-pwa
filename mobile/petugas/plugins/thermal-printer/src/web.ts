import { WebPlugin } from "@capacitor/core";
import type {
  PairAndConnectOptions,
  PrintOptions,
  SavedThermalPrinter,
  ScanOptions,
  ThermalPrinterDevice,
  ThermalPrinterPlugin,
  ThermalPrinterStatus,
} from "./definitions";

export class ThermalPrinterWeb extends WebPlugin implements ThermalPrinterPlugin {
  async isAvailable(): Promise<{ available: boolean }> {
    return { available: false };
  }

  async listBonded(): Promise<{ devices: ThermalPrinterDevice[] }> {
    return { devices: [] };
  }

  async scan(_options?: ScanOptions): Promise<{ devices: ThermalPrinterDevice[] }> {
    return { devices: [] };
  }

  async pairAndConnect(_options: PairAndConnectOptions): Promise<SavedThermalPrinter> {
    throw this.unimplemented("ThermalPrinter hanya tersedia di APK petugas Android.");
  }

  async print(_options: PrintOptions): Promise<{ deviceName: string; transport: "spp" | "ble" }> {
    throw this.unimplemented("ThermalPrinter hanya tersedia di APK petugas Android.");
  }

  async getSavedPrinter(): Promise<{ printer: SavedThermalPrinter | null }> {
    return { printer: null };
  }

  async clearSavedPrinter(): Promise<void> {}

  async getStatus(): Promise<ThermalPrinterStatus> {
    return { status: "never_paired" };
  }
}
