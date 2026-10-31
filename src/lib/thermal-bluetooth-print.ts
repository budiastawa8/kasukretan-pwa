const PRINTER_ID_KEY = "kasukretan:thermal-printer-id";
const PRINTER_NAME_KEY = "kasukretan:thermal-printer-name";
const SMALL_CHUNK_KEY_PREFIX = "kasukretan:thermal-printer-small-chunk:";

/** Printer yang sudah dipilih di sesi tab ini — tidak perlu dialog ulang. */
let sessionPrinter: BluetoothDevice | null = null;
/** Printer dari getDevices() harus menunggu iklan BLE sebelum connect(). */
let sessionPrinterFromStorage = false;

let activeLink: {
  device: BluetoothDevice;
  characteristic: BluetoothRemoteGATTCharacteristic;
} | null = null;

/** Layanan BLE umum printer thermal (RPP02, MTP-II, Goojprt, printer "cat", dll.). */
const OPTIONAL_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae8-8f69-9a5752655250",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000ff12-0000-1000-8000-00805f9b34fb",
] as const;

const KNOWN_WRITE_CHARS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "49535344-fe7d-4ae8-8f69-9a5752655250",
  "bef8d6c9-9c21-4c9e-b632-ba34139b7b4b",
  "0000ff02-0000-1000-8000-00805f9b34fb",
  "0000ffe1-0000-1000-8000-00805f9b34fb",
  "0000ae01-0000-1000-8000-00805f9b34fb",
  "0000fec7-0000-1000-8000-00805f9b34fb",
  "0000ff01-0000-1000-8000-00805f9b34fb",
] as const;

const CHUNK_SIZE = 100;
/** Ukuran aman untuk MTU BLE minimum (23 byte − 3 header). */
const SMALL_CHUNK_SIZE = 20;
const CHUNK_DELAY_MS = 20;

const CONNECT_ATTEMPTS = 3;
const CONNECT_TIMEOUT_MS = 12_000;
const ADVERTISEMENT_WAIT_MS = 5_000;
const WRITE_RECOVERY_ATTEMPTS = 2;

export type PrinterPermissionKind = "never_paired" | "permission_lost";

export class PrinterNotConfiguredError extends Error {
  readonly kind: PrinterPermissionKind;

  constructor(kind: PrinterPermissionKind = "never_paired", printerName?: string | null) {
    const name = printerName?.trim();
    const message =
      kind === "permission_lost"
        ? `Printer${name ? ` “${name}”` : ""} pernah dipakai, tetapi izin Bluetooth browser hilang. Tap tombol Printer sekali untuk menghubungkan lagi (Chrome Android · jangan hapus data situs).`
        : "Printer belum dihubungkan. Tap tombol Printer sekali untuk memilih printer.";
    super(message);
    this.name = "PrinterNotConfiguredError";
    this.kind = kind;
  }
}

/** Status printer untuk UI: siap cetak vs perlu pair ulang. */
export type PrinterReadiness =
  | { status: "unsupported" }
  | { status: "ready"; name: string }
  | { status: "permission_lost"; name: string | null }
  | { status: "never_paired" };

function storedPrinterNameOnly(): string | null {
  try {
    return localStorage.getItem(PRINTER_NAME_KEY);
  } catch {
    return null;
  }
}

class NoWritableCharacteristicError extends Error {
  constructor() {
    super(
      "Printer tidak punya kanal tulis BLE yang dikenali. Printer ini kemungkinan hanya mendukung Bluetooth klasik — gunakan Cetak lewat dialog browser atau PDF."
    );
    this.name = "NoWritableCharacteristicError";
  }
}

class ChunkWriteError extends Error {
  constructor(
    readonly offset: number,
    readonly original: unknown
  ) {
    super(original instanceof Error ? original.message : String(original));
    this.name = "ChunkWriteError";
  }
}

const connectionListeners = new Set<(connected: boolean) => void>();

/** Beri tahu UI saat printer tersambung/terputus (mis. printer masuk mode tidur). */
export function onPrinterConnectionChange(cb: (connected: boolean) => void): () => void {
  connectionListeners.add(cb);
  return () => {
    connectionListeners.delete(cb);
  };
}

function emitConnection(connected: boolean): void {
  connectionListeners.forEach((cb) => cb(connected));
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function rememberPrinter(device: BluetoothDevice, fromStorage: boolean): void {
  sessionPrinter = device;
  sessionPrinterFromStorage = fromStorage;
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

function prefersSmallChunks(deviceId: string): boolean {
  try {
    return localStorage.getItem(SMALL_CHUNK_KEY_PREFIX + deviceId) === "1";
  } catch {
    return false;
  }
}

function rememberSmallChunks(deviceId: string): void {
  try {
    localStorage.setItem(SMALL_CHUNK_KEY_PREFIX + deviceId, "1");
  } catch {
    /* abaikan */
  }
}

const trackedDevices = new WeakSet<BluetoothDevice>();

function trackDisconnect(device: BluetoothDevice): void {
  if (trackedDevices.has(device)) return;
  trackedDevices.add(device);
  device.addEventListener("gattserverdisconnected", () => {
    if (activeLink?.device === device) activeLink = null;
    emitConnection(false);
  });
}

/** Juga membatalkan connect() yang masih menggantung (mis. setelah batas waktu). */
function safeDisconnect(device: BluetoothDevice): void {
  if (activeLink?.device === device) activeLink = null;
  try {
    device.gatt?.disconnect();
  } catch {
    /* abaikan */
  }
}

/** Tunggu printer terdeteksi beriklan (atau batas waktu) — diabaikan bila browser tidak mendukung. */
async function waitForAdvertisement(device: BluetoothDevice): Promise<void> {
  if (!device.watchAdvertisements) return;
  const abort = new AbortController();
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      device.removeEventListener("advertisementreceived", done);
      resolve();
    };
    const timer = setTimeout(done, ADVERTISEMENT_WAIT_MS);
    device.addEventListener("advertisementreceived", done);
    device.watchAdvertisements!({ signal: abort.signal }).catch(done);
  });
  abort.abort();
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

  throw new NoWritableCharacteristicError();
}

function connectErrorMessage(device: BluetoothDevice, e: unknown): string {
  const nama = device.name?.trim() || "printer";
  const detail = e instanceof Error ? e.message : String(e);
  return (
    `Gagal terhubung ke ${nama}. Pastikan printer menyala, dekat dengan HP, ` +
    `dan tidak sedang tersambung ke HP atau aplikasi lain. (${detail})`
  );
}

/** Sambungkan (atau pakai sambungan aktif) dengan percobaan ulang dan batas waktu. */
async function openLink(device: BluetoothDevice): Promise<BluetoothRemoteGATTCharacteristic> {
  if (activeLink?.device === device && device.gatt?.connected) {
    return activeLink.characteristic;
  }
  if (!device.gatt) throw new Error("Perangkat Bluetooth tidak mendukung GATT.");
  trackDisconnect(device);

  let lastError: unknown;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    try {
      if (attempt > 1 || (sessionPrinter === device && sessionPrinterFromStorage)) {
        await waitForAdvertisement(device);
      }
      const server = device.gatt.connected
        ? device.gatt
        : await withTimeout(
            device.gatt.connect(),
            CONNECT_TIMEOUT_MS,
            "Printer tidak merespons (batas waktu habis)."
          );
      const characteristic = await findWritableCharacteristic(server);
      activeLink = { device, characteristic };
      emitConnection(true);
      return characteristic;
    } catch (e) {
      lastError = e;
      safeDisconnect(device);
      if (e instanceof NoWritableCharacteristicError) throw e;
      if (attempt < CONNECT_ATTEMPTS) await sleep(700 * attempt);
    }
  }
  throw new Error(connectErrorMessage(device, lastError));
}

async function writeFrom(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
  start: number,
  chunkSize: number
): Promise<void> {
  const write = characteristic.properties.writeWithoutResponse
    ? (chunk: Uint8Array) => characteristic.writeValueWithoutResponse(chunk)
    : (chunk: Uint8Array) => characteristic.writeValue(chunk);

  for (let i = start; i < data.length; i += chunkSize) {
    try {
      await write(data.slice(i, i + chunkSize));
    } catch (e) {
      throw new ChunkWriteError(i, e);
    }
    if (i + chunkSize < data.length) await sleep(CHUNK_DELAY_MS);
  }
}

/**
 * Kirim data; bila kiriman gagal di tengah jalan, sambung ulang dan lanjutkan dari potongan
 * yang gagal dengan ukuran kecil (agar struk tidak tercetak ganda dari awal).
 */
async function sendToPrinter(device: BluetoothDevice, data: Uint8Array): Promise<void> {
  let offset = 0;
  let chunkSize = prefersSmallChunks(device.id) ? SMALL_CHUNK_SIZE : CHUNK_SIZE;
  let recoveries = 0;

  for (;;) {
    const characteristic = await openLink(device);
    try {
      await writeFrom(characteristic, data, offset, chunkSize);
      return;
    } catch (e) {
      if (!(e instanceof ChunkWriteError) || recoveries >= WRITE_RECOVERY_ATTEMPTS) {
        throw e instanceof ChunkWriteError ? e.original : e;
      }
      recoveries += 1;
      offset = e.offset;
      if (chunkSize > SMALL_CHUNK_SIZE) {
        chunkSize = SMALL_CHUNK_SIZE;
        rememberSmallChunks(device.id);
      }
      if (!device.gatt?.connected) activeLink = null;
      await sleep(400);
    }
  }
}

/** Ambil printer yang pernah diizinkan browser (tanpa dialog). */
async function pickAuthorizedDevice(): Promise<BluetoothDevice | null> {
  if (!navigator.bluetooth?.getDevices) return null;
  const devices = await navigator.bluetooth.getDevices();
  if (!devices.length) return null;

  const saved = savedPrinterId();
  if (saved) return devices.find((d) => d.id === saved) ?? null;
  return devices.length === 1 ? devices[0] : null;
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

/**
 * Cek kesiapan printer untuk UI.
 * - ready: browser masih mengizinkan perangkat → Cetak tanpa dialog
 * - permission_lost: nama/ID ada di HP, tapi getDevices() kosong → perlu tap Printer sekali
 * - never_paired: belum pernah pair di browser ini
 */
export async function probePrinterReadiness(): Promise<PrinterReadiness> {
  if (!isThermalBluetoothSupported()) return { status: "unsupported" };

  if (sessionPrinter) {
    return {
      status: "ready",
      name: sessionPrinter.name?.trim() || storedPrinterNameOnly() || "Printer thermal",
    };
  }

  const device = await pickAuthorizedDevice();
  if (device) {
    rememberPrinter(device, true);
    return {
      status: "ready",
      name: device.name?.trim() || storedPrinterNameOnly() || "Printer thermal",
    };
  }

  const savedName = storedPrinterNameOnly();
  if (savedPrinterId() || savedName) {
    return { status: "permission_lost", name: savedName };
  }
  return { status: "never_paired" };
}

/** Muat printer tersimpan saat halaman dibuka — tanpa dialog pairing. */
export async function warmUpSavedPrinter(): Promise<BluetoothDevice | null> {
  if (sessionPrinter) return sessionPrinter;
  const device = await pickAuthorizedDevice();
  if (device) rememberPrinter(device, true);
  return device;
}

/** Resolve printer untuk cetak — tidak pernah membuka dialog pairing. */
async function resolvePrinterForPrint(): Promise<BluetoothDevice> {
  if (sessionPrinter) return sessionPrinter;

  const authorized = await pickAuthorizedDevice();
  if (authorized) {
    rememberPrinter(authorized, true);
    return authorized;
  }

  const savedName = storedPrinterNameOnly();
  if (savedPrinterId() || savedName) {
    throw new PrinterNotConfiguredError("permission_lost", savedName);
  }
  throw new PrinterNotConfiguredError("never_paired");
}

export type ThermalPrintResult = { mode: "bluetooth"; deviceName: string };

/**
 * Kirim byte ESC/POS ke printer thermal BLE.
 * Hanya memakai printer yang sudah pernah dipilih lewat pairThermalPrinter().
 * Sambungan dibiarkan terbuka agar cetak berikutnya cepat; bila printer memutus sendiri,
 * cetak berikutnya menyambung ulang otomatis.
 */
export async function printEscPosViaBluetooth(data: Uint8Array): Promise<ThermalPrintResult> {
  if (!isThermalBluetoothSupported()) {
    throw new Error("Web Bluetooth tidak tersedia. Gunakan Chrome di Android dan HTTPS.");
  }

  const device = await resolvePrinterForPrint();
  try {
    await sendToPrinter(device, data);
  } catch (e) {
    safeDisconnect(device);
    throw e;
  }
  return { mode: "bluetooth", deviceName: device.name || getCachedPrinterName() || "Printer thermal" };
}

/** Pairing sekali — satu-satunya tempat dialog pilih printer muncul. */
export async function pairThermalPrinter(): Promise<string | null> {
  const device = await requestPrinterDevice();
  if (sessionPrinter && sessionPrinter !== device) safeDisconnect(sessionPrinter);
  try {
    await sendToPrinter(device, new Uint8Array([0x1b, 0x40]));
  } catch (e) {
    safeDisconnect(device);
    throw e;
  }
  rememberPrinter(device, false);
  return device.name || getCachedPrinterName() || "Printer thermal";
}
