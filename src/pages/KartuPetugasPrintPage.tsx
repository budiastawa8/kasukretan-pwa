import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { PdfPreviewView } from "../components/pdf/PdfPreviewView";
import {
  kartuPetugasPdfFilename,
  generateKartuPetugasPdf,
  KARTU_PETUGAS_SIZE_LABEL,
} from "../lib/kartu-petugas-pdf";
import { formatNomorPengenalDisplay } from "../lib/penomoran-petugas";
import { getDesaAdatWithMedia } from "../lib/services/desa";
import { ensureTimKasukretanKartuFields } from "../lib/services/master";
import type { DesaAdat, TimKasukretan } from "../lib/types";

export function KartuPetugasPrintPage() {
  const { id } = useParams<{ id: string }>();
  const [tim, setTim] = useState<TimKasukretan | null>(null);
  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [genKey, setGenKey] = useState(0);
  const blobUrlRef = useRef<string | null>(null);

  const backTo = "/master";
  const backLabel = "Kembali ke Master";

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([ensureTimKasukretanKartuFields(id), getDesaAdatWithMedia()])
      .then(([t, d]) => {
        setTim(t);
        setDesa(d);
        setLoadError("");
      })
      .catch((e) => setLoadError(String(e)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const buildPdf = useCallback(async () => {
    if (!tim || !desa) return;
    setLoading(true);
    setPdfError("");
    if (blobUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPdfUrl(null);
    try {
      const bytes = await generateKartuPetugasPdf(tim, desa);
      setFilename(kartuPetugasPdfFilename(tim));
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
  }, [tim, desa]);

  useEffect(() => {
    if (!tim || !desa) return;
    void buildPdf();
  }, [tim, desa, genKey, buildPdf]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  if (loadError) {
    return (
      <PdfPreviewView
        title="Kartu Petugas Tim Kasukretan"
        filename=""
        pdfUrl={null}
        loading={false}
        error={loadError}
        backTo={backTo}
        backLabel={backLabel}
      />
    );
  }

  if (!tim || !desa) {
    return (
      <PdfPreviewView
        title="Kartu Petugas Tim Kasukretan"
        filename=""
        pdfUrl={null}
        loading
        error=""
        backTo={backTo}
        backLabel={backLabel}
      />
    );
  }

  return (
    <PdfPreviewView
      title="Kartu Petugas Tim Kasukretan"
      subtitle={`${formatNomorPengenalDisplay(tim.nomor_pengenal)} · ${tim.nama} · ${KARTU_PETUGAS_SIZE_LABEL}`}
      filename={filename}
      pdfUrl={pdfUrl}
      loading={loading}
      error={pdfError}
      backTo={backTo}
      backLabel={backLabel}
      onRetry={() => setGenKey((k) => k + 1)}
    />
  );
}
