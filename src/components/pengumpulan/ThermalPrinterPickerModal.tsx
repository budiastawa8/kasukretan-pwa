import { Bluetooth, Loader2, RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import type { ThermalPrinterDevice } from "../../lib/thermal-native-print";
import { cn } from "../../lib/utils";

type Props = {
  open: boolean;
  devices: ThermalPrinterDevice[];
  loading: boolean;
  connectingAddress: string | null;
  error: string;
  onClose: () => void;
  onSelect: (device: ThermalPrinterDevice) => void;
  onScan: () => void;
};

export function ThermalPrinterPickerModal({
  open,
  devices,
  loading,
  connectingAddress,
  error,
  onClose,
  onSelect,
  onScan,
}: Props) {
  const busy = loading || connectingAddress != null;

  return (
    <Modal
      open={open}
      title="Pilih printer Bluetooth"
      onClose={onClose}
      canClose={!busy}
      dismissOnBackdrop={!busy}
      className="max-w-md"
      footer={
        <div className="flex gap-2 w-full">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            icon={RefreshCw}
            disabled={busy}
            onClick={onScan}
          >
            Cari lagi
          </Button>
          <Button type="button" variant="secondary" className="flex-1" disabled={busy} onClick={onClose}>
            Batal
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Ketuk nama printer thermal Anda (mis. RPP02, MTP, OASE). Perangkat lain seperti earphone
          bisa diabaikan.
        </p>

        {error ? <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p> : null}

        {loading && devices.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 className="animate-spin shrink-0" size={18} />
            Mencari printer…
          </div>
        ) : devices.length === 0 ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-3">
            Belum ada perangkat. Pair printer di Pengaturan Bluetooth HP, nyalakan printer, lalu tap{" "}
            <strong>Cari lagi</strong>.
          </p>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto divide-y divide-copper-200 border border-copper-200 rounded-xl">
            {devices.map((d) => {
              const connecting = connectingAddress === d.address;
              return (
                <li key={d.address}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSelect(d)}
                    className={cn(
                      "w-full text-left px-3 py-3 flex items-start gap-3 transition-colors",
                      "hover:bg-copper-50 active:bg-copper-100 disabled:opacity-60"
                    )}
                  >
                    <Bluetooth className="text-copper-700 shrink-0 mt-0.5" size={18} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-copper-950 truncate">
                        {d.name || "Printer thermal"}
                      </span>
                      <span className="block text-[11px] text-muted font-mono truncate">{d.address}</span>
                      {d.bonded ? (
                        <span className="inline-block mt-1 text-[10px] text-emerald-800">Sudah di-pair HP</span>
                      ) : null}
                    </span>
                    {connecting ? <Loader2 className="animate-spin text-copper-700 shrink-0" size={18} /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
