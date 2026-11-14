export type ThermalTransport = "auto" | "spp" | "ble";

export type ThermalPrinterDevice = {
  address: string;
  name: string;
  bonded?: boolean;
  transportHint?: "spp" | "ble" | "unknown";
};

export type SavedThermalPrinter = {
  address: string;
  name: string;
  transport: "spp" | "ble";
};

export type ThermalPrinterStatus = {
  status: "connected" | "disconnected" | "never_paired";
  address?: string | null;
  name?: string | null;
  transport?: "spp" | "ble" | null;
};

export type PairAndConnectOptions = {
  address: string;
  name?: string;
  transport?: ThermalTransport;
};

export type PrintOptions = {
  dataBase64: string;
};

export type ScanOptions = {
  timeoutMs?: number;
};

export interface ThermalPrinterPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  listBonded(): Promise<{ devices: ThermalPrinterDevice[] }>;
  scan(options?: ScanOptions): Promise<{ devices: ThermalPrinterDevice[] }>;
  pairAndConnect(options: PairAndConnectOptions): Promise<SavedThermalPrinter>;
  print(options: PrintOptions): Promise<{ deviceName: string; transport: "spp" | "ble" }>;
  getSavedPrinter(): Promise<{ printer: SavedThermalPrinter | null }>;
  clearSavedPrinter(): Promise<void>;
  getStatus(): Promise<ThermalPrinterStatus>;
  addListener(
    eventName: "connectionChange",
    listenerFunc: (event: { connected: boolean }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}
