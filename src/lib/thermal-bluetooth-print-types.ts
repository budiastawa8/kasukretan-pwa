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

export type ThermalPrintResult = { mode: "bluetooth"; deviceName: string };
