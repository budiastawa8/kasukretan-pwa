import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { PdfPreviewView } from "../components/pdf/PdfPreviewView";
import { generateKartuPaturunanPdf, kartuPaturunanPdfFilename } from "../lib/kartu-paturunan-pdf";
import { buildKartuPaturunanData } from "../lib/services/kartu-paturunan";

export function KartuPaturunanPdfPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navState = location.state as { backTo?: string; backLabel?: string } | null;
  const [loadError, setLoadError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [title, setTitle] = useState("Kartu Paturunan");
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
      const data = await buildKartuPaturunanData(id);
      if (!data) {
        setLoadError("Data krama mipil tidak ditemukan.");
        return;
      }
      if (data.krama.klasifikasi_kode !== "MIPIL") {
        setLoadError("Kartu paturunan hanya untuk Krama Mipil.");
        return;
      }
      setLoadError("");
      setTitle(`Kartu Paturunan — ${data.krama.kepala.nama_lengkap}`);
      setSubtitle(`${data.krama.nomor_kartu} · ${data.cardTitle} · F4 portrait`);
      setFilename(kartuPaturunanPdfFilename(data));

      const bytes = await generateKartuPaturunanPdf(data);
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
      backTo={navState?.backTo ?? (id ? `/krama-mipil/${id}` : "/krama-mipil")}
      backLabel={navState?.backLabel ?? "Kembali ke Krama Mipil"}
      onRetry={() => setGenKey((k) => k + 1)}
      portrait
    />
  );
}
