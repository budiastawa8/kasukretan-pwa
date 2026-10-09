import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { bulanSaatIni, formatRupiah, tahunSaatIni } from "../../lib/dudukan-hitung";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  getLaporanKeringananDudukan,
  type LaporanKeringananDudukanRingkasan,
  type LaporanKeringananDudukanRow,
} from "../../lib/services/laporan-keringanan-dudukan";
import { listBanjar } from "../../lib/services/master";
import type { KlasifikasiKode } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import { ListPagination } from "../../components/ui/ListPagination";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import {
  ArrowLeft,
  Filter,
  HandCoins,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const BULAN_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

const PAGE_ID = "laporan/keringanan-dudukan";

export function LaporanKeringananDudukanPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Audit Keringanan");
  const bulanIni = bulanSaatIni();
  const tahunIni = tahunSaatIni();

  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [ringkasan, setRingkasan] = useState<LaporanKeringananDudukanRingkasan | null>(null);
  const [rows, setRows] = useState<LaporanKeringananDudukanRow[]>([]);

  const [filterTahun, setFilterTahun] = usePersistedScalar(PAGE_ID, "filterTahun", "");
  const [filterBulan, setFilterBulan] = usePersistedScalar(PAGE_ID, "filterBulan", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const safePage = useMemo(() => clampPage(page, rows.length, pageSize), [page, rows.length, pageSize]);
  const pagedRows = useMemo(() => paginateSlice(rows, safePage, pageSize), [rows, safePage, pageSize]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    listBanjar().then(setBanjar);
  }, []);

  const load = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const result = await getLaporanKeringananDudukan({
        tahun: filterTahun ? Number(filterTahun) : undefined,
        bulan: filterBulan ? Number(filterBulan) : undefined,
        banjarId: banjarId || undefined,
        klasifikasi: klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined,
        q: q || undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filterTahun, filterBulan, banjarId, klasifikasi, q]);

  useEffect(() => {
    load();
  }, [load]);

  const hasFilters = filterTahun || filterBulan || banjarId || klasifikasi || q.trim();

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setFilterTahun("");
    setFilterBulan("");
    setBanjarId("");
    setKlasifikasi("");
    setQ("");
  }

  function exportExcel() {
    if (rows.length === 0) return;
    void downloadExcel("audit-keringanan-dudukan", {
      name: "Keringanan",
      headers: [
        "Periode",
        "No. Pemasih",
        "Pengajeg",
        "Banjar",
        "Tagihan",
        "Dibayar",
        "Keringanan",
        "Tanggal keputusan",
        "Petugas",
        "Alasan",
      ],
      rows: rows.map((r) => [
        r.periode_label,
        r.nomor_kartu,
        r.kepala_nama,
        r.banjar_nama,
        r.tagihan,
        r.dibayar,
        r.jumlah,
        r.tanggal,
        r.petugas_nama ?? "—",
        r.keterangan ?? "",
      ]),
    });
  }

  function exportPdf() {
    if (rows.length === 0) return;
    const headers = [
      "Periode",
      "No. Pemasih",
      "Pengajeg",
      "Banjar",
      "Tagihan",
      "Dibayar",
      "Keringanan",
      "Tanggal keputusan",
      "Petugas",
      "Alasan",
    ];
    const periode =
      filterTahun && filterBulan
        ? `${filterBulan}/${filterTahun}`
        : filterTahun
          ? `Tahun ${filterTahun}`
          : "Semua periode";
    const summary = ringkasan
      ? [
          `Periode filter: ${periode}`,
          `Keputusan: ${ringkasan.total_record} · Krama: ${ringkasan.total_krama} · Total keringanan: ${formatRupiah(ringkasan.total_keringanan)}`,
        ]
      : [`Periode filter: ${periode}`];
    openPdfPreview({
      filename: "audit-keringanan-dudukan",
      judul: "Laporan Audit Keringanan Dudukan",
      periode,
      headers,
      rows: rows.map((r) => [
        r.periode_label,
        r.nomor_kartu,
        r.kepala_nama,
        r.banjar_nama,
        r.tagihan,
        r.dibayar,
        r.jumlah,
        formatTanggalLahir(r.tanggal),
        r.petugas_nama ?? "—",
        r.keterangan ?? "",
      ]),
      summaryLines: summary,
      columnFractions: [0.1, 0.11, 0.14, 0.1, 0.09, 0.09, 0.09, 0.1, 0.1, 0.18],
      alignRight: [4, 5, 6],
    });
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <ShieldCheck className="text-violet-700" size={22} />
            Audit Keringanan Dudukan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Daftar keputusan keringanan — bukan uang masuk, untuk audit pengurus.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">Laporan</IconLink>
          <IconLink to="/laporan/dudukan" icon={HandCoins} variant="secondary">Laporan Dudukan</IconLink>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">{error}</p>
      )}

      {ringkasan && (
        <Card className={LAPORAN_CARD}>
          <div className="flex flex-wrap gap-1">
            <StatChip label="Keputusan" value={String(ringkasan.total_record)} />
            <StatChip label="Krama" value={String(ringkasan.total_krama)} />
            <StatChip label="Total keringanan" value={formatRupiah(ringkasan.total_keringanan)} />
          </div>
        </Card>
      )}

      <Card title="Riwayat keringanan" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
        <div className="flex flex-wrap items-end gap-1.5 mb-2">
          <div className="min-w-[90px]">
            <Label className="text-[11px]">Tahun</Label>
            <Input
              className="text-sm h-9"
              type="number"
              placeholder="Semua"
              value={filterTahun}
              onChange={(e) => setFilterTahun(e.target.value)}
            />
          </div>
          <div className="min-w-[90px]">
            <Label className="text-[11px]">Bulan</Label>
            <Select className="text-sm h-9" value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)}>
              <option value="">Semua</option>
              {BULAN_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </div>
          <div className="flex-1 min-w-[120px]">
            <Label className="text-[11px]">Cari</Label>
            <Input className="text-sm h-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama / no. pemasih…" />
          </div>
          <div className="min-w-[110px]">
            <Label className="text-[11px]">Klasifikasi</Label>
            <Select className="text-sm h-9" value={klasifikasi} onChange={(e) => setKlasifikasi(e.target.value)}>
              <option value="">Semua</option>
              <option value="KRAMA_TAMIU">Krama Tamiu</option>
              <option value="TAMIU">Tamiu</option>
            </Select>
          </div>
          <div className="min-w-[100px]">
            <Label className="text-[11px]">Banjar</Label>
            <Select className="text-sm h-9" value={banjarId} onChange={(e) => setBanjarId(e.target.value)}>
              <option value="">Semua</option>
              {banjar.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
            </Select>
          </div>
          <Button
            variant="secondary"
            type="button"
            icon={Filter}
            iconOnly
            className={cn("shrink-0", isPhone ? "min-h-11 min-w-11" : "min-h-9 min-w-9")}
            onClick={load}
            disabled={loading}
            title="Terapkan filter"
            aria-label="Terapkan filter"
          />
          <Button
            variant="secondary"
            type="button"
            icon={RotateCcw}
            iconOnly
            className={cn("shrink-0", isPhone ? "min-h-11 min-w-11" : "min-h-9 min-w-9")}
            onClick={resetFilters}
            disabled={!hasFilters}
            title="Reset filter"
            aria-label="Reset filter"
          />
          <LaporanExportButtons onExcel={exportExcel} onPdf={exportPdf} excelDisabled={rows.length === 0} pdfDisabled={rows.length === 0} />
        </div>

        {isPhone ? (
          <ul className="space-y-2">
            {loading ? (
              <li className="py-4 text-center text-muted text-xs">Memuat…</li>
            ) : pagedRows.length === 0 ? (
              <li className="py-4 text-center text-muted text-xs">Belum ada keringanan.</li>
            ) : (
              pagedRows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-copper-950">{r.kepala_nama}</p>
                    <p className="font-mono text-[11px] text-copper-700">{r.nomor_kartu}</p>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-muted">
                    {[r.periode_label, r.banjar_nama].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                    <span className="text-copper-900">
                      <span className="text-muted">Tagihan:</span> {formatRupiah(r.tagihan)}
                    </span>
                    <span className="text-copper-900">
                      <span className="text-muted">Dibayar:</span> {formatRupiah(r.dibayar)}
                    </span>
                    <span className="font-medium text-violet-800">
                      <span className="text-muted font-normal">Keringanan:</span> {formatRupiah(r.jumlah)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-copper-800">
                    {formatTanggalLahir(r.tanggal)} · {r.petugas_nama ?? "—"}
                  </p>
                  {r.keterangan && (
                    <p className="mt-0.5 text-[11px] text-muted line-clamp-2" title={r.keterangan}>
                      {r.keterangan}
                    </p>
                  )}
                </li>
              ))
            )}
          </ul>
        ) : (
        <div className="overflow-x-auto">
          <table className={LAPORAN_TABLE_ELEMENT}>
            <thead>
              <tr className={LAPORAN_HEAD_ROW}>
                <th>Periode</th>
                <th>No. Pemasih</th>
                <th>Pengajeg</th>
                <th>Banjar</th>
                <th className="text-right">Tagihan</th>
                <th className="text-right">Dibayar</th>
                <th className="text-right">Keringanan</th>
                <th>Tanggal</th>
                <th>Petugas</th>
                <th>Alasan</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="py-4 text-center text-muted text-xs">Memuat…</td></tr>
              ) : pagedRows.length === 0 ? (
                <tr><td colSpan={10} className="py-4 text-center text-muted text-xs">Belum ada keringanan.</td></tr>
              ) : (
                pagedRows.map((r) => (
                  <tr key={r.id} className="border-b border-copper-50">
                    <td className="text-xs whitespace-nowrap">{r.periode_label}</td>
                    <td className="font-mono text-xs">{r.nomor_kartu}</td>
                    <td>{r.kepala_nama}</td>
                    <td className="text-xs">{r.banjar_nama}</td>
                    <td className="text-right tabular-nums">{formatRupiah(r.tagihan)}</td>
                    <td className="text-right tabular-nums">{formatRupiah(r.dibayar)}</td>
                    <td className="text-right tabular-nums font-medium text-violet-800">{formatRupiah(r.jumlah)}</td>
                    <td className="text-xs whitespace-nowrap">{formatTanggalLahir(r.tanggal)}</td>
                    <td className="text-xs">{r.petugas_nama ?? "—"}</td>
                    <td className="text-xs max-w-[160px] truncate" title={r.keterangan ?? ""}>{r.keterangan ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        )}
        <ListPagination
          page={safePage}
          totalItems={rows.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          className="mt-2"
        />
      </Card>

      <p className="text-[11px] text-muted">
        Tip: kosongkan tahun/bulan untuk melihat seluruh riwayat. Default periode berjalan: {tahunIni}/{bulanIni}.
      </p>
    </div>
  );
}
