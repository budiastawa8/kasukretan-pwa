import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PdfPreviewView } from "../../components/pdf/PdfPreviewView";
import { buildBuktiSetoranDudukanPdfBytes } from "../../lib/bukti-setoran-dudukan-pdf";
import {
  buildBuktiSetoranPaturunanPdfBytes,
  formatBuktiSetoranPaturunanPeriode,
} from "../../lib/bukti-setoran-paturunan-pdf";
import { buildTunggakanDudukanPdfBytes } from "../../lib/tunggakan-dudukan-pdf";
import { pageSizePreviewLabel } from "../../lib/tunggakan-dudukan-pdf-options";
import { buildSuratPenagihanDudukanPdfBytes } from "../../lib/surat-penagihan-dudukan-pdf";
import { buildSuratKeteranganKramaPdfBytes } from "../../lib/surat-keterangan-krama-pdf";
import { buildSuratKeteranganPindahPdfBytes } from "../../lib/surat-keterangan-pindah-pdf";
import { buildSuratMautsahaAdatPdfBytes } from "../../lib/surat-keterangan-mautsaha-adat-pdf";
import {
  buildKwitansiIpmaPdfBytes,
  buildKwitansiIpmaFilename,
  suratPayloadHasKwitansi,
} from "../../lib/kwitansi-ipma-pdf";
import { buildLaporanPdfBytes } from "../../lib/laporan-pdf";
import { readLaporanPdfPreview } from "../../lib/laporan-pdf-preview";
import {
  generateJadwalDudukanPdfBatch,
  jadwalDudukanBatchPdfFilename,
} from "../../lib/jadwal-dudukan-pdf";
import { buildJadwalDudukanDataBatch } from "../../lib/services/jadwal-dudukan";
export function LaporanPdfPreviewPage() {
  const location = useLocation();
  const [previewState, setPreviewState] = useState(() => readLaporanPdfPreview());
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(!!previewState);
  const [pdfError, setPdfError] = useState("");
  const [genKey, setGenKey] = useState(0);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setPreviewState(readLaporanPdfPreview());
  }, [location.key]);

  const buildPdf = useCallback(async () => {
    if (!previewState) return;

    setLoading(true);
    setPdfError("");

    if (blobUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPdfUrl(null);

    try {
      const bytes =
        previewState.kind === "bukti-setoran-dudukan"
          ? await buildBuktiSetoranDudukanPdfBytes(previewState.buktiDudukan)
          : previewState.kind === "bukti-setoran-paturunan"
            ? await buildBuktiSetoranPaturunanPdfBytes(previewState.buktiPaturunan)
            : previewState.kind === "tunggakan-dudukan"
              ? await buildTunggakanDudukanPdfBytes(previewState.tunggakanDudukan)
              : previewState.kind === "surat-penagihan-dudukan"
                ? await buildSuratPenagihanDudukanPdfBytes(previewState.suratPenagihan)
                : previewState.kind === "surat-keterangan-krama"
                  ? await buildSuratKeteranganKramaPdfBytes(previewState.suratKeteranganKrama)
                  : previewState.kind === "surat-keterangan-pindah"
                    ? await buildSuratKeteranganPindahPdfBytes(previewState.suratKeteranganPindah)
                    : previewState.kind === "surat-mautsaha-adat"
                      ? await buildSuratMautsahaAdatPdfBytes(previewState.suratMautsahaAdat)
                      : previewState.kind === "kwitansi-ipma"
                        ? await buildKwitansiIpmaPdfBytes(previewState.kwitansiIpma)
                      : previewState.kind === "kartu-dudukan"
                      ? await (async () => {
                          const dataList = await buildJadwalDudukanDataBatch(
                            previewState.kramaIds
                          );
                          if (!dataList.length) {
                            throw new Error("Tidak ada data pemasih valid untuk dicetak.");
                          }
                          return generateJadwalDudukanPdfBatch(dataList);
                        })()
                      : await buildLaporanPdfBytes(previewState.input);

      const baseFilename =
        previewState.kind === "bukti-setoran-dudukan"
          ? previewState.buktiDudukan.filename
          : previewState.kind === "bukti-setoran-paturunan"
            ? previewState.buktiPaturunan.filename
            : previewState.kind === "tunggakan-dudukan"
              ? previewState.tunggakanDudukan.filename
              : previewState.kind === "surat-penagihan-dudukan"
                ? previewState.suratPenagihan.length === 1
                  ? previewState.suratPenagihan[0]!.filename
                  : `Surat-Penagihan-Dudukan-${previewState.suratPenagihan.length}-lembar`
                : previewState.kind === "surat-keterangan-krama"
                  ? previewState.suratKeteranganKrama.length === 1
                    ? previewState.suratKeteranganKrama[0]!.filename
                    : `Surat-Keterangan-Krama-${previewState.suratKeteranganKrama.length}-lembar`
                  : previewState.kind === "surat-keterangan-pindah"
                    ? previewState.suratKeteranganPindah.length === 1
                      ? previewState.suratKeteranganPindah[0]!.filename
                      : `Surat-Keterangan-Pindah-${previewState.suratKeteranganPindah.length}-lembar`
                    : previewState.kind === "surat-mautsaha-adat"
                      ? previewState.suratMautsahaAdat.length === 1
                        ? previewState.suratMautsahaAdat[0]!.filename
                        : `IPMA-${previewState.suratMautsahaAdat.length}-lembar`
                      : previewState.kind === "kwitansi-ipma"
                        ? previewState.kwitansiIpma.length === 1
                          ? buildKwitansiIpmaFilename(previewState.kwitansiIpma[0]!.surat)
                          : `Kwitansi-IPMA-${previewState.kwitansiIpma.length}-lembar`
                      : previewState.kind === "kartu-dudukan"
                      ? jadwalDudukanBatchPdfFilename(previewState.kramaIds.length)
                    : previewState.input.filename;

      if (!bytes) {
        setPdfError("Data tidak valid untuk dibuat PDF.");
        return;
      }

      const safeName = baseFilename.endsWith(".pdf") ? baseFilename : `${baseFilename}.pdf`;
      setFilename(safeName);
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
  }, [previewState]);

  useEffect(() => {
    if (!previewState) return;
    void buildPdf();
  }, [previewState, genKey, buildPdf]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  if (!previewState) {
    return <Navigate to="/laporan" replace />;
  }

  const title =
    previewState.kind === "bukti-setoran-dudukan"
      ? "Bukti Setoran Dudukan"
      : previewState.kind === "bukti-setoran-paturunan"
        ? "Penerimaan Setoran Paturunan"
        : previewState.kind === "tunggakan-dudukan"
          ? "Tunggakan Dudukan"
          : previewState.kind === "surat-penagihan-dudukan"
            ? "Surat Penagihan Dudukan"
            : previewState.kind === "surat-keterangan-krama"
              ? "Surat Keterangan Krama"
              : previewState.kind === "surat-keterangan-pindah"
                ? "Surat Keterangan Pindah"
                : previewState.kind === "surat-mautsaha-adat"
                  ? "ILIKITA Pemasih Mautsaha Adat"
                  : previewState.kind === "kwitansi-ipma"
                    ? "Kwitansi Biaya Administrasi IPMA"
                  : previewState.kind === "kartu-dudukan"
                  ? "Kartu Dudukan"
                : previewState.kind === "laporan"
                  ? previewState.input.judul
                  : "Pratinjau PDF";

  const subtitle =
    previewState.kind === "bukti-setoran-dudukan"
      ? `${previewState.buktiDudukan.slips.length} lembar · A4 portrait`
      : previewState.kind === "bukti-setoran-paturunan"
        ? [
            previewState.buktiPaturunan.slip.banjarNama,
            previewState.buktiPaturunan.slip.tempekNama,
            formatBuktiSetoranPaturunanPeriode(previewState.buktiPaturunan.slip),
            "A4 portrait",
          ].join(" · ")
        : previewState.kind === "tunggakan-dudukan"
          ? [
              previewState.tunggakanDudukan.banjarNama,
              `S/D ${previewState.tunggakanDudukan.sdLabel}`,
              pageSizePreviewLabel(previewState.tunggakanDudukan.options.pageSize),
            ].join(" · ")
          : previewState.kind === "surat-penagihan-dudukan"
            ? `${previewState.suratPenagihan.length} lembar · A4 portrait`
            : previewState.kind === "surat-keterangan-krama"
              ? `${previewState.suratKeteranganKrama.length} lembar · A4 portrait`
              : previewState.kind === "surat-keterangan-pindah"
                ? `${previewState.suratKeteranganPindah.length} lembar · A4 portrait`
                : previewState.kind === "surat-mautsaha-adat"
                  ? [
                      `${previewState.suratMautsahaAdat.length} lembar surat · A4 portrait · ${previewState.suratMautsahaAdat[0]?.surat.nomor_surat ?? ""}`,
                      previewState.suratMautsahaAdat.some(suratPayloadHasKwitansi)
                        ? "+ kwitansi biaya admin (halaman berikutnya)"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : previewState.kind === "kwitansi-ipma"
                    ? `${previewState.kwitansiIpma.length} lembar · A4 portrait · ${previewState.kwitansiIpma[0]?.surat.nomor_surat ?? ""}`
                  : previewState.kind === "kartu-dudukan"
                  ? `${previewState.kramaIds.length} pemasih · F4 portrait`
                : previewState.kind === "laporan"
                  ? [
              previewState.input.subjudul,
              previewState.input.periode,
              previewState.input.pageSize === "F4"
                ? previewState.input.orientation === "landscape"
                  ? "F4 landscape"
                  : "F4 portrait"
                : previewState.input.orientation === "landscape"
                  ? "A4 landscape"
                  : "A4 portrait",
            ]
              .filter(Boolean)
              .join(" · ")
                  : "";

  const isPortrait =
    previewState.kind === "laporan"
      ? previewState.input.orientation !== "landscape"
      : true;

  return (
    <PdfPreviewView
      title={title}
      subtitle={subtitle}
      filename={filename}
      pdfUrl={pdfUrl}
      loading={loading}
      error={pdfError}
      backTo={previewState.backTo}
      backLabel={previewState.backLabel}
      onRetry={() => setGenKey((k) => k + 1)}
      portrait={isPortrait}
    />
  );
}
