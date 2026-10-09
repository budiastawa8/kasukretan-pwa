import { useEffect, useId, useRef } from "react";
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
  const handledRef = useRef(false);

  useEffect(() => {
    handledRef.current = false;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;

    void scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decoded) => {
          if (handledRef.current) return;
          handledRef.current = true;
          onScan(decoded);
        },
        () => {
          /* frame tanpa QR — abaikan */
        }
      )
      .catch(() => {
        /* izin kamera ditolak / tidak ada kamera */
      });

    return () => {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      void s.stop().then(() => s.clear()).catch(() => {});
    };
  }, [readerId, onScan]);

  return (
    <Modal open title={title} onClose={onClose} className={className ?? "max-w-sm [&>div:last-child]:p-0"}>
      <div className="p-4 space-y-3">
        <div id={readerId} className="w-full overflow-hidden rounded-lg" />
        <p className="text-[11px] text-muted text-center">{hint}</p>
        <Button type="button" variant="secondary" className="w-full" onClick={onClose}>
          Batal
        </Button>
      </div>
    </Modal>
  );
}
