import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Bluetooth, FileDown, Printer } from "lucide-react";
import { BackLink } from "../../components/ui/BackLink";
import { Button } from "../../components/ui/Button";
import {
  StrukThermalSheetDanaLain,
  StrukThermalSheetDudukan,
  StrukThermalSheetPaturunan,
  STRUK_THERMAL_WIDTH_DEFAULT,
} from "../../components/petugas/StrukThermalSheet";
import { downloadBytes } from "../../lib/download-bytes";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { readPetugasStrukPreview } from "../../lib/petugas-struk-preview";
import { labelJenisPenerimaanDanaLain } from "../../lib/services/penerimaan-dana-lain";
import { buildStrukThermalContent } from "../../lib/struk-thermal-content";
import { buildStrukDanaLainPdfBytes } from "../../lib/struk-pembayaran-dana-lain-pdf";
import {
  buildStrukDudukanPdfBytes,
  type StrukThermalWidthMm,
} from "../../lib/struk-pembayaran-dudukan-pdf";
import { buildStrukPaturunanPdfBytes } from "../../lib/struk-pembayaran-paturunan-pdf";
import { buildEscPosReceipt } from "../../lib/thermal-escpos";
import {
  getCachedPrinterName,
  isThermalBluetoothSupported,
  onPrinterConnectionChange,
  pairThermalPrinter,
  PrinterNotConfiguredError,
  printEscPosViaBluetooth,
  probePrinterReadiness,
  type PrinterReadiness,
} from "../../lib/thermal-bluetooth-print";
import { getDesaAdatWithMedia } from "../../lib/services/desa";
import type { DesaAdat } from "../../lib/types";
import { cn } from "../../lib/utils";

const PRINT_PAGE_STYLE_ID = "struk-thermal-print-page";

function applyPrintPageSize(widthMm: StrukThermalWidthMm): void {
  let el = document.getElementById(PRINT_PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = PRINT_PAGE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `@page { size: ${widthMm}mm auto; margin: 2mm 2mm 0; }`;
}

function clearPrintPageSize(): void {
  document.getElementById(PRINT_PAGE_STYLE_ID)?.remove();
}

function initialPrinterReadiness(): PrinterReadiness {
  if (!isThermalBluetoothSupported()) return { status: "unsupported" };
  const name = getCachedPrinterName();
  // Sementara hingga probe async: kalau ada nama tersimpan, anggap perlu dicek (bukan pasti ready).
  return name ? { status: "permission_lost", name } : { status: "never_paired" };
}

function printerHint(r: PrinterReadiness | null): { text: string; className: string } {
  if (!r || r.status === "unsupported") {
    return {
      text: "Bluetooth tidak tersedia — cetak lewat dialog browser (pakai Chrome di Android)",
      className: "text-amber-800",
    };
  }
  if (r.status === "ready") {
    return {
      text: `Printer tersimpan: ${r.name} — siap Cetak (tanpa pairing ulang)`,
      className: "text-emerald-800",
    };
  }
  if (r.status === "permission_lost") {
    return {
      text: r.name
        ? `Printer pernah dipakai (${r.name}) — izin browser hilang. Tap Printer sekali, lalu Cetak.`
        : "Izin Bluetooth browser hilang. Tap Printer sekali untuk menghubungkan lagi.",
      className: "text-amber-900",
    };
  }
  return {
    text: "Tap Printer sekali untuk memilih printer, lalu Cetak. Jangan hapus data situs agar tetap diingat.",
    className: "text-copper-800",
  };
}

export function PetugasStrukPreviewPage() {
  const [previewState] = useState(() => readPetugasStrukPreview());
  const [thermalWidthMm, setThermalWidthMm] = useState<StrukThermalWidthMm>(STRUK_THERMAL_WIDTH_DEFAULT);
  const [desaNama, setDesaNama] = useState("—");
  const [desaFull, setDesaFull] = useState<DesaAdat | null>(null);
  const [loadingDesa, setLoadingDesa] = useState(true);
  const [savingPdf, setSavingPdf] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusTone, setStatusTone] = useState<"ok" | "error" | "warn">("ok");
  const [printerLabel, setPrinterLabel] = useState<string | null>(() => getCachedPrinterName());
  const [printerReady, setPrinterReady] = useState<PrinterReadiness | null>(() =>
    initialPrinterReadiness()
  );
  const bluetoothReady = isThermalBluetoothSupported();

  function setStatus(msg: string, tone: "ok" | "error" | "warn" = "ok") {
    setStatusTone(tone);
    setStatusMsg(msg);
  }

  function applyReadiness(r: PrinterReadiness) {
    setPrinterReady(r);
    if (r.status === "ready") setPrinterLabel(r.name);
    else if (r.status === "permission_lost" && r.name) setPrinterLabel(r.name);
  }

  useEffect(() => {
    let cancelled = false;
    setLoadingDesa(true);
    getDesaAdatWithMedia()
      .then((d) => {
        if (cancelled) return;
        if (d) {
          setDesaNama(d.nama_desa_adat?.trim() || "—");
          setDesaFull(d);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingDesa(false);
      });
    return () => {
      cancelled = true;
      clearPrintPageSize();
    };
  }, []);

  useEffect(() => {
    if (!bluetoothReady) {
      setPrinterReady({ status: "unsupported" });
      return;
    }
    let cancelled = false;
    void probePrinterReadiness().then((r) => {
      if (cancelled) return;
      applyReadiness(r);
    });
    return () => {
      cancelled = true;
    };
  }, [bluetoothReady]);

  const busyRef = useRef(false);
  busyRef.current = printing || pairing;

  useEffect(() => {
    if (!bluetoothReady) return;
    return onPrinterConnectionChange((connected) => {
      if (!connected && !busyRef.current) {
        setStatus(
          "Printer terputus (mode hemat daya) — Cetak berikutnya akan menyambung otomatis",
          "warn"
        );
      }
    });
  }, [bluetoothReady]);

  const handleBrowserPrint = useCallback(() => {
    applyPrintPageSize(thermalWidthMm);
    window.print();
  }, [thermalWidthMm]);

  const handlePrint = useCallback(async () => {
    if (!previewState || loadingDesa) return;
    setStatusMsg("");

    const content = buildStrukThermalContent(previewState, desaNama);
    const escpos = buildEscPosReceipt(content, thermalWidthMm);

    if (bluetoothReady) {
      setPrinting(true);
      try {
        const result = await printEscPosViaBluetooth(escpos);
        setStatus(`Tercetak ke ${result.deviceName}`, "ok");
        setPrinterLabel(result.deviceName);
        applyReadiness({ status: "ready", name: result.deviceName });
        return;
      } catch (e) {
        if (e instanceof PrinterNotConfiguredError) {
          setStatus(e.message, "error");
          applyReadiness(
            e.kind === "permission_lost"
              ? { status: "permission_lost", name: getCachedPrinterName() }
              : { status: "never_paired" }
          );
          window.alert(e.message);
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(msg, "error");
        const retry = window.confirm(
          `${msg}\n\nCoba cetak lewat dialog browser sebagai cadangan?`
        );
        if (!retry) return;
      } finally {
        setPrinting(false);
      }
    }

    handleBrowserPrint();
  }, [previewState, desaNama, thermalWidthMm, bluetoothReady, loadingDesa, handleBrowserPrint]);

  const handlePairPrinter = useCallback(async () => {
    if (!bluetoothReady) {
      window.alert("Gunakan Chrome di Android (HTTPS) untuk menghubungkan printer Bluetooth.");
      return;
    }
    setPairing(true);
    setStatusMsg("");
    try {
      const name = await pairThermalPrinter();
      const label = name || getCachedPrinterName() || "Printer thermal";
      setPrinterLabel(label);
      applyReadiness({ status: "ready", name: label });
      setStatus(`Printer terhubung: ${label}`, "ok");
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotFoundError") return;
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg, "error");
      window.alert(msg);
    } finally {
      setPairing(false);
    }
  }, [bluetoothReady]);

  const handleSavePdf = useCallback(async () => {
    if (!previewState) return;
    setSavingPdf(true);
    try {
      const desa = desaFull;
      const bytes =
        previewState.kind === "dudukan"
          ? await buildStrukDudukanPdfBytes(previewState.payload, desa, {
              widthMm: thermalWidthMm,
            })
          : previewState.kind === "dana_lain"
            ? await buildStrukDanaLainPdfBytes(previewState.payload, desa)
            : await buildStrukPaturunanPdfBytes(previewState.payload, desa);

      const base = previewState.payload.filename;
      const suffix = previewState.kind === "dudukan" ? `-${thermalWidthMm}mm` : "";
      const name = base.endsWith(".pdf")
        ? base.replace(/\.pdf$/, `${suffix}.pdf`)
        : `${base}${suffix}.pdf`;
      await downloadBytes(bytes, name, "application/pdf");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPdf(false);
    }
  }, [previewState, desaFull, thermalWidthMm]);

  if (!previewState) {
    return <Navigate to="/pengumpulan" replace />;
  }

  const kramaNama =
    previewState.kind === "dudukan"
      ? previewState.payload.krama.pengajeg_nama
      : previewState.kind === "dana_lain"
        ? previewState.payload.sumberNama
        : previewState.payload.krama.kepala_nama;

  const title =
    previewState.kind === "dudukan"
      ? "Struk Pembayaran Dudukan"
      : previewState.kind === "dana_lain"
        ? `Struk ${labelJenisPenerimaanDanaLain(previewState.payload.jenis)}`
        : "Struk Pembayaran Paturunan";

  return (
    <div className="struk-cetak-page">
      <header className="struk-cetak-toolbar print:hidden">
        <BackLink to={previewState.backTo}>{previewState.backLabel}</BackLink>
        <div className="struk-cetak-toolbar__title">
          <h1>{title}</h1>
          <p>
            {kramaNama} · {formatRupiah(previewState.payload.total)}
          </p>
          {(() => {
            const hint = printerHint(bluetoothReady ? printerReady : { status: "unsupported" });
            return <p className={cn("text-[11px] mt-0.5 font-medium", hint.className)}>{hint.text}</p>;
          })()}
          {statusMsg ? (
            <p
              className={
                statusTone === "ok"
                  ? "text-[11px] text-emerald-700 mt-0.5 font-medium"
                  : statusTone === "warn"
                    ? "text-[11px] text-amber-800 mt-0.5 font-medium"
                    : "text-[11px] text-red-700 mt-0.5 font-medium"
              }
            >
              {statusMsg}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-copper-700">Kertas:</span>
          {([58, 80] as const).map((w) => (
            <Button
              key={w}
              type="button"
              variant={thermalWidthMm === w ? "primary" : "secondary"}
              className="h-8 px-2 text-xs"
              onClick={() => setThermalWidthMm(w)}
            >
              {w} mm
            </Button>
          ))}
          {bluetoothReady && (
            <Button
              type="button"
              variant={printerReady?.status === "permission_lost" ? "primary" : "secondary"}
              icon={Bluetooth}
              className="h-8 px-2 text-xs"
              disabled={pairing || printing}
              onClick={() => void handlePairPrinter()}
              title={printerLabel ? `Printer: ${printerLabel}` : "Pilih printer Bluetooth"}
            >
              {pairing
                ? "Menghubungkan…"
                : printerReady?.status === "permission_lost"
                  ? "Hubungkan ulang"
                  : printerReady?.status === "ready"
                    ? "Ganti printer"
                    : "Printer"}
            </Button>
          )}
          <Button
            type="button"
            icon={Printer}
            onClick={() => void handlePrint()}
            disabled={loadingDesa || printing}
          >
            {printing ? "Mencetak…" : "Cetak"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={FileDown}
            disabled={loadingDesa || savingPdf}
            onClick={() => void handleSavePdf()}
          >
            {savingPdf ? "Menyimpan…" : "PDF"}
          </Button>
        </div>
      </header>

      <main className="struk-cetak-stage">
        {loadingDesa ? (
          <p className="text-sm text-muted print:hidden">Memuat data desa…</p>
        ) : previewState.kind === "dudukan" ? (
          <StrukThermalSheetDudukan
            desaNama={desaNama}
            payload={previewState.payload}
            widthMm={thermalWidthMm}
          />
        ) : previewState.kind === "dana_lain" ? (
          <StrukThermalSheetDanaLain
            desaNama={desaNama}
            payload={previewState.payload}
            widthMm={thermalWidthMm}
          />
        ) : (
          <StrukThermalSheetPaturunan
            desaNama={desaNama}
            payload={previewState.payload}
            widthMm={thermalWidthMm}
          />
        )}
      </main>
    </div>
  );
}
