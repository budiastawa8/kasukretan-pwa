import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getKramaDetail } from "../lib/services/krama";
import { getDesaAdat } from "../lib/services/desa";
import type { DesaAdat, KramaDetail } from "../lib/types";
import { PdfPreviewView } from "../components/pdf/PdfPreviewView";
import { kartuA4PageCount, KARTU_A4_GRID } from "../lib/kartu-a4-grid";
import {
  expectedKlasifikasiForKind,
  generateKartuPdfBytes,
  kartuPdfFilename,
  kartuPdfKindLabel,
  type KartuPdfKind,
} from "../lib/kartu-pdf-jobs";
export function KartuPdfPreviewPage({ kind }: { kind: KartuPdfKind }) {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const anggotaFilter = searchParams.get("anggota");
  const [krama, setKrama] = useState<KramaDetail | null>(null);
  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [loadError, setLoadError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [genKey, setGenKey] = useState(0);
  const blobUrlRef = useRef<string | null>(null);

  const expectedKode = expectedKlasifikasiForKind(kind);
  const backTo = expectedKode === "MIPIL" ? `/krama-mipil/${id}` : `/krama-pemasih/${id}`;
  const backLabel = expectedKode === "MIPIL" ? "Kembali ke Pipil" : "Kembali ke Pemasih";

  const load = useCallback(() => {
    if (!id) return;
    Promise.all([getKramaDetail(id), getDesaAdat()])
      .then(([k, d]) => {
        if (!k) {
          setLoadError("Data krama tidak ditemukan.");
          return;
        }
        if (k.klasifikasi_kode !== expectedKode) {
          setLoadError(`Halaman ini hanya untuk ${kartuPdfKindLabel(kind)}.`);
          return;
        }
        setKrama(k);
        setDesa(d);
        setLoadError("");
      })
      .catch((e) => setLoadError(String(e)));
  }, [id, expectedKode, kind]);

  useEffect(() => {
    load();
  }, [load]);

  const anggotaCetak = useMemo(() => {
    if (!krama) return [];
    const list = krama.anggota_aktif;
    if (!anggotaFilter) return list;
    const satu = list.filter((a) => a.anggota_id === anggotaFilter);
    return satu.length ? satu : list;
  }, [krama, anggotaFilter]);

  const anggotaKey = anggotaCetak.map((a) => a.anggota_id).join(",");

  const buildPdf = useCallback(async () => {
    if (!krama || !desa || !anggotaCetak.length) return;
    setLoading(true);
    setPdfError("");
    if (blobUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPdfUrl(null);

    try {
      const bytes = await generateKartuPdfBytes(kind, krama, desa, anggotaCetak);
      setFilename(kartuPdfFilename(kind, krama, anggotaCetak));
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
  }, [krama, desa, anggotaCetak, kind]);

  useEffect(() => {
    if (!krama || !desa || !anggotaCetak.length) return;
    void buildPdf();
  }, [krama?.id, desa, anggotaKey, kind, genKey, buildPdf]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const subtitle = useMemo(() => {
    if (!krama) return "";
    const n = anggotaCetak.length;
    const lembar = kartuA4PageCount(n);
    const jumlah =
      kind === "kartu-mipil" || kind === "kartu-krama-tamiu" || kind === "kartu-tamiu"
        ? n === 1
          ? `1 pasang kartu · 1 lembar A4`
          : `${n} pasang kartu · ${lembar} lembar A4 (${KARTU_A4_GRID.rows} pasang/lembar)`
        : n === 1
          ? "1 kartu"
          : `${n} kartu (satu halaman per anggota)`;
    return `${krama.nomor_kartu} · ${jumlah} · 8,5 × 5 cm`;
  }, [krama, anggotaCetak.length, kind]);

  if (loadError) {
    return (
      <PdfPreviewView
        title={kartuPdfKindLabel(kind)}
        filename=""
        pdfUrl={null}
        loading={false}
        error={loadError}
        backTo={backTo}
        backLabel={backLabel}
      />
    );
  }

  if (!krama || !desa) {
    return (
      <PdfPreviewView
        title={kartuPdfKindLabel(kind)}
        filename=""
        pdfUrl={null}
        loading
        error=""
        backTo={backTo}
        backLabel={backLabel}
      />
    );
  }

  if (!anggotaCetak.length) {
    return (
      <PdfPreviewView
        title={kartuPdfKindLabel(kind)}
        subtitle={krama.nomor_kartu}
        filename=""
        pdfUrl={null}
        loading={false}
        error="Tidak ada anggota aktif untuk dicetak."
        backTo={backTo}
        backLabel={backLabel}
      />
    );
  }

  return (
    <PdfPreviewView
      title={kartuPdfKindLabel(kind)}
      subtitle={subtitle}
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
