import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getKramaDetail } from "../lib/services/krama";
import { getDesaAdatWithMedia } from "../lib/services/desa";
import type { DesaAdat, KramaDetail } from "../lib/types";
import { PdfPreviewView } from "../components/pdf/PdfPreviewView";
import {
  expectedKlasifikasiForIlikita,
  generateIlikitaPdfBytes,
  ilikitaPdfFilename,
  ilikitaPdfTitle,
  type IlikitaPdfDoc,
} from "../lib/ilikita-pdf-jobs";

export function IlikitaPdfPreviewPage({ doc }: { doc: IlikitaPdfDoc }) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const ttdFromQuery = searchParams.get("ttd") === "1";
  const [krama, setKrama] = useState<KramaDetail | null>(null);
  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [genKey, setGenKey] = useState(0);
  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(ttdFromQuery);
  const [hasTtdImage, setHasTtdImage] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  const allowedCodes = expectedKlasifikasiForIlikita(doc);
  const backTo = doc === "pipil" ? `/krama-mipil/${id}` : `/krama-pemasih/${id}`;
  const backLabel = doc === "pipil" ? "Kembali ke Pipil" : "Kembali ke Pemasih";

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([getKramaDetail(id), getDesaAdatWithMedia()])
      .then(([k, d]) => {
        if (!k) {
          setLoadError("Data krama tidak ditemukan.");
          return;
        }
        if (!allowedCodes.includes(k.klasifikasi_kode)) {
          setLoadError(doc === "pipil" ? "Hanya untuk Pipil (Krama Mipil)." : "Hanya untuk Pemasih.");
          return;
        }
        setKrama(k);
        setDesa(d);
        const has = !!d?.bandesa_ttd_url?.trim()?.startsWith("data:image/");
        setHasTtdImage(has);
        if (!has) {
          setTampilkanTtdBandesa(false);
        } else if (ttdFromQuery) {
          setTampilkanTtdBandesa(true);
        }
        setLoadError("");
      })
      .catch((e) => setLoadError(String(e)));
  }, [id, doc, ttdFromQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const buildPdf = useCallback(async () => {
    if (!krama || !desa) return;
    setLoading(true);
    setPdfError("");
    if (blobUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPdfUrl(null);

    try {
      const bytes = await generateIlikitaPdfBytes(doc, krama, desa, {
        tampilkanTtdBandesa: hasTtdImage && tampilkanTtdBandesa,
      });
      setFilename(ilikitaPdfFilename(doc, krama));
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
  }, [krama, desa, doc, tampilkanTtdBandesa, hasTtdImage]);

  useEffect(() => {
    if (!krama || !desa) return;
    void buildPdf();
  }, [krama?.id, desa, doc, genKey, tampilkanTtdBandesa, hasTtdImage, buildPdf]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const title = krama ? ilikitaPdfTitle(doc, krama) : doc === "pipil" ? "Pipil" : "Pemasih";
  const subtitle = krama ? `${krama.nomor_kartu} · A4 landscape` : undefined;

  return (
    <PdfPreviewView
      title={title}
      subtitle={subtitle}
      filename={filename}
      pdfUrl={pdfUrl}
      loading={loading || (!krama && !loadError)}
      error={loadError || pdfError}
      backTo={backTo}
      backLabel={backLabel}
      onRetry={() => setGenKey((k) => k + 1)}
      extraToolbar={
        <div className="space-y-0.5">
          <label className="flex items-center gap-2 text-sm text-copper-900 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-copper-300"
              checked={tampilkanTtdBandesa}
              onChange={(e) => setTampilkanTtdBandesa(e.target.checked)}
              disabled={!hasTtdImage}
            />
            Tampilkan tanda tangan Bandesa
          </label>
          {!hasTtdImage && (
            <p className="text-[11px] text-copper-600">
              Unggah gambar TTD Bandesa di Master Data → Profil Desa Adat.
            </p>
          )}
        </div>
      }
    />
  );
}
