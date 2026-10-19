import { useCallback, useEffect, useRef, useState } from "react";
import type { DesaAdat, KramaDetail } from "../../lib/types";
import {
  generateIlikitaPdfBytes,
  ilikitaPdfTitle,
  type IlikitaPdfDoc,
} from "../../lib/ilikita-pdf-jobs";
import "../../styles/pdf-preview.css";

/**
 * Pratinjau inline Pipil/Pemasih memakai bytes PDF yang sama dengan halaman cetak,
 * agar huruf dan layout identik dengan Pratinjau PDF.
 */
export function IlikitaPdfInlinePreview({
  doc,
  krama,
  desa,
  desaReady,
  tampilkanTtdBandesa,
}: {
  doc: IlikitaPdfDoc;
  krama: KramaDetail;
  desa: DesaAdat | null;
  /** true setelah fetch profil desa selesai (boleh null). */
  desaReady: boolean;
  tampilkanTtdBandesa: boolean;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [genKey, setGenKey] = useState(0);
  const blobUrlRef = useRef<string | null>(null);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const buildPdf = useCallback(async () => {
    if (!desaReady) return;
    setLoading(true);
    setError("");
    revokeBlob();
    setPdfUrl(null);

    try {
      const bytes = await generateIlikitaPdfBytes(doc, krama, desa, {
        tampilkanTtdBandesa,
      });
      const copy = new Uint8Array(bytes);
      const blob = new Blob([copy], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setPdfUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [doc, krama, desa, desaReady, tampilkanTtdBandesa, revokeBlob]);

  useEffect(() => {
    void buildPdf();
  }, [buildPdf, genKey]);

  useEffect(() => () => revokeBlob(), [revokeBlob]);

  const title = ilikitaPdfTitle(doc, krama);
  /** Chrome/Edge: sembunyikan sidebar thumbnail; FitH agar halaman mengisi lebar. */
  const iframeSrc = pdfUrl
    ? `${pdfUrl}#navpanes=0&view=FitH`
    : undefined;

  return (
    <div className="ilikita-pdf-inline space-y-2">
      {error && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            className="text-sm font-medium text-copper-800 underline"
            onClick={() => setGenKey((k) => k + 1)}
          >
            Coba lagi
          </button>
        </div>
      )}
      {loading && (
        <p className="text-center text-muted text-sm py-12">Membuat pratinjau PDF…</p>
      )}
      {!loading && iframeSrc && (
        <div className="pdf-preview-frame-wrap ilikita-pdf-inline-frame">
          <iframe title={title} src={iframeSrc} className="ilikita-pdf-inline-iframe" />
        </div>
      )}
      {!loading && !pdfUrl && !error && (
        <p className="text-center text-muted text-sm py-12">Tidak ada PDF untuk ditampilkan.</p>
      )}
    </div>
  );
}
