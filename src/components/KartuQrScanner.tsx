import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";

type Props = {
  onScan: (raw: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
  className?: string;
};

async function stopScanner(scanner: Html5Qrcode): Promise<void> {
  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    /* belum start / sudah stop */
  }
  try {
    scanner.clear();
  } catch {
    /* elemen reader sudah hilang saat unmount */
  }
}

export function KartuQrScanner({
  onScan,
  onClose,
  title = "Scan QR kartu",
  hint = "Arahkan kamera ke QR di kartu Kasukretan.",
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const readerId = `kartu-qr-${uid}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const handledRef = useRef(false);
  const [cameraError, setCameraError] = useState("");
  const [starting, setStarting] = useState(true);

  onScanRef.current = onScan;

  useEffect(() => {
    handledRef.current = false;
    setCameraError("");
    setStarting(true);
    let cancelled = false;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;

    void (async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (handledRef.current || cancelled) return;
            handledRef.current = true;
            onScanRef.current(decoded);
          },
          () => {
            /* frame tanpa QR — abaikan */
          }
        );
        if (cancelled) {
          await stopScanner(scanner);
          return;
        }
        setStarting(false);
      } catch {
        if (cancelled) return;
        setStarting(false);
        setCameraError(
          "Kamera tidak bisa dibuka. Izinkan akses kamera untuk aplikasi ini, lalu coba lagi."
        );
      }
    })();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      void stopScanner(s);
    };
  }, [readerId]);

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      className={className ?? "max-w-sm [&>div:last-child]:p-0"}
    >
      <div className="relative p-4 space-y-3">
        {/* Animasi 1px: paksa WebView Android menggambar ulang frame kamera */}
        <span
          aria-hidden
          className="pointer-events-none absolute h-px w-px opacity-0 animate-spin"
        />
        <div id={readerId} className="w-full min-h-[180px] overflow-hidden rounded-lg bg-copper-950/10" />
        {starting && !cameraError ? (
          <p className="text-[11px] text-muted text-center">Menyiapkan kamera…</p>
        ) : null}
        {cameraError ? (
          <p className="text-xs text-red-700 text-center bg-red-50 border border-red-200 rounded px-2 py-1.5">
            {cameraError}
          </p>
        ) : (
          <p className="text-[11px] text-muted text-center">{hint}</p>
        )}
        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Batal
        </Button>
      </div>
    </Modal>
  );
}
