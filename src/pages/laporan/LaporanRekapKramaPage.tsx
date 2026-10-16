import { useCallback, useEffect, useMemo, useState } from "react";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  buildRekapKramaPdfColumnFractions,
  buildRekapKramaTableRows,
  formatRekapKramaAngka,
  getRekapKrama,
  type RekapKrama,
  type RekapKramaTableRow,
} from "../../lib/services/laporan-rekap-krama";
import { cn } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { IconLink } from "../../components/ui/IconLink";
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
import { ArrowLeft, RefreshCw, TableProperties, Users } from "lucide-react";

const COL_NO = "2.25rem";
const COL_KLASIFIKASI = "6.5rem";
const COL_JENIS = "13rem";
const STICKY_KLASIFIKASI_LEFT = COL_NO;
const STICKY_JENIS_LEFT = `calc(${COL_NO} + ${COL_KLASIFIKASI})`;

function tableRowKey(row: RekapKramaTableRow, idx: number): string {
  if (row.kind === "data") {
    return `data-${row.baris.klasifikasi_kode}-${row.baris.jenis_id || row.baris.jenis_nama}`;
  }
  if (row.kind === "subtotal") return `subtotal-${row.klasifikasi_kode}`;
  return `grand-total-${idx}`;
}

function buildExportRows(data: RekapKrama, formatted = false): (string | number)[][] {
  const fmt = (n: number, showZero = false) =>
    formatted ? formatRekapKramaAngka(n, showZero) : n;

  return buildRekapKramaTableRows(data).flatMap((row) => {
    if (row.kind === "data") {
      return [
        [
          row.nomor ?? "",
          row.showKlasifikasi ? row.baris.klasifikasi_nama : "",
          row.baris.jenis_nama,
          ...data.banjar.map((b) => fmt(row.baris.per_banjar[b.id] ?? 0)),
          fmt(row.baris.total),
        ],
      ];
    }
    if (row.kind === "subtotal") {
      return [
        [
          "",
          `Subtotal ${row.klasifikasi_nama}`,
          "",
          ...data.banjar.map((b) => fmt(row.per_banjar[b.id] ?? 0, true)),
          fmt(row.total, true),
        ],
      ];
    }
    return [
      [
        "",
        "Total Keseluruhan",
        "",
        ...data.banjar.map((b) => fmt(row.per_banjar[b.id] ?? 0, true)),
        fmt(row.total, true),
      ],
    ];
  });
}

function buildExportBoldRows(data: RekapKrama): number[] {
  const tableRows = buildRekapKramaTableRows(data);
  const boldRows: number[] = [];
  tableRows.forEach((row, idx) => {
    if (row.kind === "subtotal" || row.kind === "grand-total") boldRows.push(idx);
  });
  return boldRows;
}

export function LaporanRekapKramaPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Rekap Krama");
  const [data, setData] = useState<RekapKrama | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getRekapKrama());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tableRows = useMemo(
    () => (data ? buildRekapKramaTableRows(data) : []),
    [data]
  );

  const exportHeaders = useMemo(() => {
    if (!data) return ["No", "Klasifikasi", "Jenis"];
    return ["No", "Klasifikasi Krama", "Jenis", ...data.banjar.map((b) => b.nama), "Total"];
  }, [data]);

  function exportExcel() {
    if (!data) return;
    void downloadExcel("rekap-krama", {
      name: "Rekap Krama",
      headers: exportHeaders,
      rows: buildExportRows(data, true),
      landscape: true,
    });
  }

  function exportPdf() {
    if (!data) return;
    const rows = buildExportRows(data, true);
    const boldRows = buildExportBoldRows(data);
    const banjarStartCol = 3;
    openPdfPreview({
      filename: "rekap-krama",
      judul: "Rekap Krama",
      periode: "Krama aktif per klasifikasi, jenis, dan banjar",
      headers: exportHeaders,
      rows,
      pageSize: "F4",
      orientation: "landscape",
      rowFontSize: 10,
      headerFontSize: 10.5,
      summaryFontSize: 11.5,
      columnFractions: buildRekapKramaPdfColumnFractions(data.banjar.length),
      wrapColumns: [2],
      alignRight: [
        0,
        ...data.banjar.map((_, i) => banjarStartCol + i),
        banjarStartCol + data.banjar.length,
      ],
      boldRows,
      highlightRows: boldRows.filter((i) => tableRows[i]?.kind === "subtotal"),
      thickBorderBeforeRows: boldRows,
    });
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <TableProperties className="text-copper-700" size={22} />
            Rekap Krama
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Jumlah krama aktif per klasifikasi, jenis, dan banjar — dengan subtotal dan total keseluruhan.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <Button
            variant="secondary"
            icon={RefreshCw}
            className={cn("text-xs", isPhone ? "h-11" : "h-9")}
            onClick={load}
            disabled={loading}
          >
            Muat ulang
          </Button>
          <LaporanExportButtons
            onExcel={exportExcel}
            onPdf={exportPdf}
            disabled={loading || !data}
            excelDisabled={!data || data.baris.length === 0}
            pdfDisabled={!data || data.baris.length === 0}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      {loading && !data && <p className="text-sm text-muted">Memuat rekap…</p>}

      {data && (
        <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
          <div className={cn("flex flex-wrap items-center gap-2 mb-2 text-xs", isPhone && "gap-1.5")}>
            <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5">
              <Users size={12} />
              Total krama aktif:{" "}
              <strong className="tabular-nums">
                {formatRekapKramaAngka(data.total_keseluruhan.total, true)}
              </strong>
            </span>
            <span className="text-muted">{data.banjar.length} banjar</span>
            <span className="text-muted">
              No: 1 Krama Mipil · 2 Krama Tamiu · 3 Tamiu
            </span>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className={cn(LAPORAN_TABLE_ELEMENT, "min-w-max table-fixed w-full")}>
              <colgroup>
                <col style={{ width: COL_NO }} />
                <col style={{ width: COL_KLASIFIKASI }} />
                <col style={{ width: COL_JENIS }} />
                {data.banjar.map((b) => (
                  <col key={b.id} style={{ width: "3.25rem" }} />
                ))}
                <col style={{ width: "3.75rem" }} />
              </colgroup>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th
                    className="sticky left-0 z-20 bg-copper-100/95 text-center"
                    style={{ width: COL_NO }}
                  >
                    No
                  </th>
                  <th
                    className="sticky z-20 bg-copper-100/95"
                    style={{ left: STICKY_KLASIFIKASI_LEFT, width: COL_KLASIFIKASI }}
                  >
                    Klasifikasi
                  </th>
                  <th
                    className="sticky z-20 bg-copper-100/95 border-r border-copper-200"
                    style={{ left: STICKY_JENIS_LEFT, width: COL_JENIS }}
                  >
                    Jenis
                  </th>
                  {data.banjar.map((b) => (
                    <th key={b.id} className="text-right whitespace-nowrap px-1 text-[10px]">
                      {b.nama}
                    </th>
                  ))}
                  <th className="text-right font-semibold px-1 text-[10px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, idx) => {
                  if (row.kind === "data") {
                    return (
                      <tr key={tableRowKey(row, idx)} className={LAPORAN_BODY_ROW}>
                        <td
                          className="sticky left-0 z-10 bg-white align-top text-center tabular-nums text-copper-800 border-r border-copper-100"
                          style={{ width: COL_NO }}
                        >
                          {row.nomor ?? ""}
                        </td>
                        <td
                          className="sticky z-10 bg-white align-top font-medium text-copper-900 border-r border-copper-100"
                          style={{ left: STICKY_KLASIFIKASI_LEFT, width: COL_KLASIFIKASI }}
                        >
                          {row.showKlasifikasi ? row.baris.klasifikasi_nama : ""}
                        </td>
                        <td
                          className="sticky z-10 bg-white text-copper-900 border-r border-copper-200 whitespace-normal leading-snug"
                          style={{ left: STICKY_JENIS_LEFT, width: COL_JENIS }}
                        >
                          {row.baris.jenis_nama}
                        </td>
                        {data.banjar.map((b) => (
                          <td key={b.id} className="text-right tabular-nums px-1 text-[11px]">
                            {formatRekapKramaAngka(row.baris.per_banjar[b.id] ?? 0)}
                          </td>
                        ))}
                        <td className="text-right tabular-nums font-medium px-1 text-[11px]">
                          {formatRekapKramaAngka(row.baris.total)}
                        </td>
                      </tr>
                    );
                  }

                  if (row.kind === "subtotal") {
                    return (
                      <tr
                        key={tableRowKey(row, idx)}
                        className="border-t border-copper-200 bg-copper-50/70 font-bold text-copper-950"
                      >
                        <td
                          colSpan={3}
                          className="sticky left-0 z-10 bg-copper-50/95 border-r border-copper-200"
                        >
                          Subtotal {row.klasifikasi_nama}
                        </td>
                        {data.banjar.map((b) => (
                          <td key={b.id} className="text-right tabular-nums px-1 text-[11px]">
                            {formatRekapKramaAngka(row.per_banjar[b.id] ?? 0, true)}
                          </td>
                        ))}
                        <td className="text-right tabular-nums px-1 text-[11px]">
                          {formatRekapKramaAngka(row.total, true)}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={tableRowKey(row, idx)}
                      className="border-t-2 border-copper-300 bg-copper-50/80 font-bold text-copper-950"
                    >
                      <td
                        colSpan={3}
                        className="sticky left-0 z-10 bg-copper-50/95 border-r border-copper-200"
                      >
                        Total Keseluruhan
                      </td>
                      {data.banjar.map((b) => (
                        <td key={b.id} className="text-right tabular-nums px-1 text-[11px]">
                          {formatRekapKramaAngka(row.per_banjar[b.id] ?? 0, true)}
                        </td>
                      ))}
                      <td className="text-right tabular-nums px-1 text-[11px]">
                        {formatRekapKramaAngka(row.total, true)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
