import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useSearchParams } from "react-router-dom";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  buildRekapPenerimaanDudukanPdfInput,
  buildRekapPenerimaanDudukanTransaksiPdfInput,
  buildRekapPenerimaanDudukanPetugasPdfInput,
} from "../../lib/laporan-rekap-penerimaan-dudukan-pdf";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  buildRekapPenerimaanDudukanTableRows,
  buildRekapPenerimaanDudukanTransaksiTableRows,
  buildRekapPenerimaanDudukanPetugasTableRows,
  formatBanjarLaporanNama,
  formatBanjarSubtotalLaporan,
  formatJenisSubtotalLaporan,
  formatKlasifikasiSubtotalLaporan,
  formatPeriodeTransaksiDudukan,
  formatRekapPetugasDudukanTipeLabel,
  getRekapPenerimaanDudukan,
  getRekapPenerimaanDudukanTransaksi,
  getRekapPenerimaanDudukanPetugas,
  REKAP_PETUGAS_TIPE_ORDER,
  type RekapPenerimaanDudukan,
  type RekapPenerimaanDudukanMode,
  type RekapPenerimaanDudukanTableRow,
  type RekapPenerimaanDudukanTransaksi,
  type RekapPenerimaanDudukanTransaksiTableRow,
  type RekapPenerimaanDudukanPetugas,
  type RekapPenerimaanDudukanPetugasTableRow,
  type RekapPetugasDudukanTipe,
} from "../../lib/services/laporan-rekap-penerimaan-dudukan";
import { listRtBtnPemasih } from "../../lib/services/krama";
import { listBanjar } from "../../lib/services/master";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { DateInput } from "../../components/ui/DateInput";
import { Label, Select } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import { ListPagination } from "../../components/ui/ListPagination";
import {
  LAPORAN_BODY_ROW,
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { ArrowLeft, Filter, HandCoins, RotateCcw } from "lucide-react";

const TX_COLS = 7;
const PETUGAS_COLS = 3;

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function fmtKolomRupiah(n: number): string {
  return n > 0 ? formatRupiah(n) : "—";
}

function exportSlug(dari: string, sampai: string): string {
  return dari && sampai
    ? `${dari}_${sampai}`
    : dari
      ? `dari-${dari}`
      : sampai
        ? `sampai-${sampai}`
        : "semua";
}

function parseMode(value: string | null): RekapPenerimaanDudukanMode {
  if (value === "transaksi") return "perTransaksi";
  if (value === "petugas") return "perPetugas";
  return "perBulan";
}

function exportLabelBulan(row: RekapPenerimaanDudukanTableRow): string {
  switch (row.kind) {
    case "banjar-header":
      return formatBanjarLaporanNama(row.banjar_nama);
    case "klasifikasi-header":
      return row.klasifikasi_nama;
    case "detail":
      return `  ${row.label}`;
    case "klasifikasi-subtotal":
      return formatKlasifikasiSubtotalLaporan(row.klasifikasi_nama);
    case "banjar-subtotal":
      return formatBanjarSubtotalLaporan(row.banjar_nama);
    case "grand-total":
      return "JUMLAH KESELURUHAN";
  }
}

function buildExportRowsBulan(rekap: RekapPenerimaanDudukan): (string | number)[][] {
  return buildRekapPenerimaanDudukanTableRows(rekap).map((row) => {
    const label = exportLabelBulan(row);
    if (row.kind === "banjar-header" || row.kind === "klasifikasi-header") {
      return [label, ...rekap.bulan.map(() => ""), ""];
    }
    return [label, ...rekap.bulan.map((bk) => row.perBulan[bk] ?? 0), row.total];
  });
}

function buildExportRowsTransaksi(rekap: RekapPenerimaanDudukanTransaksi): (string | number)[][] {
  let no = 0;
  return buildRekapPenerimaanDudukanTransaksiTableRows(rekap).map((row) => {
    switch (row.kind) {
      case "banjar-header":
        return [formatBanjarLaporanNama(row.banjar_nama), "", "", "", "", "", ""];
      case "klasifikasi-header":
        return [row.klasifikasi_nama, "", "", "", "", "", ""];
      case "jenis-header":
        return [row.jenis_nama, "", "", "", "", "", ""];
      case "transaksi":
        no += 1;
        return [
          no,
          formatTanggalLahir(row.row.tanggal),
          row.row.nomor_kartu,
          row.row.kepala_nama,
          formatPeriodeTransaksiDudukan(row.row.bulan, row.row.tahun),
          row.row.jumlah,
          row.row.keringanan > 0 ? row.row.keringanan : "",
        ];
      case "jenis-subtotal":
        return [formatJenisSubtotalLaporan(row.jenis_nama), "", "", "", "", row.total, ""];
      case "klasifikasi-subtotal":
        return [formatKlasifikasiSubtotalLaporan(row.klasifikasi_nama), "", "", "", "", row.total, ""];
      case "banjar-subtotal":
        return [formatBanjarSubtotalLaporan(row.banjar_nama), "", "", "", "", row.total, ""];
      case "grand-total":
        return ["JUMLAH KESELURUHAN", "", "", "", "", row.total, ""];
    }
  });
}

function buildExportRowsPetugas(rekap: RekapPenerimaanDudukanPetugas): (string | number)[][] {
  return buildRekapPenerimaanDudukanPetugasTableRows(rekap).map((row) => {
    switch (row.kind) {
      case "banjar-header":
        return [formatTanggalLahir(row.tanggal), formatBanjarLaporanNama(row.banjar_nama), ""];
      case "tipe-header":
        return ["", row.label, ""];
      case "data":
        return [formatTanggalLahir(row.tanggal), row.uraian, row.jumlah];
      case "tipe-subtotal":
        return ["", row.label, row.total];
      case "banjar-subtotal":
        return ["", formatBanjarSubtotalLaporan(row.banjar_nama), row.total];
      case "tipe-grand-total":
        return ["", row.label, row.total];
      case "grand-total":
        return ["JUMLAH KESELURUHAN", "", row.total];
    }
  });
}

function parsePetugasTipe(value: string): RekapPetugasDudukanTipe | "" {
  if (value === "banjar" || value === "bantuan" || value === "kantor") return value;
  return "";
}

function colSpanBulan(rekap: RekapPenerimaanDudukan | null): number {
  return (rekap?.bulan.length ?? 1) + 2;
}

function GroupHeaderRow({
  colSpan,
  className,
  indent,
  children,
}: {
  colSpan: number;
  className?: string;
  indent?: string;
  children: ReactNode;
}) {
  return (
    <tr className={className}>
      <td colSpan={colSpan} className={cn("py-1 pr-3 font-medium text-copper-900", indent)}>
        {children}
      </td>
    </tr>
  );
}

const PAGE_ID = "laporan/rekap-penerimaan-dudukan";

export function LaporanRekapPenerimaanDudukanPage() {
  const isPhone = useIsPhoneClient();
  const [searchParams] = useSearchParams();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Rekap Penerimaan Dudukan");
  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [mode, setMode] = usePersistedScalar<RekapPenerimaanDudukanMode>(
    PAGE_ID,
    "mode",
    parseMode(searchParams.get("mode"))
  );
  const [rekapBulan, setRekapBulan] = useState<RekapPenerimaanDudukan | null>(null);
  const [rekapTransaksi, setRekapTransaksi] = useState<RekapPenerimaanDudukanTransaksi | null>(
    null
  );
  const [rekapPetugas, setRekapPetugas] = useState<RekapPenerimaanDudukanPetugas | null>(null);
  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");
  const [petugasTipe, setPetugasTipe] = usePersistedScalar(PAGE_ID, "petugasTipe", "");
  const [pageTransaksi, setPageTransaksi] = useState(1);
  const [pageSizeTransaksi, setPageSizeTransaksi] = useState(LIST_PAGE_SIZE);
  const [pagePetugas, setPagePetugas] = useState(1);
  const [pageSizePetugas, setPageSizePetugas] = useState(LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listBanjar().then(setBanjar);
  }, []);

  useEffect(() => {
    listRtBtnPemasih({ banjarId: banjarId || undefined, statusKrama: "aktif" }).then(
      setRtBtnOptions
    );
  }, [banjarId]);

  const selectedBanjarNama = useMemo(
    () => banjar.find((b) => b.id === banjarId)?.nama ?? "",
    [banjar, banjarId]
  );

  const load = useCallback(async () => {
    setPageTransaksi(1);
    setPagePetugas(1);
    setLoading(true);
    setError("");
    try {
      const params = { dari: dari || undefined, sampai: sampai || undefined };
      if (mode === "perTransaksi") {
        setRekapBulan(null);
        setRekapPetugas(null);
        setRekapTransaksi(await getRekapPenerimaanDudukanTransaksi(params));
      } else if (mode === "perPetugas") {
        setRekapBulan(null);
        setRekapTransaksi(null);
        setRekapPetugas(
          await getRekapPenerimaanDudukanPetugas({
            ...params,
            banjarId: banjarId || undefined,
            rtBtn: rtBtn || undefined,
            tipe: parsePetugasTipe(petugasTipe),
          })
        );
      } else {
        setRekapTransaksi(null);
        setRekapPetugas(null);
        setRekapBulan(await getRekapPenerimaanDudukan(params));
      }
    } catch (e) {
      setError(String(e));
      setRekapBulan(null);
      setRekapTransaksi(null);
      setRekapPetugas(null);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai, mode, banjarId, rtBtn, petugasTipe]);

  useEffect(() => {
    void load();
  }, [load]);

  const tableRowsBulan = useMemo(
    () => (rekapBulan ? buildRekapPenerimaanDudukanTableRows(rekapBulan) : []),
    [rekapBulan]
  );
  const tableRowsTransaksi = useMemo(
    () => (rekapTransaksi ? buildRekapPenerimaanDudukanTransaksiTableRows(rekapTransaksi) : []),
    [rekapTransaksi]
  );
  const tableRowsPetugas = useMemo(
    () => (rekapPetugas ? buildRekapPenerimaanDudukanPetugasTableRows(rekapPetugas) : []),
    [rekapPetugas]
  );

  const transaksiBodyRows = useMemo(
    () => tableRowsTransaksi.filter((r) => r.kind !== "grand-total"),
    [tableRowsTransaksi]
  );
  const transaksiGrandTotal = useMemo(
    () => tableRowsTransaksi.find((r) => r.kind === "grand-total") ?? null,
    [tableRowsTransaksi]
  );
  const petugasBodyRows = useMemo(
    () =>
      tableRowsPetugas.filter(
        (r) => r.kind !== "grand-total" && r.kind !== "tipe-grand-total"
      ),
    [tableRowsPetugas]
  );
  const petugasFooterRows = useMemo(
    () =>
      tableRowsPetugas.filter(
        (r) => r.kind === "tipe-grand-total" || r.kind === "grand-total"
      ),
    [tableRowsPetugas]
  );

  const selectedPetugasTipe = useMemo(
    () => parsePetugasTipe(petugasTipe),
    [petugasTipe]
  );

  const safePageTransaksi = useMemo(
    () => clampPage(pageTransaksi, transaksiBodyRows.length, pageSizeTransaksi),
    [pageTransaksi, transaksiBodyRows.length, pageSizeTransaksi]
  );
  const safePagePetugas = useMemo(
    () => clampPage(pagePetugas, petugasBodyRows.length, pageSizePetugas),
    [pagePetugas, petugasBodyRows.length, pageSizePetugas]
  );

  const pagedTransaksiRows = useMemo(
    () => paginateSlice(transaksiBodyRows, safePageTransaksi, pageSizeTransaksi),
    [transaksiBodyRows, safePageTransaksi, pageSizeTransaksi]
  );
  const pagedPetugasRows = useMemo(
    () => paginateSlice(petugasBodyRows, safePagePetugas, pageSizePetugas),
    [petugasBodyRows, safePagePetugas, pageSizePetugas]
  );

  const transaksiNomorOffset = useMemo(() => {
    const start = (safePageTransaksi - 1) * pageSizeTransaksi;
    return transaksiBodyRows
      .slice(0, start)
      .filter((r) => r.kind === "transaksi").length;
  }, [transaksiBodyRows, safePageTransaksi, pageSizeTransaksi]);

  useEffect(() => {
    if (pageTransaksi !== safePageTransaksi) setPageTransaksi(safePageTransaksi);
  }, [pageTransaksi, safePageTransaksi]);

  useEffect(() => {
    if (pagePetugas !== safePagePetugas) setPagePetugas(safePagePetugas);
  }, [pagePetugas, safePagePetugas]);

  const hasData =
    mode === "perBulan"
      ? (rekapBulan?.grandTotal ?? 0) > 0
      : mode === "perTransaksi"
        ? (rekapTransaksi?.grandTotal ?? 0) > 0
        : (rekapPetugas?.grandTotal ?? 0) > 0;

  function resetFilter() {
    clearPagePersistedState(PAGE_ID);
    setDari("");
    setSampai("");
    if (mode === "perPetugas") {
      setBanjarId("");
      setRtBtn("");
      setPetugasTipe("");
    }
  }

  async function exportExcel() {
    const slug = exportSlug(dari, sampai);
    if (mode === "perTransaksi" && rekapTransaksi) {
      await downloadExcel(`rekap-penerimaan-dudukan-transaksi-${slug}`, {
        name: "Per Transaksi",
        headers: ["No", "Tanggal", "No. Pemasih", "Pengajeg", "Periode", "Jumlah", "Keringanan"],
        rows: buildExportRowsTransaksi(rekapTransaksi),
      });
      return;
    }
    if (mode === "perPetugas" && rekapPetugas) {
      await downloadExcel(`rekap-penerimaan-dudukan-petugas-${slug}`, {
        name: "Per Petugas",
        headers: ["Tanggal", "Uraian", "Jumlah"],
        rows: buildExportRowsPetugas(rekapPetugas),
      });
      return;
    }
    if (rekapBulan) {
      await downloadExcel(`rekap-penerimaan-dudukan-${slug}`, {
        name: "Per Bulan Bayar",
        headers: ["Banjar / Rincian", ...rekapBulan.bulanLabel, "Total"],
        rows: buildExportRowsBulan(rekapBulan),
        landscape: true,
      });
    }
  }

  function exportPdf() {
    if (!hasData) return;
    if (mode === "perTransaksi" && rekapTransaksi) {
      openPdfPreview(buildRekapPenerimaanDudukanTransaksiPdfInput(rekapTransaksi, { dari, sampai }));
      return;
    }
    if (mode === "perPetugas" && rekapPetugas) {
      openPdfPreview(
        buildRekapPenerimaanDudukanPetugasPdfInput(rekapPetugas, {
          dari,
          sampai,
          banjarNama: selectedBanjarNama || undefined,
          rtBtn: rtBtn || undefined,
          tipeLabel: selectedPetugasTipe
            ? formatRekapPetugasDudukanTipeLabel(selectedPetugasTipe)
            : undefined,
        })
      );
      return;
    }
    if (rekapBulan) {
      openPdfPreview(buildRekapPenerimaanDudukanPdfInput(rekapBulan, { dari, sampai }));
    }
  }

  function renderAmountCellsBulan(
    row: Extract<RekapPenerimaanDudukanTableRow, { perBulan: Record<string, number>; total: number }>,
    rekap: RekapPenerimaanDudukan
  ) {
    return (
      <>
        {rekap.bulan.map((bk) => (
          <td key={bk} className="pr-3 py-1 text-right tabular-nums">
            {fmtKolomRupiah(row.perBulan[bk] ?? 0)}
          </td>
        ))}
        <td className="py-1 text-right tabular-nums">
          {row.kind === "grand-total" || row.kind === "banjar-subtotal"
            ? formatRupiah(row.total)
            : fmtKolomRupiah(row.total)}
        </td>
      </>
    );
  }

  function renderTransaksiRow(
    row: RekapPenerimaanDudukanTransaksiTableRow,
    idx: number,
    nomorUrut: number | null
  ) {
    if (row.kind === "banjar-header") {
      return (
        <GroupHeaderRow
          key={`bh-${idx}`}
          colSpan={TX_COLS}
          className="bg-copper-100/60 font-semibold text-copper-950 py-1.5"
        >
          {formatBanjarLaporanNama(row.banjar_nama)}
        </GroupHeaderRow>
      );
    }
    if (row.kind === "klasifikasi-header") {
      return (
        <GroupHeaderRow key={`kh-${idx}`} colSpan={TX_COLS} className="bg-copper-50/80 pl-3" indent="pl-3">
          {row.klasifikasi_nama}
        </GroupHeaderRow>
      );
    }
    if (row.kind === "jenis-header") {
      return (
        <GroupHeaderRow key={`jh-${idx}`} colSpan={TX_COLS} className="bg-copper-50/40 pl-5" indent="pl-5">
          {row.jenis_nama}
        </GroupHeaderRow>
      );
    }
    if (row.kind === "transaksi") {
      return (
        <tr key={`tx-${idx}`} className={LAPORAN_BODY_ROW}>
          <td className="pr-3 py-1 text-right tabular-nums">{nomorUrut}</td>
          <td className="pr-3 py-1 tabular-nums whitespace-nowrap text-center">
            {formatTanggalLahir(row.row.tanggal)}
          </td>
          <td className="pr-3 py-1 font-mono text-[11px]">{row.row.nomor_kartu}</td>
          <td className="pr-3 py-1 truncate" title={row.row.kepala_nama}>
            {row.row.kepala_nama}
          </td>
          <td className="pr-3 py-1 whitespace-nowrap">
            {formatPeriodeTransaksiDudukan(row.row.bulan, row.row.tahun)}
          </td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.row.jumlah)}</td>
          <td className="py-1 text-right tabular-nums">{fmtKolomRupiah(row.row.keringanan)}</td>
        </tr>
      );
    }
    if (row.kind === "jenis-subtotal") {
      return (
        <tr key={`js-${idx}`} className="border-t border-copper-50 bg-copper-50/30 font-medium text-copper-900">
          <td className="pr-3 py-1 pl-5" colSpan={5}>
            {formatJenisSubtotalLaporan(row.jenis_nama)}
          </td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
          <td className="py-1" />
        </tr>
      );
    }
    if (row.kind === "klasifikasi-subtotal") {
      return (
        <tr
          key={`ks-${idx}`}
          className="border-t border-copper-100 bg-copper-50/50 font-semibold text-copper-900"
        >
          <td className="pr-3 py-1 pl-4" colSpan={5}>
            {formatKlasifikasiSubtotalLaporan(row.klasifikasi_nama)}
          </td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
          <td className="py-1" />
        </tr>
      );
    }
    if (row.kind === "banjar-subtotal") {
      return (
        <tr
          key={`bs-${idx}`}
          className="border-t border-copper-200 bg-copper-50/70 font-bold text-copper-950"
        >
          <td className="pr-3 py-1 pl-2" colSpan={5}>
            {formatBanjarSubtotalLaporan(row.banjar_nama)}
          </td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
          <td className="py-1" />
        </tr>
      );
    }
    return (
      <tr key={`gt-${idx}`} className="border-t-2 border-copper-300 bg-copper-100/70 font-semibold">
        <td className="pr-3 py-1" colSpan={5}>
          JUMLAH KESELURUHAN
        </td>
        <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
        <td className="py-1" />
      </tr>
    );
  }

  function renderPetugasRow(row: RekapPenerimaanDudukanPetugasTableRow, key: string) {
    if (row.kind === "banjar-header") {
      return (
        <GroupHeaderRow
          key={key}
          colSpan={PETUGAS_COLS}
          className="bg-copper-100/60 font-semibold text-copper-950 py-1.5"
        >
          <span className="tabular-nums mr-2">{formatTanggalLahir(row.tanggal)}</span>
          {formatBanjarLaporanNama(row.banjar_nama)}
        </GroupHeaderRow>
      );
    }
    if (row.kind === "tipe-header") {
      return (
        <GroupHeaderRow key={key} colSpan={PETUGAS_COLS} className="bg-copper-50/80" indent="pl-3">
          {row.label}
        </GroupHeaderRow>
      );
    }
    if (row.kind === "data") {
      return (
        <tr key={key} className={LAPORAN_BODY_ROW}>
          <td className="pr-3 py-1 tabular-nums whitespace-nowrap text-center">
            {formatTanggalLahir(row.tanggal)}
          </td>
          <td className="pr-3 py-1 pl-5">{row.uraian}</td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.jumlah)}</td>
        </tr>
      );
    }
    if (row.kind === "tipe-subtotal") {
      return (
        <tr
          key={key}
          className="border-t border-copper-100 bg-copper-50/50 font-semibold text-copper-900"
        >
          <td className="pr-3 py-1" />
          <td className="pr-3 py-1 pl-4">{row.label}</td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
        </tr>
      );
    }
    if (row.kind === "banjar-subtotal") {
      return (
        <tr
          key={key}
          className="border-t border-copper-200 bg-copper-50/70 font-bold text-copper-950"
        >
          <td className="pr-3 py-1" />
          <td className="pr-3 py-1 pl-2">{formatBanjarSubtotalLaporan(row.banjar_nama)}</td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
        </tr>
      );
    }
    if (row.kind === "tipe-grand-total") {
      return (
        <tr
          key={key}
          className="border-t border-copper-200 bg-copper-50/80 font-semibold text-copper-950"
        >
          <td className="pr-3 py-1" colSpan={2}>
            {row.label}
          </td>
          <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
        </tr>
      );
    }
    return (
      <tr key={key} className="border-t-2 border-copper-300 bg-copper-100/70 font-semibold">
        <td className="pr-3 py-1" colSpan={2}>
          JUMLAH KESELURUHAN
        </td>
        <td className="py-1 text-right tabular-nums">{formatRupiah(row.total)}</td>
      </tr>
    );
  }

  const cardTitle =
    mode === "perBulan"
      ? "Rekap per Bulan Bayar"
      : mode === "perTransaksi"
        ? "Rekap per Transaksi"
        : "Rekap per Petugas (Tim Banjar / Tim Bantuan)";

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <h2 className="text-xl font-bold flex items-center gap-1.5 mt-1">
            <HandCoins className="text-copper-700 shrink-0" size={22} />
            Rekap Penerimaan Dudukan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Realisasi pembayaran Krama Tamiu & Tamiu per banjar, klasifikasi, dan jenis — per bulan
            bayar, per transaksi, atau per petugas (tanggal × banjar × Tim Banjar / Tim Bantuan).
          </p>
        </div>
        <LaporanExportButtons
          onExcel={() => void exportExcel()}
          onPdf={exportPdf}
          excelDisabled={!hasData}
          pdfDisabled={!hasData}
        />
      </div>

      <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)} title="Filter">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-[11px]">Dari tanggal</Label>
            <DateInput value={dari} onChange={setDari} />
          </div>
          <div>
            <Label className="text-[11px]">Sampai tanggal</Label>
            <DateInput value={sampai} onChange={setSampai} />
          </div>
          <div className={cn(isPhone && "w-full")}>
            <Label className="text-[11px]">Tampilan</Label>
            <div
              className={cn(
                "flex rounded-md border border-copper-200 overflow-hidden",
                isPhone ? "min-h-11 flex-col sm:flex-row sm:min-h-0 sm:h-9" : "h-9"
              )}
            >
              <button
                type="button"
                className={cn(
                  "px-3 text-xs font-medium transition-colors flex-1",
                  isPhone && "min-h-11 py-2",
                  mode === "perBulan"
                    ? "bg-copper-700 text-white"
                    : "bg-white text-copper-800 hover:bg-copper-50"
                )}
                onClick={() => setMode("perBulan")}
              >
                Per bulan bayar
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 text-xs font-medium transition-colors border-l border-copper-200 flex-1",
                  isPhone && "min-h-11 py-2 border-l-0 border-t sm:border-l sm:border-t-0",
                  mode === "perTransaksi"
                    ? "bg-copper-700 text-white"
                    : "bg-white text-copper-800 hover:bg-copper-50"
                )}
                onClick={() => setMode("perTransaksi")}
              >
                Per transaksi
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 text-xs font-medium transition-colors border-l border-copper-200 flex-1",
                  isPhone && "min-h-11 py-2 border-l-0 border-t sm:border-l sm:border-t-0",
                  mode === "perPetugas"
                    ? "bg-copper-700 text-white"
                    : "bg-white text-copper-800 hover:bg-copper-50"
                )}
                onClick={() => setMode("perPetugas")}
              >
                Per petugas
              </button>
            </div>
          </div>
          {mode === "perPetugas" && (
            <>
              <div>
                <Label className="text-[11px]">Banjar</Label>
                <Select
                  className="h-9 text-xs"
                  value={banjarId}
                  onChange={(e) => {
                    setBanjarId(e.target.value);
                    setRtBtn("");
                  }}
                >
                  <option value="">Semua</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">RT/BTN</Label>
                <Select className="h-9 text-xs" value={rtBtn} onChange={(e) => setRtBtn(e.target.value)}>
                  <option value="">Semua</option>
                  {rtBtnOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Tipe petugas</Label>
                <Select
                  className="h-9 text-xs"
                  value={petugasTipe}
                  onChange={(e) => setPetugasTipe(e.target.value)}
                >
                  <option value="">Semua</option>
                  {REKAP_PETUGAS_TIPE_ORDER.map((tipe) => (
                    <option key={tipe} value={tipe}>
                      {formatRekapPetugasDudukanTipeLabel(tipe)}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <Button
            type="button"
            variant="primary"
            icon={Filter}
            className={cn("text-xs", isPhone ? "h-11" : "h-8")}
            onClick={() => void load()}
          >
            Terapkan
          </Button>
          <Button
            type="button"
            variant="ghost"
            icon={RotateCcw}
            className={cn("text-xs", isPhone ? "h-11" : "h-8")}
            onClick={resetFilter}
          >
            Reset
          </Button>
        </div>
      </Card>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <Card
        className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}
        title={cardTitle}
      >
        {mode === "perBulan" && rekapBulan && (
          <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
            <StatChip label="Banjar" value={String(rekapBulan.groups.length)} />
            <StatChip label="Jumlah" value={formatRupiah(rekapBulan.grandTotal)} />
            {dari && <StatChip label="Dari" value={formatTanggalLahir(dari)} />}
            {sampai && <StatChip label="Sampai" value={formatTanggalLahir(sampai)} />}
          </div>
        )}
        {mode === "perTransaksi" && rekapTransaksi && (
          <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
            <StatChip label="Banjar" value={String(rekapTransaksi.groups.length)} />
            <StatChip label="Transaksi" value={String(rekapTransaksi.transactionCount)} />
            <StatChip label="Jumlah" value={formatRupiah(rekapTransaksi.grandTotal)} />
            {dari && <StatChip label="Dari" value={formatTanggalLahir(dari)} />}
            {sampai && <StatChip label="Sampai" value={formatTanggalLahir(sampai)} />}
          </div>
        )}
        {mode === "perPetugas" && rekapPetugas && (
          <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
            <StatChip label="Baris" value={String(rekapPetugas.rowCount)} />
            <StatChip label="Jumlah" value={formatRupiah(rekapPetugas.grandTotal)} />
            {rekapPetugas.totalsByTipe.banjar > 0 && (
              <StatChip label="Tim Banjar" value={formatRupiah(rekapPetugas.totalsByTipe.banjar)} />
            )}
            {rekapPetugas.totalsByTipe.bantuan > 0 && (
              <StatChip
                label="Tim Bantuan"
                value={formatRupiah(rekapPetugas.totalsByTipe.bantuan)}
              />
            )}
            {rekapPetugas.totalsByTipe.kantor > 0 && (
              <StatChip
                label="Kantor"
                value={formatRupiah(rekapPetugas.totalsByTipe.kantor)}
              />
            )}
            {dari && <StatChip label="Dari" value={formatTanggalLahir(dari)} />}
            {sampai && <StatChip label="Sampai" value={formatTanggalLahir(sampai)} />}
            {selectedBanjarNama && (
              <StatChip label="Banjar" value={formatBanjarLaporanNama(selectedBanjarNama)} />
            )}
            {rtBtn && <StatChip label="RT/BTN" value={rtBtn} />}
            {selectedPetugasTipe && (
              <StatChip
                label="Tipe"
                value={formatRekapPetugasDudukanTipeLabel(selectedPetugasTipe)}
              />
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          {mode === "perBulan" ? (
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="pr-3 min-w-[11rem]">Banjar / Rincian</th>
                  {rekapBulan?.bulanLabel.map((label) => (
                    <th key={label} className="pr-3 text-right whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={colSpanBulan(rekapBulan)} className="py-4 text-center text-muted text-sm">
                      Memuat…
                    </td>
                  </tr>
                ) : !rekapBulan || rekapBulan.groups.length === 0 || !hasData ? (
                  <tr>
                    <td colSpan={colSpanBulan(rekapBulan)} className="py-4 text-center text-muted text-sm">
                      Belum ada penerimaan dudukan pada filter ini.
                    </td>
                  </tr>
                ) : (
                  tableRowsBulan.map((row, idx) => {
                    if (row.kind === "banjar-header") {
                      return (
                        <GroupHeaderRow
                          key={`bh-${idx}`}
                          colSpan={colSpanBulan(rekapBulan)}
                          className="bg-copper-100/60 font-semibold text-copper-950 py-1.5"
                        >
                          {formatBanjarLaporanNama(row.banjar_nama)}
                        </GroupHeaderRow>
                      );
                    }
                    if (row.kind === "klasifikasi-header") {
                      return (
                        <GroupHeaderRow key={`kh-${idx}`} colSpan={colSpanBulan(rekapBulan)} indent="pl-3">
                          {row.klasifikasi_nama}
                        </GroupHeaderRow>
                      );
                    }
                    if (row.kind === "detail") {
                      return (
                        <tr key={`d-${idx}`} className={LAPORAN_BODY_ROW}>
                          <td className="pr-3 py-1 pl-6 text-copper-800">{row.label}</td>
                          {renderAmountCellsBulan(row, rekapBulan)}
                        </tr>
                      );
                    }
                    if (row.kind === "klasifikasi-subtotal") {
                      return (
                        <tr
                          key={`ks-${idx}`}
                          className="border-t border-copper-100 bg-copper-50/50 font-semibold text-copper-900"
                        >
                          <td className="pr-3 py-1 pl-4">
                            {formatKlasifikasiSubtotalLaporan(row.klasifikasi_nama)}
                          </td>
                          {renderAmountCellsBulan(row, rekapBulan)}
                        </tr>
                      );
                    }
                    if (row.kind === "banjar-subtotal") {
                      return (
                        <tr
                          key={`bs-${idx}`}
                          className="border-t border-copper-200 bg-copper-50/70 font-bold text-copper-950"
                        >
                          <td className="pr-3 py-1 pl-2">
                            {formatBanjarSubtotalLaporan(row.banjar_nama)}
                          </td>
                          {renderAmountCellsBulan(row, rekapBulan)}
                        </tr>
                      );
                    }
                    return (
                      <tr
                        key={`gt-${idx}`}
                        className="border-t-2 border-copper-300 bg-copper-100/70 font-semibold"
                      >
                        <td className="pr-3 py-1">JUMLAH KESELURUHAN</td>
                        {renderAmountCellsBulan(row, rekapBulan)}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : mode === "perTransaksi" ? (
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="pr-3 text-right">No</th>
                  <th className="pr-3 whitespace-nowrap text-center">Tanggal</th>
                  <th className="pr-3">No. Pemasih</th>
                  <th className="pr-3 min-w-[8rem]">Pengajeg</th>
                  <th className="pr-3 whitespace-nowrap">Periode</th>
                  <th className="text-right">Jumlah</th>
                  <th className="text-right">Keringanan</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={TX_COLS} className="py-4 text-center text-muted text-sm">
                      Memuat…
                    </td>
                  </tr>
                ) : !rekapTransaksi || transaksiBodyRows.length === 0 || !hasData ? (
                  <tr>
                    <td colSpan={TX_COLS} className="py-4 text-center text-muted text-sm">
                      Belum ada penerimaan dudukan pada filter ini.
                    </td>
                  </tr>
                ) : (
                  (() => {
                    let nomorUrut = transaksiNomorOffset;
                    return (
                      <>
                        {pagedTransaksiRows.map((row, idx) => {
                          if (row.kind === "transaksi") nomorUrut += 1;
                          return renderTransaksiRow(
                            row,
                            idx,
                            row.kind === "transaksi" ? nomorUrut : null
                          );
                        })}
                        {transaksiGrandTotal && transaksiGrandTotal.kind === "grand-total" && (
                          <tr className="border-t-2 border-copper-300 bg-copper-100/70 font-semibold">
                            <td className="pr-3 py-1" colSpan={5}>
                              JUMLAH KESELURUHAN
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {formatRupiah(transaksiGrandTotal.total)}
                            </td>
                            <td className="py-1" />
                          </tr>
                        )}
                      </>
                    );
                  })()
                )}
              </tbody>
            </table>
          ) : (
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="pr-3 whitespace-nowrap text-center">Tanggal</th>
                  <th className="pr-3 min-w-[14rem]">Uraian</th>
                  <th className="text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={PETUGAS_COLS} className="py-4 text-center text-muted text-sm">
                      Memuat…
                    </td>
                  </tr>
                ) : !rekapPetugas || petugasBodyRows.length === 0 || !hasData ? (
                  <tr>
                    <td colSpan={PETUGAS_COLS} className="py-4 text-center text-muted text-sm">
                      Belum ada penerimaan dudukan pada filter ini.
                    </td>
                  </tr>
                ) : (
                  <>
                    {pagedPetugasRows.map((row, idx) => renderPetugasRow(row, `p-${idx}`))}
                    {petugasFooterRows.map((row, idx) => renderPetugasRow(row, `pf-${idx}`))}
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>
        {mode === "perTransaksi" && (
          <ListPagination
            page={safePageTransaksi}
            totalItems={transaksiBodyRows.length}
            pageSize={pageSizeTransaksi}
            onPageChange={setPageTransaksi}
            onPageSizeChange={setPageSizeTransaksi}
            compact
          />
        )}
        {mode === "perPetugas" && (
          <ListPagination
            page={safePagePetugas}
            totalItems={petugasBodyRows.length}
            pageSize={pageSizePetugas}
            onPageChange={setPagePetugas}
            onPageSizeChange={setPageSizePetugas}
            compact
          />
        )}
      </Card>
    </div>
  );
}
