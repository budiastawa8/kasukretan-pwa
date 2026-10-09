import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  FileDown,
  Minus,
  Plus,
  Printer,
  RotateCcw,
} from "lucide-react";
import { downloadBytes } from "../../lib/download-bytes";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import "../../styles/pdf-preview.css";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

function nextZoom(current: number, dir: 1 | -1): number {
  const idx = ZOOM_STEPS.findIndex((z) => z >= current - 0.001);
  const i = idx < 0 ? 2 : idx;
  const next = i + dir;
  if (next < 0) return ZOOM_STEPS[0];
  if (next >= ZOOM_STEPS.length) return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return ZOOM_STEPS[next];
}

export function PdfPreviewView({
  title,
  subtitle,
  filename,
  pdfUrl,
  loading,
  error,
  backTo,
  backLabel,
  onRetry,
  portrait,
  thermalPreview,
  extraToolbar,
}: {
  title: string;
  subtitle?: string;
  filename: string;
  pdfUrl: string | null;
  loading: boolean;
  error: string;
  backTo: string;
  backLabel: string;
  onRetry?: () => void;
  portrait?: boolean;
  thermalPreview?: boolean;
  extraToolbar?: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);

  const handlePrint = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      window.alert("PDF belum siap. Tunggu hingga pratinjau tampil.");
      return;
    }
    try {
      win.focus();
      win.print();
    } catch {
      window.alert("Tidak dapat membuka dialog cetak. Gunakan Simpan PDF lalu cetak dari aplikasi PDF.");
    }
  }, []);

  async function handleSavePdf() {
    if (!pdfUrl) return;
    setSaving(true);
    try {
      const res = await fetch(pdfUrl);
      const buf = new Uint8Array(await res.arrayBuffer());
      await downloadBytes(buf, filename, "application/pdf");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pdf-preview-page min-h-screen flex flex-col bg-stone-200/90">
      <header className="pdf-preview-toolbar sticky top-0 z-10 border-b border-copper-200/80 bg-white/95 backdrop-blur-sm shadow-sm shrink-0">
        <div className="w-full max-w-full mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <BackLink to={backTo}>{backLabel}</BackLink>
          <div
            className="hidden sm:block w-px self-stretch min-h-[2.25rem] bg-copper-200/90 shrink-0"
            aria-hidden
          />
          <div className="flex-1 min-w-0 basis-full sm:basis-auto order-3 sm:order-none">
            <p className="text-sm sm:text-base font-semibold text-copper-950 truncate">{title}</p>
            {subtitle ? (
              <p className="text-xs sm:text-sm text-copper-700 truncate">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 ml-auto">
            {extraToolbar}
            <Button
              type="button"
              variant="secondary"
              iconOnly
              icon={Minus}
              title="Perkecil"
              aria-label="Perkecil"
              disabled={!pdfUrl || zoom <= ZOOM_STEPS[0]}
              onClick={() => setZoom((z) => nextZoom(z, -1))}
            />
            <span className="text-sm tabular-nums min-w-[3rem] text-center text-copper-800">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="secondary"
              iconOnly
              icon={Plus}
              title="Perbesar"
              aria-label="Perbesar"
              disabled={!pdfUrl || zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              onClick={() => setZoom((z) => nextZoom(z, 1))}
            />
            {onRetry && (
              <Button
                type="button"
                variant="ghost"
                icon={RotateCcw}
                className="!min-w-10 !px-2 sm:!px-3.5"
                disabled={loading}
                onClick={onRetry}
                title="Buat ulang"
              >
                <span className="max-sm:sr-only">Buat ulang</span>
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              icon={FileDown}
              className="!min-w-10 !px-2 sm:!px-3.5"
              disabled={!pdfUrl || saving}
              onClick={() => void handleSavePdf()}
              title={saving ? "Menyimpan…" : "Simpan PDF"}
            >
              <span className="max-sm:sr-only">{saving ? "Menyimpan…" : "Simpan PDF"}</span>
            </Button>
            <Button
              type="button"
              icon={Printer}
              className="!min-w-10 !px-2 sm:!px-3.5"
              disabled={!pdfUrl}
              onClick={handlePrint}
              title="Cetak"
            >
              <span className="max-sm:sr-only">Cetak</span>
            </Button>
          </div>
        </div>
        {error && (
          <p className="w-full max-w-full mx-auto px-3 sm:px-4 pb-2 text-sm text-red-700">{error}</p>
        )}
      </header>

      <main className="pdf-preview-main flex-1 min-h-0 overflow-auto p-2 sm:p-4">
        {loading && (
          <p className="text-center text-muted text-sm py-16">Membuat PDF…</p>
        )}
        {!loading && pdfUrl && (
          <div
            className={`pdf-preview-scaler-host mx-auto${
              portrait ? " pdf-preview-scaler-host--portrait" : ""
            }${thermalPreview ? " pdf-preview-scaler-host--thermal" : ""}`}
          >
            <div
              className="pdf-preview-frame-wrap"
              style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
            >
              <iframe
                ref={iframeRef}
                title={title}
                src={pdfUrl}
                className="pdf-preview-iframe"
              />
            </div>
          </div>
        )}
        {!loading && !pdfUrl && !error && (
          <p className="text-center text-muted text-sm py-16">Tidak ada PDF untuk ditampilkan.</p>
        )}
      </main>
    </div>
  );
}
