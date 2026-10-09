import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { buildLaporanPenerimaanPaturunanPdfInput } from "../../lib/laporan-penerimaan-paturunan-pdf";
import { buildRekapPenerimaanPaturunanBulanPdfInput } from "../../lib/laporan-rekap-penerimaan-paturunan-bulan-pdf";
import { buildRekapPenerimaanPaturunanPdfInput } from "../../lib/laporan-rekap-penerimaan-paturunan-pdf";
import { formatRupiah } from "../../lib/paturunan-hitung";
import {
  buildLaporanPenerimaanPaturunanTableRows,
  getLaporanPenerimaanPaturunan,
  type LaporanPenerimaanPaturunan,
  type LaporanPenerimaanPaturunanTableRow,
} from "../../lib/services/laporan-penerimaan-paturunan";
import {
  getRekapPenerimaanPaturunan,
  getRekapPenerimaanPaturunanPerBulan,
} from "../../lib/services/laporan-rekap-penerimaan-paturunan";
import type {
  RekapPenerimaanPaturunan,
  RekapPenerimaanPaturunanPerBulan,
} from "../../lib/services/laporan-rekap-penerimaan-paturunan";
import { listIuranPaturunan } from "../../lib/services/iuran-paturunan";
import { listArahan, listBanjar, listTempek } from "../../lib/services/master";
import type { Arahan, Banjar, IuranPaturunanRow, Tempek } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { DateInput } from "../../components/ui/DateInput";
import { Label, Select } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import { ListPagination } from "../../components/ui/ListPagination";
import {
  LIST_PAGE_SIZE,
  clampPage,
  paginateSlice,
} from "../../lib/pagination";
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
import { ArrowLeft, CalendarRange, Coins, Filter, LayoutGrid, RotateCcw, UserCircle } from "lucide-react";

type PageTab = "arahan" | "bulan" | "petugas";

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

type TableRow =
  | { kind: "data"; banjar: string; tempek: string; arahan: string; wajib: number; punia: number; jumlah: number; trx: number }
  | { kind: "subtotal"; label: string; wajib: number; punia: number; jumlah: number; trx: number; level: "tempek" | "banjar" | "total" };

function buildTableRows(rekap: RekapPenerimaanPaturunan): TableRow[] {
  const out: TableRow[] = [];
  for (const b of rekap.banjar) {
    for (const t of b.tempek) {
      for (const a of t.arahan) {
        out.push({
          kind: "data",
          banjar: b.banjar_nama,
          tempek: t.tempek_nama,
          arahan: a.arahan_nama,
          wajib: a.wajib,
          punia: a.punia,
          jumlah: a.jumlah,
          trx: a.transaksi,
        });
      }
      out.push({
        kind: "subtotal",
        label: `Jumlah Tempek ${t.tempek_nama}`,
        wajib: t.wajib,
        punia: t.punia,
        jumlah: t.jumlah,
        trx: t.transaksi,
        level: "tempek",
      });
    }
    out.push({
      kind: "subtotal",
      label: `Jumlah Banjar ${b.banjar_nama}`,
      wajib: b.wajib,
      punia: b.punia,
      jumlah: b.jumlah,
      trx: b.transaksi,
      level: "banjar",
    });
  }
  out.push({
    kind: "subtotal",
    label: "JUMLAH KESELURUHAN",
    wajib: rekap.total_wajib,
    punia: rekap.total_punia,
    jumlah: rekap.total_jumlah,
    trx: rekap.total_transaksi,
    level: "total",
  });
  return out;
}

function buildExportRowsPetugas(laporan: LaporanPenerimaanPaturunan): (string | number)[][] {
  return buildLaporanPenerimaanPaturunanTableRows(laporan).map((row) => {
    if (row.kind === "data") {
      return [formatTanggalLahir(row.tanggal), row.uraian, row.jumlah];
    }
    return ["JUMLAH KESELURUHAN", "", row.total];
  });
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

const PAGE_ID = "laporan/rekap-penerimaan-paturunan";

export function LaporanRekapPenerimaanPaturunanPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Rekap Penerimaan Paturunan");
  const [pageTab, setPageTab] = usePersistedScalar<PageTab>(PAGE_ID, "pageTab", "arahan");
  const [iuranList, setIuranList] = useState<IuranPaturunanRow[]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [arahan, setArahan] = useState<Arahan[]>([]);
  const [iuranId, setIuranId] = usePersistedScalar(PAGE_ID, "iuranId", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [tempekId, setTempekId] = usePersistedScalar(PAGE_ID, "tempekId", "");
  const [arahanId, setArahanId] = usePersistedScalar(PAGE_ID, "arahanId", "");
  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [rekap, setRekap] = useState<RekapPenerimaanPaturunan | null>(null);
  const [rekapBulan, setRekapBulan] = useState<RekapPenerimaanPaturunanPerBulan | null>(null);
  const [laporanPetugas, setLaporanPetugas] = useState<LaporanPenerimaanPaturunan | null>(null);
  const [pageArahan, setPageArahan] = useState(1);
  const [pageSizeArahan, setPageSizeArahan] = useState(LIST_PAGE_SIZE);
  const [pageBulan, setPageBulan] = useState(1);
  const [pageSizeBulan, setPageSizeBulan] = useState(LIST_PAGE_SIZE);
  const [pagePetugas, setPagePetugas] = useState(1);
  const [pageSizePetugas, setPageSizePetugas] = useState(LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const iuranNama = useMemo(
    () => iuranList.find((i) => i.id === iuranId)?.nama ?? "",
    [iuranList, iuranId]
  );
  const selectedBanjarNama = useMemo(
    () => banjar.find((b) => b.id === banjarId)?.nama ?? "",
    [banjar, banjarId]
  );
  const selectedTempekNama = useMemo(
    () => tempek.find((t) => t.id === tempekId)?.nama ?? "",
    [tempek, tempekId]
  );
  const selectedArahanNama = useMemo(
    () => arahan.find((a) => a.id === arahanId)?.nama ?? "",
    [arahan, arahanId]
  );

  const tableRows = useMemo(
    () => (rekap ? buildTableRows(rekap) : []),
    [rekap]
  );
  const tableRowsPetugas = useMemo(
    () => (laporanPetugas ? buildLaporanPenerimaanPaturunanTableRows(laporanPetugas) : []),
    [laporanPetugas]
  );

  const arahanBodyRows = useMemo(
    () => tableRows.filter((r) => !(r.kind === "subtotal" && r.level === "total")),
    [tableRows]
  );
  const arahanGrandTotal = useMemo(
    () => tableRows.find((r) => r.kind === "subtotal" && r.level === "total") ?? null,
    [tableRows]
  );
  const petugasDataRows = useMemo(
    () => tableRowsPetugas.filter((r) => r.kind === "data"),
    [tableRowsPetugas]
  );
  const petugasGrandTotal = useMemo(
    () => tableRowsPetugas.find((r) => r.kind === "grand-total") ?? null,
    [tableRowsPetugas]
  );

  const safePageArahan = useMemo(
    () => clampPage(pageArahan, arahanBodyRows.length, pageSizeArahan),
    [pageArahan, arahanBodyRows.length, pageSizeArahan]
  );
  const safePageBulan = useMemo(
    () => clampPage(pageBulan, rekapBulan?.rows.length ?? 0, pageSizeBulan),
    [pageBulan, rekapBulan?.rows.length, pageSizeBulan]
  );
  const safePagePetugas = useMemo(
    () => clampPage(pagePetugas, petugasDataRows.length, pageSizePetugas),
    [pagePetugas, petugasDataRows.length, pageSizePetugas]
  );

  const pagedArahanRows = useMemo(
    () => paginateSlice(arahanBodyRows, safePageArahan, pageSizeArahan),
    [arahanBodyRows, safePageArahan, pageSizeArahan]
  );
  const pagedBulanRows = useMemo(
    () => paginateSlice(rekapBulan?.rows ?? [], safePageBulan, pageSizeBulan),
    [rekapBulan?.rows, safePageBulan, pageSizeBulan]
  );
  const pagedPetugasRows = useMemo(
    () => paginateSlice(petugasDataRows, safePagePetugas, pageSizePetugas),
    [petugasDataRows, safePagePetugas, pageSizePetugas]
  );

  useEffect(() => {
    if (pageArahan !== safePageArahan) setPageArahan(safePageArahan);
  }, [pageArahan, safePageArahan]);

  useEffect(() => {
    if (pageBulan !== safePageBulan) setPageBulan(safePageBulan);
  }, [pageBulan, safePageBulan]);

  useEffect(() => {
    if (pagePetugas !== safePagePetugas) setPagePetugas(safePagePetugas);
  }, [pagePetugas, safePagePetugas]);

  useEffect(() => {
    void listIuranPaturunan()
      .then(setIuranList)
      .catch((e) => setError(String(e)));
    listBanjar().then(setBanjar).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!banjarId) {
      setTempek([]);
      setTempekId("");
      return;
    }
    listTempek(banjarId).then(setTempek);
    setTempekId("");
  }, [banjarId]);

  useEffect(() => {
    if (!tempekId) {
      setArahan([]);
      setArahanId("");
      return;
    }
    listArahan(tempekId).then(setArahan);
    setArahanId("");
  }, [tempekId]);

  const load = useCallback(async () => {
    setPageArahan(1);
    setPageBulan(1);
    setPagePetugas(1);
    setLoading(true);
    setError("");
    const dateParams = { dari: dari || undefined, sampai: sampai || undefined };
    try {
      if (pageTab === "petugas") {
        setRekap(null);
        setRekapBulan(null);
        setLaporanPetugas(
          await getLaporanPenerimaanPaturunan({
            ...dateParams,
            banjarId: banjarId || undefined,
            tempekId: tempekId || undefined,
            arahanId: arahanId || undefined,
          })
        );
      } else {
        setLaporanPetugas(null);
        const params = { ...dateParams, iuranId: iuranId || undefined };
        const [dataArahan, dataBulan] = await Promise.all([
          getRekapPenerimaanPaturunan(params),
          getRekapPenerimaanPaturunanPerBulan(params),
        ]);
        setRekap(dataArahan);
        setRekapBulan(dataBulan);
      }
    } catch (e) {
      setError(String(e));
      setRekap(null);
      setRekapBulan(null);
      setLaporanPetugas(null);
    } finally {
      setLoading(false);
    }
  }, [pageTab, dari, sampai, iuranId, banjarId, tempekId, arahanId]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilter() {
    clearPagePersistedState(PAGE_ID);
    setDari("");
    setSampai("");
    setIuranId("");
    if (pageTab === "petugas") {
      setBanjarId("");
      setTempekId("");
      setArahanId("");
    }
  }

  const hasDataArahan = (rekap?.total_transaksi ?? 0) > 0;
  const hasDataBulan = (rekapBulan?.grandTotal ?? 0) > 0;
  const hasDataPetugas = (laporanPetugas?.grandTotal ?? 0) > 0;
  const hasData =
    pageTab === "arahan"
      ? hasDataArahan
      : pageTab === "bulan"
        ? hasDataBulan
        : hasDataPetugas;

  async function exportExcel() {
    const slug = exportSlug(dari, sampai);
    if (pageTab === "petugas") {
      if (!laporanPetugas || !hasDataPetugas) return;
      await downloadExcel(`rekap-penerimaan-paturunan-petugas-${slug}`, {
        name: "Per Tanggal · Tempek · Petugas",
        headers: ["Tanggal", "Uraian", "Jumlah"],
        rows: buildExportRowsPetugas(laporanPetugas),
      });
      return;
    }
    if (pageTab === "arahan") {
      if (!rekap) return;
      await downloadExcel(`rekap-penerimaan-paturunan-${slug}`, {
        name: "Rekap per Arahan",
        headers: ["Banjar", "Tempek", "Arahan", "Wajib", "Punia", "Jumlah", "Trx"],
        rows: tableRows.map((r) =>
          r.kind === "data"
            ? [r.banjar, r.tempek, r.arahan, r.wajib || "", r.punia || "", r.jumlah, r.trx || ""]
            : ["", "", r.label, r.wajib || "", r.punia || "", r.jumlah, r.trx || ""]
        ),
      });
      return;
    }
    if (!rekapBulan) return;
    await downloadExcel(`rekap-penerimaan-paturunan-bulan-${slug}`, {
      name: "Rekap per Bulan",
      headers: ["Banjar", "Tempek", ...rekapBulan.bulanLabel, "Total"],
      rows: [
        ...rekapBulan.rows.map((r) => [
          r.banjar_nama,
          r.tempek_nama,
          ...rekapBulan.bulan.map((bk) => r.perBulan[bk] || ""),
          r.total,
        ]),
        [
          "",
          "JUMLAH",
          ...rekapBulan.bulan.map((bk) => rekapBulan.totalPerBulan[bk] || ""),
          rekapBulan.grandTotal,
        ],
      ],
      landscape: true,
    });
  }

  function exportPdf() {
    if (pageTab === "petugas") {
      if (!laporanPetugas || !hasDataPetugas) return;
      openPdfPreview(
        buildLaporanPenerimaanPaturunanPdfInput(laporanPetugas, {
          dari,
          sampai,
          banjarNama: selectedBanjarNama || undefined,
          tempekNama: selectedTempekNama || undefined,
          arahanNama: selectedArahanNama || undefined,
        })
      );
      return;
    }
    const opts = { dari, sampai, iuranNama: iuranNama || undefined };
    if (pageTab === "arahan") {
      if (!rekap || !hasDataArahan) return;
      openPdfPreview(buildRekapPenerimaanPaturunanPdfInput(rekap, opts));
      return;
    }
    if (!rekapBulan || !hasDataBulan) return;
    openPdfPreview(buildRekapPenerimaanPaturunanBulanPdfInput(rekapBulan, opts));
  }

  const filterChips = (
    <>
      {dari && <StatChip label="Dari" value={formatTanggalLahir(dari)} />}
      {sampai && <StatChip label="Sampai" value={formatTanggalLahir(sampai)} />}
      {pageTab !== "petugas" && iuranNama && <StatChip label="Iuran" value={iuranNama} />}
      {pageTab === "petugas" && selectedBanjarNama && (
        <StatChip label="Banjar" value={selectedBanjarNama} />
      )}
      {pageTab === "petugas" && selectedTempekNama && (
        <StatChip label="Tempek" value={selectedTempekNama} />
      )}
      {pageTab === "petugas" && selectedArahanNama && (
        <StatChip label="Arahan" value={selectedArahanNama} />
      )}
    </>
  );

  function renderArahanRow(r: TableRow, idx: number) {
    if (r.kind === "data") {
      return (
        <tr key={`d-${idx}`} className={LAPORAN_BODY_ROW}>
          <td className="pr-3 py-1">{r.banjar}</td>
          <td className="pr-3 py-1">{r.tempek}</td>
          <td className="pr-3 py-1">{r.arahan}</td>
          <td className="pr-3 py-1 text-right tabular-nums">{fmtKolomRupiah(r.wajib)}</td>
          <td className="pr-3 py-1 text-right tabular-nums">{fmtKolomRupiah(r.punia)}</td>
          <td className="pr-3 py-1 text-right tabular-nums font-medium">{formatRupiah(r.jumlah)}</td>
          <td className="py-1 text-right tabular-nums">{r.trx > 0 ? r.trx : "—"}</td>
        </tr>
      );
    }
    return (
      <tr
        key={`s-${idx}`}
        className={cn(
          "border-t border-copper-200 font-semibold",
          r.level === "banjar" && "bg-copper-50/80",
          r.level === "tempek" && "bg-copper-50/40"
        )}
      >
        <td className="pr-3 py-1" colSpan={3}>
          {r.label}
        </td>
        <td className="pr-3 py-1 text-right tabular-nums">{fmtKolomRupiah(r.wajib)}</td>
        <td className="pr-3 py-1 text-right tabular-nums">{fmtKolomRupiah(r.punia)}</td>
        <td className="pr-3 py-1 text-right tabular-nums">{formatRupiah(r.jumlah)}</td>
        <td className="py-1 text-right tabular-nums">{r.trx > 0 ? r.trx : "—"}</td>
      </tr>
    );
  }

  function renderPetugasDataRow(row: Extract<LaporanPenerimaanPaturunanTableRow, { kind: "data" }>, idx: number) {
    return (
      <tr key={`p-${idx}`} className={LAPORAN_BODY_ROW}>
        <td className="pr-3 py-1 tabular-nums whitespace-nowrap text-center">
          {formatTanggalLahir(row.tanggal)}
        </td>
        <td className="pr-3 py-1">{row.uraian}</td>
        <td className="py-1 text-right tabular-nums">{formatRupiah(row.jumlah)}</td>
      </tr>
    );
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <h2 className="text-xl font-bold flex items-center gap-1.5 mt-1">
            <Coins className="text-copper-700 shrink-0" size={22} />
            Rekap Penerimaan Paturunan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Ringkasan penerimaan paturunan — per arahan, per bulan bayar, atau per tanggal tempek
            &amp; petugas.
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
          {pageTab !== "petugas" && (
            <div className="min-w-[12rem]">
              <Label className="text-[11px]">Iuran (opsional)</Label>
              <Select value={iuranId} onChange={(e) => setIuranId(e.target.value)}>
                <option value="">Semua iuran</option>
                {iuranList.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nama}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {pageTab === "petugas" && (
            <>
              <div className="min-w-[10rem]">
                <Label className="text-[11px]">Banjar</Label>
                <Select value={banjarId} onChange={(e) => setBanjarId(e.target.value)}>
                  <option value="">Semua banjar</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[10rem]">
                <Label className="text-[11px]">Tempek</Label>
                <Select
                  value={tempekId}
                  onChange={(e) => setTempekId(e.target.value)}
                  disabled={!banjarId}
                >
                  <option value="">Semua tempek</option>
                  {tempek.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[10rem]">
                <Label className="text-[11px]">Arahan</Label>
                <Select
                  value={arahanId}
                  onChange={(e) => setArahanId(e.target.value)}
                  disabled={!tempekId}
                >
                  <option value="">Semua arahan</option>
                  {arahan.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama}
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

      <div className={cn("flex flex-wrap gap-2", isPhone && "gap-1.5 w-full")}>
        <Button
          variant={pageTab === "arahan" ? "primary" : "secondary"}
          icon={LayoutGrid}
          type="button"
          className={cn(isPhone && "h-11 flex-1 min-w-[8rem]")}
          onClick={() => setPageTab("arahan")}
        >
          Banjar · Tempek · Arahan
        </Button>
        <Button
          variant={pageTab === "bulan" ? "primary" : "secondary"}
          icon={CalendarRange}
          type="button"
          className={cn(isPhone && "h-11 flex-1 min-w-[8rem]")}
          onClick={() => setPageTab("bulan")}
        >
          Per Tempek · Bulan Bayar
        </Button>
        <Button
          variant={pageTab === "petugas" ? "primary" : "secondary"}
          icon={UserCircle}
          type="button"
          className={cn(isPhone && "h-11 flex-1 min-w-[8rem]")}
          onClick={() => setPageTab("petugas")}
        >
          Per Tanggal · Petugas
        </Button>
      </div>

      {pageTab === "arahan" && (
        <Card
          className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}
          title="Rekap per Banjar · Tempek · Arahan"
        >
          {rekap && (
            <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
              <StatChip label="Transaksi" value={String(rekap.total_transaksi)} />
              <StatChip label="Wajib" value={formatRupiah(rekap.total_wajib)} />
              <StatChip label="Punia" value={formatRupiah(rekap.total_punia)} />
              <StatChip label="Jumlah" value={formatRupiah(rekap.total_jumlah)} />
              {filterChips}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="pr-3">Banjar</th>
                  <th className="pr-3">Tempek</th>
                  <th className="pr-3">Arahan</th>
                  <th className="pr-3 text-right">Wajib</th>
                  <th className="pr-3 text-right">Punia</th>
                  <th className="pr-3 text-right">Jumlah</th>
                  <th className="text-right">Trx</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-muted text-sm">
                      Memuat…
                    </td>
                  </tr>
                ) : arahanBodyRows.length === 0 || !hasDataArahan ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-muted text-sm">
                      Belum ada penerimaan paturunan pada filter ini.
                    </td>
                  </tr>
                ) : (
                  <>
                    {pagedArahanRows.map((r, idx) => renderArahanRow(r, idx))}
                    {arahanGrandTotal && arahanGrandTotal.kind === "subtotal" && (
                      <tr className="border-t-2 border-copper-300 bg-copper-100/70 font-semibold">
                        <td className="pr-3 py-1" colSpan={3}>
                          {arahanGrandTotal.label}
                        </td>
                        <td className="pr-3 py-1 text-right tabular-nums">
                          {fmtKolomRupiah(arahanGrandTotal.wajib)}
                        </td>
                        <td className="pr-3 py-1 text-right tabular-nums">
                          {fmtKolomRupiah(arahanGrandTotal.punia)}
                        </td>
                        <td className="pr-3 py-1 text-right tabular-nums">
                          {formatRupiah(arahanGrandTotal.jumlah)}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {arahanGrandTotal.trx > 0 ? arahanGrandTotal.trx : "—"}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={safePageArahan}
            totalItems={arahanBodyRows.length}
            pageSize={pageSizeArahan}
            onPageChange={setPageArahan}
            onPageSizeChange={setPageSizeArahan}
            compact
          />
        </Card>
      )}

      {pageTab === "bulan" && (
        <Card
          className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}
          title="Rekap per Tempek · Bulan Bayar"
        >
          {rekapBulan && (
            <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
              <StatChip label="Tempek" value={String(rekapBulan.rows.length)} />
              <StatChip label="Jumlah" value={formatRupiah(rekapBulan.grandTotal)} />
              {filterChips}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className={LAPORAN_TABLE_ELEMENT}>
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[11%]" />
                {rekapBulan?.bulanLabel.map((label) => (
                  <col key={label} />
                ))}
                <col className="w-[9%]" />
              </colgroup>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="pr-3">Banjar</th>
                  <th className="pr-3">Tempek</th>
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
                    <td
                      colSpan={(rekapBulan?.bulan.length ?? 0) + 3}
                      className="py-4 text-center text-muted text-sm"
                    >
                      Memuat…
                    </td>
                  </tr>
                ) : !rekapBulan || rekapBulan.rows.length === 0 || !hasDataBulan ? (
                  <tr>
                    <td
                      colSpan={(rekapBulan?.bulan.length ?? 1) + 3}
                      className="py-4 text-center text-muted text-sm"
                    >
                      Belum ada penerimaan paturunan pada filter ini.
                    </td>
                  </tr>
                ) : (
                  <>
                    {pagedBulanRows.map((r, idx) => (
                      <tr key={`b-${idx}`} className={LAPORAN_BODY_ROW}>
                        <td className="pr-3 py-1">{r.banjar_nama}</td>
                        <td className="pr-3 py-1">{r.tempek_nama}</td>
                        {rekapBulan.bulan.map((bk) => (
                          <td key={bk} className="pr-3 py-1 text-right tabular-nums">
                            {fmtKolomRupiah(r.perBulan[bk] ?? 0)}
                          </td>
                        ))}
                        <td className="py-1 text-right tabular-nums font-medium">{formatRupiah(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-copper-300 bg-copper-100/70 font-semibold">
                      <td className="pr-3 py-1" colSpan={2}>
                        JUMLAH
                      </td>
                      {rekapBulan.bulan.map((bk) => (
                        <td key={`t-${bk}`} className="pr-3 py-1 text-right tabular-nums">
                          {fmtKolomRupiah(rekapBulan.totalPerBulan[bk] ?? 0)}
                        </td>
                      ))}
                      <td className="py-1 text-right tabular-nums">{formatRupiah(rekapBulan.grandTotal)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={safePageBulan}
            totalItems={rekapBulan?.rows.length ?? 0}
            pageSize={pageSizeBulan}
            onPageChange={setPageBulan}
            onPageSizeChange={setPageSizeBulan}
            compact
          />
        </Card>
      )}

      {pageTab === "petugas" && (
        <Card
          className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}
          title="Rekap per Tanggal · Tempek · Petugas"
        >
          {laporanPetugas && (
            <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
              <StatChip label="Baris" value={String(laporanPetugas.rowCount)} />
              <StatChip label="Jumlah" value={formatRupiah(laporanPetugas.grandTotal)} />
              {filterChips}
            </div>
          )}

          <div className="overflow-x-auto">
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
                ) : petugasDataRows.length === 0 || !hasDataPetugas ? (
                  <tr>
                    <td colSpan={PETUGAS_COLS} className="py-4 text-center text-muted text-sm">
                      Belum ada penerimaan paturunan pada filter ini.
                    </td>
                  </tr>
                ) : (
                  <>
                    {pagedPetugasRows.map((row, idx) => renderPetugasDataRow(row, idx))}
                    {petugasGrandTotal && petugasGrandTotal.kind === "grand-total" && (
                      <tr className="border-t-2 border-copper-300 bg-copper-100/70 font-semibold">
                        <td className="pr-3 py-1" colSpan={2}>
                          JUMLAH KESELURUHAN
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {formatRupiah(petugasGrandTotal.total)}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={safePagePetugas}
            totalItems={petugasDataRows.length}
            pageSize={pageSizePetugas}
            onPageChange={setPagePetugas}
            onPageSizeChange={setPageSizePetugas}
            compact
          />
        </Card>
      )}
    </div>
  );
}
