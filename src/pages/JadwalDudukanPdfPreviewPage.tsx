import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { PdfPreviewView } from "../components/pdf/PdfPreviewView";
import { isPemasihPrintKlasifikasi } from "../lib/pemasih-print";
import { generateJadwalDudukanPdf, jadwalDudukanPdfFilename } from "../lib/jadwal-dudukan-pdf";
import { buildJadwalDudukanData } from "../lib/services/jadwal-dudukan";

export function JadwalDudukanPdfPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navState = location.state as { backTo?: string; backLabel?: string } | null;
  const [loadError, setLoadError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [title, setTitle] = useState("Kartu Dudukan");
  const [subtitle, setSubtitle] = useState<string | undefined>();
  const [genKey, setGenKey] = useState(0);
  const blobUrlRef = useRef<string | null>(null);

  const buildPdf = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setPdfError("");
    if (blobUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPdfUrl(null);

    try {
      const data = await buildJadwalDudukanData(id);
      if (!data) {
        setLoadError("Data pemasih tidak ditemukan.");
        return;
      }
      if (!isPemasihPrintKlasifikasi(data.krama.klasifikasi_kode)) {
        setLoadError("Jadwal dudukan hanya untuk Krama Tamiu atau Tamiu.");
        return;
      }
      setLoadError("");
      setTitle(`Kartu Dudukan — ${data.detail.kepala_nama}`);
      setSubtitle(`${data.detail.nomor_kartu} · ${data.cardTitle} · F4 portrait`);
      setFilename(jadwalDudukanPdfFilename(data));

      const bytes = await generateJadwalDudukanPdf(data);
      const copy = new Uint8Array(bytes);
      const blob = new Blob([copy], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setPdfUrl(url);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void buildPdf();
  }, [buildPdf, genKey]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  return (
    <PdfPreviewView
      title={title}
      subtitle={subtitle}
      filename={filename}
      pdfUrl={pdfUrl}
      loading={loading && !loadError}
      error={loadError || pdfError}
      backTo={navState?.backTo ?? (id ? `/krama-pemasih/${id}` : "/krama-pemasih")}
      backLabel={navState?.backLabel ?? "Kembali ke Pemasih"}
      onRetry={() => setGenKey((k) => k + 1)}
      portrait
    />
  );
}
