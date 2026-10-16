import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";
import { stashSuratPenagihanDudukanPreview, stashTunggakanDudukanPreview } from "../../lib/laporan-pdf-preview";
import { buildTunggakanDudukanPdfPayload } from "../../lib/tunggakan-dudukan-pdf";
import { buildSuratPenagihanPdfPayload } from "../../lib/surat-penagihan-dudukan-pdf";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import {
  formatBulanIndonesiaSingkat,
  formatRupiah,
  formatTunggakanPeriodeRingkas,
} from "../../lib/dudukan-hitung";
import {
  listDudukanTunggakanLaporan,
  listBanjar,
  type DudukanTunggakanBulan,
  type DudukanTunggakanLaporanRow,
} from "../../lib/services/dudukan";
import { getDesaAdatWithMedia } from "../../lib/services/desa";
import {
  issueSuratPenagihanBatch,
  MIN_BULAN_SURAT_PENAGIHAN,
} from "../../lib/services/surat-penagihan-dudukan";
import { listRtBtnPemasih } from "../../lib/services/krama";
import { listJenisKramaTamiu, listJenisTamiu } from "../../lib/services/master";
import type { JenisKramaTamiuRow, JenisTamiuRow, KlasifikasiKode } from "../../lib/types";
import { cn } from "../../lib/utils";
import { LaporanExportButtons } from "../laporan/LaporanExportButtons";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Label, Select } from "../ui/Input";
import { ListPagination } from "../ui/ListPagination";
import { DudukanWhatsAppButton } from "./DudukanWhatsAppButton";
import { DUDUKAN_CARD } from "./dudukan-compact";
import { LIST_FILTER_ROW, LIST_HEAD_ROW, LIST_TABLE_ELEMENT } from "../ui/list-compact";
import { AlertTriangle, Filter, Printer, RotateCcw } from "lucide-react";

const TUNGGKAN_TABLE_COLS =
  "[&_colgroup_col:nth-child(1)]:w-[9%] [&_colgroup_col:nth-child(2)]:w-[calc(11%+50pt)] [&_colgroup_col:nth-child(3)]:w-[calc(17%+50pt)] [&_colgroup_col:nth-child(4)]:w-[10%] [&_colgroup_col:nth-child(5)]:w-[9%] [&_colgroup_col:nth-child(6)]:w-[10%] [&_colgroup_col:nth-child(7)]:w-[7%] [&_colgroup_col:nth-child(8)]:w-[15%] [&_colgroup_col:nth-child(9)]:w-[6.5rem]";

const BULAN_JATUH_TEMPO_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function periodeTooltip(bulan: DudukanTunggakanBulan[]): string {
  return bulan
    .map(
      (b) =>
        `${formatBulanIndonesiaSingkat(b.bulan, b.tahun)} ${formatRupiah(b.sisa)}${b.telat ? " (telat)" : ""}`
    )
    .join(" · ");
}

function rowPeriodeLabel(bulan: DudukanTunggakanBulan[]): string {
  const ringkas = formatTunggakanPeriodeRingkas(bulan);
  if (bulan.length <= 1) return ringkas;
  return `${ringkas} (${bulan.length} bln)`;
}

const EXPORT_HEADERS = [
  "No. Pemasih",
  "Pengajeg",
  "Alamat",
  "Jenis",
  "Banjar",
  "Jumlah",
  "Jml Bln",
  "Periode",
] as const;

function mapExportRow(r: DudukanTunggakanLaporanRow): (string | number)[] {
  return [
    r.nomor_kartu,
    r.kepala_nama,
    r.alamat,
    r.jenis_nama,
    r.banjar_nama,
    r.total_sisa,
    r.tunggakan_bulan,
    rowPeriodeLabel(r.bulan_tunggakan),
  ];
}

const PAGE_ID = "dudukan/tunggakan";

export function DudukanTunggakanPanel() {
  const openPdf = useLaporanPdfNavigate();
  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [rows, setRows] = useState<DudukanTunggakanLaporanRow[]>([]);

  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);
  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");
  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");
  const [filterTahun, setFilterTahun] = usePersistedScalar(PAGE_ID, "filterTahun", "");
  const [filterBulan, setFilterBulan] = usePersistedScalar(PAGE_ID, "filterBulan", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;
  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;

  const safePage = useMemo(() => clampPage(page, rows.length, pageSize), [page, rows.length, pageSize]);
  const pagedRows = useMemo(() => paginateSlice(rows, safePage, pageSize), [rows, safePage, pageSize]);

  const totalSisa = useMemo(
    () => rows.reduce((sum, r) => sum + r.total_sisa, 0),
    [rows]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    Promise.all([listBanjar(), listJenisKramaTamiu(), listJenisTamiu()]).then(([b, jkt, jt]) => {
      setBanjar(b);
      setJenisKt(jkt);
      setJenisT(jt);
    });
  }, []);

  useEffect(() => {
    listRtBtnPemasih({ banjarId: banjarId || undefined, statusKrama: "aktif" }).then(
      setRtBtnOptions
    );
  }, [banjarId]);

  const load = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    const tahun = filterTahun ? Number(filterTahun) : undefined;
    const bulan = filterBulan ? Number(filterBulan) : undefined;
    try {
      const data = await listDudukanTunggakanLaporan({
        q: debouncedQ || undefined,
        banjarId: banjarId || undefined,
        klasifikasi: klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined,
        jenisKramaTamiuId,
        jenisTamiuId,
        rtBtn: rtBtn || undefined,
        tahun: tahun && Number.isFinite(tahun) ? tahun : undefined,
        bulan: bulan && Number.isFinite(bulan) ? bulan : undefined,
      });
      setRows(data);
    } catch (e) {
      setError(String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, banjarId, klasifikasi, jenisKramaTamiuId, jenisTamiuId, rtBtn, filterTahun, filterBulan]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActiveFilters =
    debouncedQ !== "" ||
    banjarId !== "" ||
    rtBtn !== "" ||
    klasifikasi !== "" ||
    jenisFilter !== "" ||
    filterTahun !== "" ||
    filterBulan !== "";

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setBanjarId("");
    setRtBtn("");
    setKlasifikasi("");
    setJenisFilter("");
    setFilterTahun("");
    setFilterBulan("");
    setPage(1);
  }

  function exportExcel() {
    if (rows.length === 0) return;
    const detailRows: (string | number)[][] = [];
    for (const r of rows) {
      for (const b of r.bulan_tunggakan) {
        detailRows.push([
          r.nomor_kartu,
          r.kepala_nama,
          r.alamat,
          r.jenis_nama,
          r.banjar_nama,
          formatBulanIndonesiaSingkat(b.bulan, b.tahun),
          b.sisa,
          b.telat ? "Telat" : "",
        ]);
      }
    }
    void downloadExcel("tunggakan-dudukan", [
      {
        name: "Ringkas",
        headers: [...EXPORT_HEADERS],
        rows: rows.map(mapExportRow),
      },
      {
        name: "Detail per bulan",
        headers: [
          "No. Pemasih",
          "Pengajeg",
          "Alamat",
          "Jenis",
          "Banjar",
          "Periode",
          "Sisa",
          "Status",
        ],
        rows: detailRows,
      },
    ]);
  }

  function exportPdf() {
    if (rows.length === 0) return;
    try {
      openPdf((backTo) =>
        stashTunggakanDudukanPreview(buildTunggakanDudukanPdfPayload(rows), backTo, "Kembali ke Dudukan")
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function printSuratPenagihan(kramaId: string) {
    setPrintingId(kramaId);
    setError("");
    try {
      const desa = await getDesaAdatWithMedia();
      if (!desa) throw new Error("Data desa adat belum ada.");
      const issued = await issueSuratPenagihanBatch([kramaId]);
      const { surat, row } = issued[0]!;
      const payload = buildSuratPenagihanPdfPayload(desa, surat, row);
      openPdf((backTo) =>
        stashSuratPenagihanDudukanPreview([payload], backTo, "Kembali ke Dudukan")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      window.alert(msg);
    } finally {
      setPrintingId(null);
    }
  }

  return (
    <Card className={DUDUKAN_CARD}>
      <p className="text-xs text-muted mb-2">
        Sisa tagihan hingga bulan berjalan (tidak termasuk bayar di muka).
        {filterTahun && filterBulan ? (
          <>
            {" "}
            Filter aktif: hanya periode{" "}
            <strong>
              {formatBulanIndonesiaSingkat(Number(filterBulan), Number(filterTahun))}
            </strong>
            .
          </>
        ) : null}
      </p>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1 mb-2">
          {error}
        </p>
      )}

      <div className={cn(LIST_FILTER_ROW, "mb-2")}>
        <div className="flex-1 min-w-[140px]">
          <Label className="text-xs">Cari</Label>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nama / no. pemasih / alamat…"
          />
        </div>
        <div className="min-w-[110px]">
          <Label className="text-xs">Klasifikasi</Label>
          <Select
            value={klasifikasi}
            onChange={(e) => {
              setKlasifikasi(e.target.value);
              setJenisFilter("");
            }}
          >
            <option value="">Semua</option>
            <option value="KRAMA_TAMIU">Krama Tamiu</option>
            <option value="TAMIU">Tamiu</option>
          </Select>
        </div>
        <div className="min-w-[120px]">
          <Label className="text-xs">Jenis</Label>
          <Select value={jenisFilter} onChange={(e) => setJenisFilter(e.target.value)}>
            <option value="">Semua</option>
            {(!klasifikasi || klasifikasi === "KRAMA_TAMIU") &&
              jenisKt.map((j) => (
                <option key={`kt:${j.id}`} value={`kt:${j.id}`}>
                  {j.nama}
                </option>
              ))}
            {(!klasifikasi || klasifikasi === "TAMIU") &&
              jenisT.map((j) => (
                <option key={`t:${j.id}`} value={`t:${j.id}`}>
                  {j.nama}
                </option>
              ))}
          </Select>
        </div>
        <div className="min-w-[100px]">
          <Label className="text-xs">Banjar</Label>
          <Select
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
        <div className="min-w-[90px]">
          <Label className="text-xs">RT/BTN</Label>
          <Select value={rtBtn} onChange={(e) => setRtBtn(e.target.value)}>
            <option value="">Semua</option>
            {rtBtnOptions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <div className="min-w-[80px]">
          <Label className="text-xs">Tahun jatuh tempo</Label>
          <Input
            type="number"
            placeholder="Semua"
            value={filterTahun}
            onChange={(e) => setFilterTahun(e.target.value)}
          />
        </div>
        <div className="min-w-[100px]">
          <Label className="text-xs">Bulan jatuh tempo</Label>
          <Select value={filterBulan} onChange={(e) => setFilterBulan(e.target.value)}>
            <option value="">Semua</option>
            {BULAN_JATUH_TEMPO_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </div>
        <LaporanExportButtons
          onExcel={exportExcel}
          onPdf={exportPdf}
          excelDisabled={rows.length === 0}
          pdfDisabled={rows.length === 0}
          iconOnly
        />
        <Button
          variant="secondary"
          type="button"
          icon={Filter}
          iconOnly
          className="min-h-9 min-w-9 shrink-0"
          onClick={() => void load()}
          disabled={loading}
          title="Terapkan filter"
          aria-label="Terapkan filter"
        />
        <Button
          variant="secondary"
          type="button"
          icon={RotateCcw}
          iconOnly
          className="min-h-9 min-w-9 shrink-0"
          onClick={resetFilters}
          disabled={loading || !hasActiveFilters}
          title="Reset semua filter"
          aria-label="Reset semua filter"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        <StatChip label="Pemasih" value={String(rows.length)} />
        <StatChip label="Total sisa" value={formatRupiah(totalSisa)} />
      </div>

      <div className="overflow-x-auto -mx-0.5">
        <table className={cn(LIST_TABLE_ELEMENT, "table-fixed w-full", TUNGGKAN_TABLE_COLS)}>
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr className={LIST_HEAD_ROW}>
              <th>No. Pemasih</th>
              <th>Pengajeg</th>
              <th>Alamat</th>
              <th>Jenis</th>
              <th>Banjar</th>
              <th className="text-right">Jumlah</th>
              <th className="text-right">Jml Bln</th>
              <th>Periode</th>
              <th className="text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="py-3 text-center text-muted text-xs">
                  Memuat…
                </td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-3 text-center text-muted text-xs">
                  Tidak ada tunggakan.
                </td>
              </tr>
            ) : (
              pagedRows.map((r) => {
                const adaTelat = r.bulan_tunggakan.some((b) => b.telat);
                const periode = rowPeriodeLabel(r.bulan_tunggakan);
                const eligibleSp = r.tunggakan_bulan >= MIN_BULAN_SURAT_PENAGIHAN;
                const busy = printingId === r.id;
                return (
                  <tr
                    key={r.id}
                    className={cn("border-b border-copper-50", adaTelat && "bg-amber-50/50")}
                  >
                    <td className="font-mono text-[11px] truncate">{r.nomor_kartu}</td>
                    <td className="truncate font-medium" title={r.kepala_nama}>
                      {r.kepala_nama}
                    </td>
                    <td className="truncate" title={r.alamat}>
                      {r.alamat}
                    </td>
                    <td className="truncate" title={r.jenis_nama}>
                      {r.jenis_nama}
                    </td>
                    <td className="truncate" title={r.banjar_nama}>
                      {r.banjar_nama}
                    </td>
                    <td className="text-right tabular-nums font-medium whitespace-nowrap">
                      {formatRupiah(r.total_sisa)}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {r.tunggakan_bulan}
                    </td>
                    <td
                      className={cn("text-[11px] truncate", adaTelat && "text-amber-900")}
                      title={periodeTooltip(r.bulan_tunggakan)}
                    >
                      {adaTelat && (
                        <AlertTriangle size={11} className="inline mr-0.5 shrink-0" />
                      )}
                      {periode}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon={Printer}
                          iconOnly
                          disabled={!eligibleSp || busy || printingId !== null}
                          title={
                            eligibleSp
                              ? "Terbitkan / cetak surat penagihan"
                              : `Syarat surat penagihan: tunggakan minimal ${MIN_BULAN_SURAT_PENAGIHAN} bulan`
                          }
                          aria-label={
                            eligibleSp
                              ? "Terbitkan / cetak surat penagihan"
                              : `Surat penagihan membutuhkan tunggakan minimal ${MIN_BULAN_SURAT_PENAGIHAN} bulan`
                          }
                          onClick={() => void printSuratPenagihan(r.id)}
                        />
                        <DudukanWhatsAppButton
                          nomorKontak={r.nomor_kontak}
                          kepalaNama={r.kepala_nama}
                          tunggakanBulan={r.tunggakan_bulan}
                          totalSisa={r.total_sisa}
                          bulanTunggakan={r.bulan_tunggakan}
                          kramaId={r.id}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && rows.length > 0 && (
        <ListPagination
          page={safePage}
          totalItems={rows.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          className="mt-2"
          compact
        />
      )}
    </Card>
  );
}
