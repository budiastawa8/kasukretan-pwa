import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useNavigate } from "react-router-dom";
import { formatBulanIndonesiaSingkat, formatRupiah } from "../../lib/dudukan-hitung";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  getLaporanPertimbanganKeringananDudukan,
  type LaporanPertimbanganKeringananDudukanRingkasan,
} from "../../lib/services/laporan-pertimbangan-keringanan-dudukan";
import type { DudukanPertimbanganKeringananRow } from "../../lib/services/dudukan";
import { listRtBtnPemasih } from "../../lib/services/krama";
import { listBanjar, listJenisKramaTamiu, listJenisTamiu } from "../../lib/services/master";
import type { JenisKramaTamiuRow, JenisTamiuRow, KlasifikasiKode } from "../../lib/types";
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
import { LIST_FILTER_ROW } from "../../components/ui/list-compact";
import {
  AlertTriangle,
  ArrowLeft,
  HandCoins,
  RotateCcw,
  Scale,
} from "lucide-react";

const TABLE_COLS =
  "[&_colgroup_col:nth-child(1)]:w-[9%] [&_colgroup_col:nth-child(2)]:w-[12%] [&_colgroup_col:nth-child(3)]:w-[16%] [&_colgroup_col:nth-child(4)]:w-[11%] [&_colgroup_col:nth-child(5)]:w-[9%] [&_colgroup_col:nth-child(6)]:w-[10%] [&_colgroup_col:nth-child(7)]:w-[11%] [&_colgroup_col:nth-child(8)]:w-[11%] [&_colgroup_col:nth-child(9)]:w-[11%]";

const EXPORT_HEADERS = [
  "No. Pemasih",
  "Pengajeg",
  "Alamat",
  "Banjar",
  "Periode",
  "Tgl. transaksi",
  "Tagihan",
  "Dibayar",
  "Sisa",
];

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-[11px] text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function mapExportRow(r: DudukanPertimbanganKeringananRow): (string | number)[] {
  return [
    r.nomor_kartu,
    r.kepala_nama,
    r.alamat,
    r.banjar_nama,
    formatBulanIndonesiaSingkat(r.bulan, r.tahun),
    r.tanggal_transaksi ? formatTanggalLahir(r.tanggal_transaksi) : "",
    r.tagihan,
    r.dibayar,
    r.sisa,
  ];
}

function keringananUrl(r: DudukanPertimbanganKeringananRow): string {
  const params = new URLSearchParams({
    bayar: r.id,
    tahun: String(r.tahun),
    bulan: String(r.bulan),
    aksi: "keringanan",
  });
  return `/dudukan?${params.toString()}`;
}

function rowKey(r: DudukanPertimbanganKeringananRow): string {
  return `${r.id}-${r.tahun}-${r.bulan}`;
}

const PAGE_ID = "laporan/pertimbangan-keringanan-dudukan";

export function LaporanPertimbanganKeringananDudukanPage() {
  const isPhone = useIsPhoneClient();
  const navigate = useNavigate();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Pertimbangan Keringanan");
  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);
  const [ringkasan, setRingkasan] =
    useState<LaporanPertimbanganKeringananDudukanRingkasan | null>(null);
  const [rows, setRows] = useState<DudukanPertimbanganKeringananRow[]>([]);

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");
  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");
  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;
  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;

  const safePage = useMemo(() => clampPage(page, rows.length, pageSize), [page, rows.length, pageSize]);
  const pagedRows = useMemo(() => paginateSlice(rows, safePage, pageSize), [rows, safePage, pageSize]);

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
    try {
      const result = await getLaporanPertimbanganKeringananDudukan({
        banjarId: banjarId || undefined,
        klasifikasi: klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined,
        jenisKramaTamiuId,
        jenisTamiuId,
        rtBtn: rtBtn || undefined,
        q: debouncedQ || undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [banjarId, klasifikasi, jenisKramaTamiuId, jenisTamiuId, rtBtn, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setKlasifikasi("");
    setJenisFilter("");
    setBanjarId("");
    setRtBtn("");
  }

  function exportExcel() {
    if (rows.length === 0) return;
    void downloadExcel("pertimbangan-keringanan", [
      {
        name: "Daftar",
        headers: EXPORT_HEADERS,
        rows: rows.map(mapExportRow),
      },
    ]);
  }

  function exportPdf() {
    if (rows.length === 0) return;
    const summary = ringkasan
      ? [
          `Periode cicil: ${ringkasan.total_periode}`,
          `Krama: ${ringkasan.total_krama}`,
          `Total sisa: ${formatRupiah(ringkasan.total_sisa)}`,
          ringkasan.jumlah_telat > 0 ? `Bulan telat: ${ringkasan.jumlah_telat}` : "",
        ].filter(Boolean)
      : undefined;
    openPdfPreview({
      filename: "pertimbangan-keringanan",
      judul: "Pertimbangan Keringanan",
      periode: "Pembayaran cicil tanpa keputusan keringanan — hingga bulan berjalan",
      headers: EXPORT_HEADERS,
      rows: rows.map(mapExportRow),
      summaryLines: summary,
      alignRight: [6, 7, 8],
    });
  }

  function bukaKeringanan(r: DudukanPertimbanganKeringananRow) {
    navigate(keringananUrl(r));
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <Scale className="text-copper-700" size={22} />
            Pertimbangan Keringanan
          </h2>
          <p className="text-[11px] text-muted mt-0.5">
            Periode dudukan status cicil — sudah bayar sebagian, belum lunas, belum ada keringanan.
            Klik baris untuk membuka pemberian keringanan.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <IconLink to="/laporan/dudukan" icon={HandCoins} variant="secondary">
            Laporan Dudukan
          </IconLink>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      {ringkasan && (
        <Card className={LAPORAN_CARD}>
          <div className="flex flex-wrap gap-1">
            <StatChip label="Periode cicil" value={String(ringkasan.total_periode)} />
            <StatChip label="Krama" value={String(ringkasan.total_krama)} />
            <StatChip label="Total sisa" value={formatRupiah(ringkasan.total_sisa)} />
            {ringkasan.jumlah_telat > 0 && (
              <StatChip label="Bulan telat" value={String(ringkasan.jumlah_telat)} />
            )}
          </div>
        </Card>
      )}

      <Card title="Daftar pertimbangan" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
        <div
          className={cn(
            LIST_FILTER_ROW,
            "[&_label]:!text-[11px] [&_input]:!h-8 [&_select]:!h-8 [&_input]:!text-xs [&_select]:!text-xs"
          )}
        >
          <div className="flex-1 min-w-[140px]">
            <Label>Cari</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nama / no. pemasih / alamat…"
            />
          </div>
          <div className="min-w-[110px]">
            <Label>Klasifikasi</Label>
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
            <Label>Jenis</Label>
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
            <Label>Banjar</Label>
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
            <Label>RT/BTN</Label>
            <Select value={rtBtn} onChange={(e) => setRtBtn(e.target.value)}>
              <option value="">Semua</option>
              {rtBtnOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <LaporanExportButtons
            onExcel={exportExcel}
            onPdf={exportPdf}
            excelDisabled={rows.length === 0}
            pdfDisabled={rows.length === 0}
          />
          <Button
            type="button"
            variant="secondary"
            icon={RotateCcw}
            iconOnly
            className={cn("shrink-0", isPhone ? "min-h-11 min-w-11" : "min-h-9 min-w-9")}
            onClick={resetFilters}
            title="Reset filter"
            aria-label="Reset filter"
          />
        </div>

        {isPhone ? (
          <ul className="space-y-2">
            {loading ? (
              <li className="py-3 text-center text-muted text-xs">Memuat…</li>
            ) : pagedRows.length === 0 ? (
              <li className="py-3 text-center text-muted text-xs">
                Tidak ada periode cicil yang perlu dipertimbangkan.
              </li>
            ) : (
              pagedRows.map((r) => {
                const periode = formatBulanIndonesiaSingkat(r.bulan, r.tahun);
                return (
                  <li
                    key={rowKey(r)}
                    className={cn(
                      "rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5 cursor-pointer active:bg-violet-50/50",
                      r.telat && "border-amber-200/90"
                    )}
                    title="Buka pemberian keringanan"
                    onClick={() => bukaKeringanan(r)}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-copper-950">{r.kepala_nama}</p>
                      <p className="font-mono text-[11px] text-copper-700">{r.nomor_kartu}</p>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted">
                      {[r.alamat, r.banjar_nama].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className={cn("mt-1 text-xs", r.telat && "text-amber-900")}>
                      {r.telat && <AlertTriangle size={11} className="inline mr-0.5 shrink-0" />}
                      {periode}
                      {r.tanggal_transaksi ? (
                        <span className="text-muted"> · {formatTanggalLahir(r.tanggal_transaksi)}</span>
                      ) : null}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                      <span className="text-copper-900">
                        <span className="text-muted">Tagihan:</span> {formatRupiah(r.tagihan)}
                      </span>
                      <span className="text-copper-900">
                        <span className="text-muted">Dibayar:</span> {formatRupiah(r.dibayar)}
                      </span>
                      <span className="font-medium text-amber-900">
                        <span className="text-muted font-normal">Sisa:</span> {formatRupiah(r.sisa)}
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        ) : (
        <div className="overflow-x-auto">
          <table className={cn(LAPORAN_TABLE_ELEMENT, "table-fixed w-full", TABLE_COLS)}>
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
              <tr className={LAPORAN_HEAD_ROW}>
                <th>No. Pemasih</th>
                <th>Pengajeg</th>
                <th>Alamat</th>
                <th>Banjar</th>
                <th>Periode</th>
                <th>Tgl. transaksi</th>
                <th className="text-right">Tagihan</th>
                <th className="text-right">Dibayar</th>
                <th className="text-right">Sisa</th>
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
                    Tidak ada periode cicil yang perlu dipertimbangkan.
                  </td>
                </tr>
              ) : (
                pagedRows.map((r) => {
                  const periode = formatBulanIndonesiaSingkat(r.bulan, r.tahun);
                  return (
                    <tr
                      key={rowKey(r)}
                      className={cn(
                        "border-b border-copper-50 cursor-pointer hover:bg-violet-50/50 transition-colors",
                        r.telat && "hover:bg-amber-50/60"
                      )}
                      title="Buka pemberian keringanan"
                      onClick={() => bukaKeringanan(r)}
                    >
                      <td className="font-mono text-[11px] truncate">{r.nomor_kartu}</td>
                      <td className="truncate" title={r.kepala_nama}>
                        {r.kepala_nama}
                      </td>
                      <td className="truncate" title={r.alamat}>
                        {r.alamat}
                      </td>
                      <td className="truncate" title={r.banjar_nama}>
                        {r.banjar_nama}
                      </td>
                      <td
                        className={cn("text-[11px] whitespace-nowrap", r.telat && "text-amber-900")}
                        title={r.telat ? `${periode} (telat)` : periode}
                      >
                        {r.telat && (
                          <AlertTriangle size={11} className="inline mr-0.5 shrink-0" />
                        )}
                        {periode}
                      </td>
                      <td className="text-[11px] whitespace-nowrap tabular-nums">
                        {r.tanggal_transaksi ? formatTanggalLahir(r.tanggal_transaksi) : "—"}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {formatRupiah(r.tagihan)}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {formatRupiah(r.dibayar)}
                      </td>
                      <td className="text-right tabular-nums font-medium whitespace-nowrap">
                        {formatRupiah(r.sisa)}
                      </td>
                    </tr>
                  );
                })
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
          compact
        />
      </Card>
    </div>
  );
}
