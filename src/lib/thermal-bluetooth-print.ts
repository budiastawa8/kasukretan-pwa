const PRINTER_ID_KEY = "kasukretan:thermal-printer-id";
const PRINTER_NAME_KEY = "kasukretan:thermal-printer-name";

/** Printer yang sudah dipilih di sesi tab ini — tidak perlu dialog ulang. */
let sessionPrinter: BluetoothDevice | null = null;

/** Layanan BLE umum printer thermal (RPP02, MTP-II, dll.). */
const OPTIONAL_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae8-8f69-9a5752655250",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000ff00-0000-1000-8000-00805f9b34fb",
] as const;

const KNOWN_WRITE_CHARS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "49535344-fe7d-4ae8-8f69-9a5752655250",
  "bef8d6c9-9c21-4c9e-b632-ba34139b7b4b",
  "0000ff02-0000-1000-8000-00805f9b34fb",
] as const;

const CHUNK_SIZE = 128;
const CHUNK_DELAY_MS = 15;

export class PrinterNotConfiguredError extends Error {
  constructor() {
    super("Printer belum dihubungkan. Tap tombol Printer sekali untuk memilih printer.");
    this.name = "PrinterNotConfiguredError";
  }
}

export function isThermalBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export function getCachedPrinterName(): string | null {
  if (sessionPrinter?.name?.trim()) return sessionPrinter.name.trim();
  try {
    return localStorage.getItem(PRINTER_NAME_KEY);
  } catch {
    return null;
  }
}

export function hasKnownPrinter(): boolean {
  return !!sessionPrinter || !!savedPrinterId();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rememberPrinter(device: BluetoothDevice): void {
  sessionPrinter = device;
  try {
    localStorage.setItem(PRINTER_ID_KEY, device.id);
    if (device.name?.trim()) {
      localStorage.setItem(PRINTER_NAME_KEY, device.name.trim());
    }
  } catch {
    /* abaikan */
  }
}

function savedPrinterId(): string | null {
  try {
    return localStorage.getItem(PRINTER_ID_KEY);
  } catch {
    return null;
  }
}

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic> {
  for (const serviceUuid of OPTIONAL_SERVICES) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      for (const charUuid of KNOWN_WRITE_CHARS) {
        try {
          const ch = await service.getCharacteristic(charUuid);
          if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
        } catch {
          /* coba berikutnya */
        }
      }
    } catch {
      /* layanan tidak ada */
    }
  }

  const services = await server.getPrimaryServices();
  for (const service of services) {
    const chars = await service.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.writeWithoutResponse) return ch;
      if (ch.properties.write) return ch;
    }
  }

  throw new Error("Printer tidak punya kanal tulis yang dikenali. Coba printer thermal BLE lain.");
}

async function writeInChunks(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array
): Promise<void> {
  const write = characteristic.properties.writeWithoutResponse
    ? (chunk: Uint8Array) => characteristic.writeValueWithoutResponse(chunk)
    : (chunk: Uint8Array) => characteristic.writeValue(chunk);

  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await write(chunk);
    if (i + CHUNK_SIZE < data.length) await sleep(CHUNK_DELAY_MS);
  }
}

async function connectDevice(device: BluetoothDevice): Promise<BluetoothRemoteGATTCharacteristic> {
  if (!device.gatt) throw new Error("Perangkat Bluetooth tidak mendukung GATT.");
  const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
  const ch = await findWritableCharacteristic(server);
  rememberPrinter(device);
  return ch;
}

/** Ambil printer yang pernah diizinkan browser (tanpa dialog). */
async function pickAuthorizedDevice(): Promise<BluetoothDevice | null> {
  if (!navigator.bluetooth?.getDevices) return null;
  const devices = await navigator.bluetooth.getDevices();
  if (!devices.length) return null;

  const saved = savedPrinterId();
  if (saved) {
    const hit = devices.find((d) => d.id === saved);
    if (hit) return hit;
  }
  return devices[0] ?? null;
}

async function requestPrinterDevice(): Promise<BluetoothDevice> {
  if (!navigator.bluetooth) {
    throw new Error("Browser ini tidak mendukung Bluetooth untuk cetak langsung.");
  }
  return navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [...OPTIONAL_SERVICES],
  });
}

/** Muat printer tersimpan saat halaman dibuka — tanpa dialog pairing. */
export async function warmUpSavedPrinter(): Promise<BluetoothDevice | null> {
  if (sessionPrinter) return sessionPrinter;
  const device = await pickAuthorizedDevice();
  if (device) rememberPrinter(device);
  return device;
}

/** Resolve printer untuk cetak — tidak pernah membuka dialog pairing. */
async function resolvePrinterForPrint(): Promise<BluetoothDevice> {
  if (sessionPrinter) return sessionPrinter;

  const authorized = await pickAuthorizedDevice();
  if (authorized) {
    rememberPrinter(authorized);
    return authorized;
  }

  throw new PrinterNotConfiguredError();
}

export type ThermalPrintResult = { mode: "bluetooth"; deviceName: string };

/**
 * Kirim byte ESC/POS ke printer thermal BLE.
 * Hanya memakai printer yang sudah pernah dipilih lewat pairThermalPrinter().
 */
export async function printEscPosViaBluetooth(data: Uint8Array): Promise<ThermalPrintResult> {
  if (!isThermalBluetoothSupported()) {
    throw new Error("Web Bluetooth tidak tersedia. Gunakan Chrome di Android dan HTTPS.");
  }

  const device = await resolvePrinterForPrint();

  try {
    const characteristic = await connectDevice(device);
    await writeInChunks(characteristic, data);
    return { mode: "bluetooth", deviceName: device.name || getCachedPrinterName() || "Printer thermal" };
  } catch (e) {
    if (device.gatt?.connected) {
      try {
        device.gatt.disconnect();
      } catch {
        /* abaikan */
      }
    }
    throw e;
  }
}

/** Pairing sekali — satu-satunya tempat dialog pilih printer muncul. */
export async function pairThermalPrinter(): Promise<string | null> {
  const device = await requestPrinterDevice();
  const ch = await connectDevice(device);
  await ch.writeValue(new Uint8Array([0x1b, 0x40]));
  return device.name || getCachedPrinterName() || "Printer thermal";
}
