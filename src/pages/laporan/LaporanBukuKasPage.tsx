import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { downloadExcel } from "../../lib/excel-export";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { listAkunKeuanganHierarkis } from "../../lib/services/akun-keuangan";
import {
  loadLaporanBukuKasForAkun,
  loadLaporanKasRekapPerPosForAkun,
  sortLaporanBukuKasTanggalAsc,
} from "../../lib/services/buku-kas";
import type { AkunKeuanganRow, LaporanBukuKasBaris, LaporanBukuKasSubSaldo, LaporanKasRekapPerPosBaris } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { DateInput } from "../../components/ui/DateInput";
import { Label, Select } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import { ListPagination } from "../../components/ui/ListPagination";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { ArrowLeft, Filter, RotateCcw, Wallet } from "lucide-react";

const BUKU_KAS_TABLE =
  "table-fixed w-full text-sm [&_th]:!text-sm [&_td]:!text-sm [&_th]:!py-1.5 [&_td]:!py-1.5 [&_th]:font-semibold";

type LaporanTab = "rincian" | "rekap-pos";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const PAGE_ID = "laporan/buku-kas";

export function LaporanBukuKasPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Buku Kas");
  const [laporanTab, setLaporanTab] = usePersistedScalar<LaporanTab>(PAGE_ID, "laporanTab", "rincian");
  const [akun, setAkun] = useState<AkunKeuanganRow[]>([]);
  const [akunId, setAkunId] = usePersistedScalar(PAGE_ID, "akunId", "");
  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [saldoAwal, setSaldoAwal] = useState(0);
  const [saldoAkhir, setSaldoAkhir] = useState(0);
  const [baris, setBaris] = useState<LaporanBukuKasBaris[]>([]);
  const [subSaldo, setSubSaldo] = useState<LaporanBukuKasSubSaldo[]>([]);
  const [rekapPos, setRekapPos] = useState<LaporanKasRekapPerPosBaris[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const akunNama = useMemo(
    () => akun.find((a) => a.id === akunId)?.nama ?? "",
    [akun, akunId]
  );

  const totalPemasukan = useMemo(
    () => baris.reduce((s, b) => s + b.pemasukan, 0),
    [baris]
  );
  const totalPengeluaran = useMemo(
    () => baris.reduce((s, b) => s + b.pengeluaran, 0),
    [baris]
  );

  const rekapDataRows = useMemo(
    () => rekapPos.filter((r) => r.kind === "data"),
    [rekapPos]
  );
  const rekapSaldoAwalRow = useMemo(
    () => rekapPos.find((r) => r.kind === "saldo_awal") ?? null,
    [rekapPos]
  );
  const rekapJumlahRow = useMemo(
    () => rekapPos.find((r) => r.kind === "jumlah") ?? null,
    [rekapPos]
  );
  const rekapSaldoRow = useMemo(
    () => rekapPos.find((r) => r.kind === "saldo") ?? null,
    [rekapPos]
  );
  const rekapTotalRow = useMemo(
    () => rekapPos.find((r) => r.kind === "total") ?? null,
    [rekapPos]
  );

  const safePage = useMemo(
    () =>
      clampPage(
        page,
        laporanTab === "rincian" ? baris.length : rekapDataRows.length,
        pageSize
      ),
    [page, baris.length, rekapDataRows.length, laporanTab, pageSize]
  );
  const pagedBaris = useMemo(
    () => paginateSlice(baris, safePage, pageSize),
    [baris, safePage, pageSize]
  );
  const pagedRekapPos = useMemo(
    () => paginateSlice(rekapDataRows, safePage, pageSize),
    [rekapDataRows, safePage, pageSize]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await listAkunKeuanganHierarkis(true);
        setAkun(rows);
        if (rows[0] && !akunId) setAkunId(rows[0].id);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!akunId) {
      setBaris([]);
      setSubSaldo([]);
      setRekapPos([]);
      setSaldoAwal(0);
      setSaldoAkhir(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const filter = {
        akunKeuanganId: akunId,
        dari: dari || undefined,
        sampai: sampai || undefined,
      };
      const [r, rekap] = await Promise.all([
        loadLaporanBukuKasForAkun(filter),
        loadLaporanKasRekapPerPosForAkun(filter),
      ]);
      setSaldoAwal(r.saldo_awal);
      setSaldoAkhir(r.saldo_akhir);
      setBaris(r.baris);
      setSubSaldo(r.sub_saldo ?? []);
      setRekapPos(rekap);
      setPage(1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [akunId, dari, sampai]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [laporanTab]);

  function resetFilter() {
    clearPagePersistedState(PAGE_ID);
    setDari("");
    setSampai("");
  }

  function formatPeriodePdf(): string {
    if (dari && sampai) {
      return `Periode: dari ${formatTanggalLahir(dari)} s.d. ${formatTanggalLahir(sampai)}`;
    }
    if (dari) return `Periode: dari ${formatTanggalLahir(dari)}`;
    if (sampai) return `Periode: sampai ${formatTanggalLahir(sampai)}`;
    return "Periode: semua";
  }

  function fmtKolomRupiah(n: number): string {
    return n > 0 ? formatRupiah(n) : "—";
  }

  function periodeSlug(): string {
    return dari && sampai
      ? `${dari}_${sampai}`
      : dari
        ? `dari-${dari}`
        : sampai
          ? `sampai-${sampai}`
          : "semua";
  }

  async function exportExcelRincian() {
    const slug = akunNama.replace(/\s+/g, "-").toLowerCase() || "akun";
    const exportBaris = sortLaporanBukuKasTanggalAsc(baris);
    await downloadExcel(`laporan-buku-kas-${slug}-${periodeSlug()}`, {
      name: "Buku Kas",
      headers: ["No", "Tanggal", "Uraian", "Pemasukan", "Pengeluaran", "Saldo"],
      rows: [
        ["", "", "Saldo awal periode", "", "", saldoAwal],
        ...exportBaris.map((b, i) => [
          i + 1,
          formatTanggalLahir(b.tanggal),
          b.uraian,
          b.pemasukan > 0 ? b.pemasukan : "",
          b.pengeluaran > 0 ? b.pengeluaran : "",
          b.saldo_berjalan ?? 0,
        ]),
        ["", "", "Saldo akhir periode", "", "", saldoAkhir],
      ],
    });
  }

  async function exportExcelRekapPos() {
    const slug = akunNama.replace(/\s+/g, "-").toLowerCase() || "akun";
    await downloadExcel(`laporan-kas-rekap-per-pos-${slug}-${periodeSlug()}`, {
      name: "Rekap per Pos",
      headers: ["No", "Pos", "Pemasukan", "Pengeluaran"],
      rows: rekapPos.map((r) => [
        r.no ?? "",
        r.pos,
        r.pemasukan > 0 ? r.pemasukan : "",
        r.pengeluaran > 0 ? r.pengeluaran : "",
      ]),
    });
  }

  async function exportPdfRincian() {
    const slug = akunNama.replace(/\s+/g, "-").toLowerCase() || "akun";
    const exportBaris = sortLaporanBukuKasTanggalAsc(baris);
    const totalRowIndex = 1 + exportBaris.length;
    const subSaldoHeaderIndex = totalRowIndex + 1;
    const subSaldoRows =
      subSaldo.length > 0
        ? [
            ["", "", "Saldo per sub-akun", "—", "—", "—"],
            ...subSaldo.map((s) => ["", "", s.nama, "—", "—", formatRupiah(s.saldo_akhir)]),
          ]
        : [];
    const boldRows =
      subSaldo.length > 0 ? [totalRowIndex, subSaldoHeaderIndex] : [totalRowIndex];
    openPdfPreview({
      filename: `laporan-buku-kas-${slug}`,
      judul: "Laporan Buku Kas",
      subjudul: akunNama,
      periode: formatPeriodePdf(),
      headers: ["No", "Tanggal", "Uraian", "Pemasukan", "Pengeluaran", "Saldo"],
      rows: [
        ["", "", "Saldo awal periode", "—", "—", formatRupiah(saldoAwal)],
        ...exportBaris.map((b, i) => [
          String(i + 1),
          formatTanggalLahir(b.tanggal),
          b.uraian,
          fmtKolomRupiah(b.pemasukan),
          fmtKolomRupiah(b.pengeluaran),
          formatRupiah(b.saldo_berjalan ?? 0),
        ]),
        [
          "",
          "",
          "Total periode",
          formatRupiah(totalPemasukan),
          formatRupiah(totalPengeluaran),
          formatRupiah(saldoAkhir),
        ],
        ...subSaldoRows,
      ],
      summaryLines: [
        `Total pemasukan: ${formatRupiah(totalPemasukan)} · Total pengeluaran: ${formatRupiah(totalPengeluaran)}`,
      ],
      columnFractions: [0.05, 0.11, 0.36, 0.16, 0.16, 0.16],
      alignRight: [0, 3, 4, 5],
      wrapColumns: [2],
      boldRows,
      rowFontSize: 10,
      headerFontSize: 10.5,
      tableBottomMarginMm: 5,
      rowLineLeading: 1.22,
      rowPadMm: 1.2,
      continuationHeaderMm: 5,
      summaryFontSize: 9.5,
      signatureFontSize: 10.5,
    });
  }

  async function exportPdfRekapPos() {
    const slug = akunNama.replace(/\s+/g, "-").toLowerCase() || "akun";
    const boldRows = rekapPos
      .map((r, i) => (r.kind === "jumlah" || r.kind === "saldo" || r.kind === "total" ? i : -1))
      .filter((i) => i >= 0);
    openPdfPreview({
      filename: `laporan-kas-rekap-per-pos-${slug}`,
      judul: "Laporan Kas Rekap per Pos",
      subjudul: akunNama,
      periode: formatPeriodePdf(),
      headers: ["No", "Pos", "Pemasukan", "Pengeluaran"],
      rows: rekapPos.map((r) => [
        r.no != null ? String(r.no) : "",
        r.pos,
        fmtKolomRupiah(r.pemasukan),
        fmtKolomRupiah(r.pengeluaran),
      ]),
      summaryLines: rekapTotalRow
        ? [
            `Total pemasukan: ${formatRupiah(rekapTotalRow.pemasukan)} · Total pengeluaran: ${formatRupiah(rekapTotalRow.pengeluaran)}`,
          ]
        : [],
      columnFractions: [0.08, 0.52, 0.2, 0.2],
      alignRight: [0, 2, 3],
      wrapColumns: [1],
      boldRows,
      rowFontSize: 10,
      headerFontSize: 10.5,
      tableBottomMarginMm: 5,
      rowLineLeading: 1.22,
      rowPadMm: 1.2,
      continuationHeaderMm: 5,
      summaryFontSize: 9.5,
      signatureFontSize: 10.5,
    });
  }

  const exportDisabled =
    laporanTab === "rincian" ? baris.length === 0 : rekapPos.length === 0;

  const hasActiveFilters = dari !== "" || sampai !== "";

  function renderRekapKolomRupiah(n: number, tone?: "in" | "out") {
    if (n <= 0) return "—";
    const cls =
      tone === "in"
        ? "text-emerald-800"
        : tone === "out"
          ? "text-red-800"
          : "";
    return <span className={cn("tabular-nums", cls)}>{formatRupiah(n)}</span>;
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <h2 className="text-xl font-bold flex items-center gap-1.5 mt-1">
            <Wallet className="text-copper-700 shrink-0" size={22} />
            Laporan Buku Kas
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Pemasukan dan pengeluaran per akun — rincian transaksi atau rekap per pos.
          </p>
          <Link
            to={`/laporan/rekap-penerimaan-dudukan?dari=${encodeURIComponent(dari)}&sampai=${encodeURIComponent(sampai)}`}
            className="text-[11px] text-copper-800 hover:underline inline-block mt-1"
          >
            Rincian penerimaan dudukan (per banjar & jenis) →
          </Link>
        </div>
        <LaporanExportButtons
          onExcel={() =>
            void (laporanTab === "rincian" ? exportExcelRincian() : exportExcelRekapPos())
          }
          onPdf={() => void (laporanTab === "rincian" ? exportPdfRincian() : exportPdfRekapPos())}
          excelDisabled={exportDisabled}
          pdfDisabled={exportDisabled}
        />
      </div>

      <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)} title="Filter">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[12rem]">
            <Label className="text-[11px]">Akun</Label>
            <Select value={akunId} onChange={(e) => setAkunId(e.target.value)}>
              {akun.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.parent_akun_id ? `  ${a.nama}` : a.nama}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Dari</Label>
            <DateInput value={dari} onChange={setDari} />
          </div>
          <div>
            <Label className="text-[11px]">Sampai</Label>
            <DateInput value={sampai} onChange={setSampai} />
          </div>
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
            disabled={!hasActiveFilters}
          >
            Reset filter
          </Button>
        </div>
      </Card>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <div
        className={cn(
          "flex gap-1 p-0.5 rounded-md bg-copper-100/80 border border-copper-200",
          isPhone ? "w-full" : "w-fit"
        )}
      >
        {(
          [
            ["rincian", "Rincian transaksi"],
            ["rekap-pos", "Rekap per pos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "px-3 text-xs rounded font-medium transition-colors flex-1 sm:flex-none",
              isPhone ? "min-h-11 py-2" : "py-1",
              laporanTab === id
                ? "bg-white text-copper-900 shadow-sm"
                : "text-copper-800 hover:bg-copper-50"
            )}
            onClick={() => {
              setLaporanTab(id);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {laporanTab === "rincian" ? (
        <Card
          className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}
          title={akunNama ? `Buku Kas — ${akunNama}` : "Buku Kas"}
        >
          <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
            <StatChip label="Saldo awal" value={formatRupiah(saldoAwal)} />
            <StatChip label="Pemasukan" value={formatRupiah(totalPemasukan)} />
            <StatChip label="Pengeluaran" value={formatRupiah(totalPengeluaran)} />
            <StatChip label="Saldo akhir" value={formatRupiah(saldoAkhir)} />
          </div>

          <div className="overflow-x-auto">
            <table className={cn(LAPORAN_TABLE_ELEMENT, BUKU_KAS_TABLE)}>
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[11%]" />
                <col className="w-[34%]" />
                <col className="w-[17%]" />
                <col className="w-[17%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="pr-3 text-right">No</th>
                  <th className="pr-3">Tanggal</th>
                  <th className="pr-3">Uraian</th>
                  <th className="pr-3 text-right">Pemasukan</th>
                  <th className="pr-3 text-right">Pengeluaran</th>
                  <th className="text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-copper-100 bg-copper-50/40">
                  <td className="pr-3 py-1.5 align-top" />
                  <td className="pr-3 py-1.5 align-top whitespace-nowrap" colSpan={2}>
                    <span className="text-muted italic">Saldo awal periode</span>
                  </td>
                  <td className="pr-3 py-1.5 text-right align-top">—</td>
                  <td className="pr-3 py-1.5 text-right align-top">—</td>
                  <td className="py-1.5 text-right tabular-nums font-medium align-top">
                    {formatRupiah(saldoAwal)}
                  </td>
                </tr>
                {baris.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-muted">
                      {loading ? "Memuat…" : "Belum ada transaksi pada filter ini."}
                    </td>
                  </tr>
                )}
                {pagedBaris.map((b, i) => (
                  <tr key={b.id} className="border-b border-copper-100">
                    <td className="pr-3 py-1.5 text-right tabular-nums align-top">
                      {(safePage - 1) * pageSize + i + 1}
                    </td>
                    <td className="pr-3 py-1.5 align-top whitespace-nowrap">
                      {formatTanggalLahir(b.tanggal)}
                    </td>
                    <td className="pr-3 py-1.5 align-top whitespace-normal break-words leading-snug">
                      {b.uraian}
                    </td>
                    <td className="pr-3 py-1.5 text-right tabular-nums text-emerald-800 align-top whitespace-nowrap">
                      {b.pemasukan > 0 ? formatRupiah(b.pemasukan) : "—"}
                    </td>
                    <td className="pr-3 py-1.5 text-right tabular-nums text-red-800 align-top whitespace-nowrap">
                      {b.pengeluaran > 0 ? formatRupiah(b.pengeluaran) : "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium align-top whitespace-nowrap">
                      {formatRupiah(b.saldo_berjalan ?? 0)}
                    </td>
                  </tr>
                ))}
                {baris.length > 0 && (
                  <tr className="border-t border-copper-200 bg-copper-50/60 font-bold">
                    <td className="pr-3 py-1.5 align-top" />
                    <td className="pr-3 py-1.5 align-top" colSpan={2}>
                      Total periode
                    </td>
                    <td className="pr-3 py-1.5 text-right tabular-nums text-emerald-900 align-top">
                      {formatRupiah(totalPemasukan)}
                    </td>
                    <td className="pr-3 py-1.5 text-right tabular-nums text-red-900 align-top">
                      {formatRupiah(totalPengeluaran)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums align-top">
                      {formatRupiah(saldoAkhir)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={safePage}
            totalItems={baris.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        </Card>
      ) : (
        <Card
          className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}
          title={akunNama ? `Kas Rekap per Pos — ${akunNama}` : "Kas Rekap per Pos"}
        >
          {rekapTotalRow && (
            <div className={cn("flex flex-wrap gap-2 mb-3", isPhone && "gap-1.5")}>
              {rekapSaldoAwalRow && (
                <StatChip
                  label="Saldo awal"
                  value={formatRupiah(
                    rekapSaldoAwalRow.pemasukan > 0
                      ? rekapSaldoAwalRow.pemasukan
                      : -rekapSaldoAwalRow.pengeluaran
                  )}
                />
              )}
              {rekapJumlahRow && (
                <>
                  <StatChip label="Sub jumlah masuk" value={formatRupiah(rekapJumlahRow.pemasukan)} />
                  <StatChip label="Sub jumlah keluar" value={formatRupiah(rekapJumlahRow.pengeluaran)} />
                </>
              )}
              <StatChip label="Total masuk" value={formatRupiah(rekapTotalRow.pemasukan)} />
              <StatChip label="Total keluar" value={formatRupiah(rekapTotalRow.pengeluaran)} />
            </div>
          )}

          <div className="overflow-x-auto">
            <table className={cn(LAPORAN_TABLE_ELEMENT, BUKU_KAS_TABLE)}>
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[52%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="pr-3 text-right">No</th>
                  <th className="pr-3">Pos</th>
                  <th className="pr-3 text-right">Pemasukan</th>
                  <th className="text-right">Pengeluaran</th>
                </tr>
              </thead>
              <tbody>
                {rekapSaldoAwalRow && (
                  <tr className="border-b border-copper-100 bg-copper-50/40">
                    <td className="pr-3 py-1.5 align-top" />
                    <td className="pr-3 py-1.5 align-top font-medium">{rekapSaldoAwalRow.pos}</td>
                    <td className="pr-3 py-1.5 text-right align-top whitespace-nowrap">
                      {renderRekapKolomRupiah(rekapSaldoAwalRow.pemasukan, "in")}
                    </td>
                    <td className="py-1.5 text-right align-top whitespace-nowrap">
                      {renderRekapKolomRupiah(rekapSaldoAwalRow.pengeluaran, "out")}
                    </td>
                  </tr>
                )}
                {rekapDataRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted">
                      {loading ? "Memuat…" : "Belum ada transaksi pada filter ini."}
                    </td>
                  </tr>
                )}
                {pagedRekapPos.map((r) => (
                  <tr key={`${r.no}-${r.pos}`} className="border-b border-copper-100">
                    <td className="pr-3 py-1.5 text-right tabular-nums align-top">{r.no}</td>
                    <td className="pr-3 py-1.5 align-top whitespace-normal break-words leading-snug">
                      {r.pos}
                    </td>
                    <td className="pr-3 py-1.5 text-right align-top whitespace-nowrap">
                      {renderRekapKolomRupiah(r.pemasukan, "in")}
                    </td>
                    <td className="py-1.5 text-right align-top whitespace-nowrap">
                      {renderRekapKolomRupiah(r.pengeluaran, "out")}
                    </td>
                  </tr>
                ))}
                {rekapJumlahRow && (
                  <tr className="border-t border-copper-200 bg-copper-50/60 font-bold">
                    <td className="pr-3 py-1.5 align-top" />
                    <td className="pr-3 py-1.5 align-top">{rekapJumlahRow.pos}</td>
                    <td className="pr-3 py-1.5 text-right align-top">
                      {renderRekapKolomRupiah(rekapJumlahRow.pemasukan, "in")}
                    </td>
                    <td className="py-1.5 text-right align-top">
                      {renderRekapKolomRupiah(rekapJumlahRow.pengeluaran, "out")}
                    </td>
                  </tr>
                )}
                {rekapSaldoRow && (
                  <tr className="border-b border-copper-100 bg-copper-50/40 font-semibold">
                    <td className="pr-3 py-1.5 align-top" />
                    <td className="pr-3 py-1.5 align-top">{rekapSaldoRow.pos}</td>
                    <td className="pr-3 py-1.5 text-right align-top whitespace-nowrap">
                      {renderRekapKolomRupiah(rekapSaldoRow.pemasukan)}
                    </td>
                    <td className="py-1.5 text-right align-top whitespace-nowrap">
                      {renderRekapKolomRupiah(rekapSaldoRow.pengeluaran)}
                    </td>
                  </tr>
                )}
                {rekapTotalRow && (
                  <tr className="border-t border-copper-300 bg-copper-100/70 font-bold">
                    <td className="pr-3 py-1.5 align-top" />
                    <td className="pr-3 py-1.5 align-top">{rekapTotalRow.pos}</td>
                    <td className="pr-3 py-1.5 text-right align-top">
                      {renderRekapKolomRupiah(rekapTotalRow.pemasukan, "in")}
                    </td>
                    <td className="py-1.5 text-right align-top">
                      {renderRekapKolomRupiah(rekapTotalRow.pengeluaran, "out")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={safePage}
            totalItems={rekapDataRows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        </Card>
      )}
    </div>
  );
}
