import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../lib/page-filter-state";
import { Link, useSearchParams } from "react-router-dom";
import { useLaporanPdfNavigate } from "../hooks/useLaporanPdfNavigate";
import { useTableSort } from "../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../lib/pagination";
import { sortTableRows } from "../lib/table-sort";
import { DUDUKAN_SORT } from "../lib/table-sort-accessors";
import { SortableTableHead } from "../components/ui/SortableTableHead";
import {
  getDudukanRingkasan,
  loadDudukanListAndRingkasanBulan,
  listBanjar,
  type DudukanKramaSearchRow,
  type DudukanRingkasan,
  type RingkasanBulanDudukan,
} from "../lib/services/dudukan";
import { listJenisKramaTamiu, listJenisTamiu } from "../lib/services/master";
import { listRtBtnPemasih } from "../lib/services/krama";
import {
  bulanSaatIni,
  formatBulanIndonesia,
  formatRupiah,
  isPeriodeDudukanLewat,
  tahunSaatIni,
} from "../lib/dudukan-hitung";
import { KeuanganImportExportPanel } from "../components/keuangan/KeuanganImportExportPanel";
import {
  KARTU_DUDUKAN_BATCH_MAX,
} from "../lib/services/jadwal-dudukan";
import { stashKartuDudukanBulkPreview } from "../lib/laporan-pdf-preview";
import { dudukanPagePath, parseDudukanPageTab, applyPageTabToSearchParams } from "../lib/page-tab-url";
import { DudukanWhatsAppButton } from "../components/dudukan/DudukanWhatsAppButton";
import { DudukanPembayaranDialog } from "../components/dudukan/DudukanPembayaranDialog";
import { DudukanRiwayatPanel } from "../components/dudukan/DudukanRiwayatPanel";
import { DudukanTunggakanPanel } from "../components/dudukan/DudukanTunggakanPanel";
import {
  PembayaranSavedBanner,
  usePageOkFlash,
} from "../components/pembayaran/pembayaran-dialog-shared";
import type { JenisKramaTamiuRow, JenisTamiuRow, KlasifikasiKode } from "../lib/types";
import { cn } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { canDeleteFinancialTransaction, canEditKeuangan } from "../lib/auth-roles";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { IconLink } from "../components/ui/IconLink";
import { ListPagination } from "../components/ui/ListPagination";
import { DUDUKAN_CARD, DUDUKAN_CARD_PHONE, DUDUKAN_FILTER_GRID, DUDUKAN_FILTER_ROW, DUDUKAN_PAGE, DUDUKAN_TABLE } from "../components/dudukan/dudukan-compact";
import { LIST_BODY_ROW, LIST_HEAD_ROW, LIST_TABLE_ELEMENT } from "../components/ui/list-compact";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Eye,
  FileSpreadsheet,
  Filter,
  HandCoins,
  List,
  RotateCcw,
  UserCircle,
  Wallet,
  History,
  Printer,
} from "lucide-react";

type PageTab = "daftar" | "tunggakan" | "riwayat" | "impor";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900"
      title={label}
    >
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const PAGE_ID = "dudukan/daftar";

export function DudukanPage() {
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();
  const openPdf = useLaporanPdfNavigate();
  const canEdit = canEditKeuangan(user?.peran);
  const canDeleteFinancial = canDeleteFinancialTransaction(user?.peran);

  const bulanIni = bulanSaatIni();
  const tahunIni = tahunSaatIni();

  const [ringkasan, setRingkasan] = useState<DudukanRingkasan | null>(null);
  const [ringkasanBulan, setRingkasanBulan] = useState<RingkasanBulanDudukan | null>(null);
  const [rows, setRows] = useState<DudukanKramaSearchRow[]>([]);
  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);

  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);
  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");
  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");
  const [punyaTunggakan, setPunyaTunggakan] = usePersistedScalar(PAGE_ID, "punyaTunggakan", false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importFlash, setImportFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const [bayarKramaId, setBayarKramaId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab = useMemo(
    () => parseDudukanPageTab(searchParams.get("tab")),
    [searchParams]
  );
  const setPageTab = useCallback(
    (tab: PageTab) => {
      setSearchParams(applyPageTabToSearchParams(searchParams, tab, "daftar"), { replace: true });
    },
    [searchParams, setSearchParams]
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [riwayatRefresh, setRiwayatRefresh] = useState(0);
  const [printingKartu, setPrintingKartu] = useState(false);
  const { okFlashMessage, showOkFlash } = usePageOkFlash();

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, DUDUKAN_SORT),
    [rows, sortKey, sortDir]
  );
  const safePage = useMemo(
    () => clampPage(page, sortedRows.length, pageSize),
    [page, sortedRows.length, pageSize]
  );
  const pagedRows = useMemo(
    () => paginateSlice(sortedRows, safePage, pageSize),
    [sortedRows, safePage, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;
  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;

  const initialKeringananPeriode = useMemo(() => {
    if (searchParams.get("aksi") !== "keringanan") return null;
    const tahun = Number(searchParams.get("tahun"));
    const bulan = Number(searchParams.get("bulan"));
    if (!Number.isFinite(tahun) || !Number.isFinite(bulan)) return null;
    return { tahun, bulan };
  }, [searchParams]);

  useEffect(() => {
    const bayar = searchParams.get("bayar");
    if (bayar) setBayarKramaId(bayar);
  }, [searchParams]);

  function tutupModalBayar() {
    setBayarKramaId(null);
    if (
      searchParams.has("bayar") ||
      searchParams.has("tahun") ||
      searchParams.has("bulan") ||
      searchParams.has("aksi")
    ) {
      const next = new URLSearchParams(searchParams);
      next.delete("bayar");
      next.delete("tahun");
      next.delete("bulan");
      next.delete("aksi");
      setSearchParams(next, { replace: true });
    }
  }

  const load = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const filterKlas = klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined;

      const [r, { list, ringkasanBulan: ringkasanB }, b, jkt, jt] = await Promise.all([
        getDudukanRingkasan(),
        loadDudukanListAndRingkasanBulan(
          {
            q: debouncedQ || undefined,
            banjarId: banjarId || undefined,
            klasifikasi: filterKlas,
            jenisKramaTamiuId,
            jenisTamiuId,
            rtBtn: rtBtn || undefined,
            punyaTunggakan: punyaTunggakan || undefined,
          },
          tahunIni,
          bulanIni
        ),
        listBanjar(),
        listJenisKramaTamiu(),
        listJenisTamiu(),
      ]);
      setRingkasan(r);
      setRows(list);
      setBanjar(b);
      setJenisKt(jkt);
      setJenisT(jt);
      setRingkasanBulan(ringkasanB);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, banjarId, rtBtn, klasifikasi, jenisFilter, punyaTunggakan, jenisKramaTamiuId, jenisTamiuId, tahunIni, bulanIni]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listRtBtnPemasih({ banjarId: banjarId || undefined, statusKrama: "aktif" }).then(
      setRtBtnOptions
    );
  }, [banjarId]);

  const hasActiveFilters =
    q.trim() !== "" ||
    banjarId !== "" ||
    rtBtn !== "" ||
    klasifikasi !== "" ||
    jenisFilter !== "" ||
    punyaTunggakan;

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setBanjarId("");
    setRtBtn("");
    setKlasifikasi("");
    setJenisFilter("");
    setPunyaTunggakan(false);
    setPage(1);
  }

  async function cetakKartuHasilFilter() {
    const count = rows.length;
    if (!count) return;
    if (count > KARTU_DUDUKAN_BATCH_MAX) {
      window.alert(
        `Maksimal ${KARTU_DUDUKAN_BATCH_MAX} kartu sekaligus. Persempit filter (saat ini ${count} pemasih).`
      );
      return;
    }
    if (count > 50) {
      const ok = window.confirm(
        `Cetak ${count} Kartu Dudukan sesuai filter aktif?\n\nProses bisa memakan waktu beberapa menit.`
      );
      if (!ok) return;
    }

    setPrintingKartu(true);
    setError("");
    try {
      openPdf((backTo) =>
        stashKartuDudukanBulkPreview(rows.map((r) => r.id), backTo, "Kembali ke Dudukan")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      window.alert(msg);
    } finally {
      setPrintingKartu(false);
    }
  }

  const periodeLewat = isPeriodeDudukanLewat(tahunIni, bulanIni);

  return (
    <div className={cn(DUDUKAN_PAGE, "w-full max-w-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <HandCoins className="text-copper-700 shrink-0" size={22} />
            Dudukan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Kontribusi bulanan Krama Tamiu &amp; Tamiu · mulai 7 hari setelah pencatatan · boleh bayar di muka
            sampai akhir masa berlaku · tarif dari{" "}
            <Link to="/master" className="text-copper-800 hover:underline">
              Master (Jenis &amp; Tarif)
            </Link>
          </p>
        </div>
        <IconLink to="/krama-pemasih" icon={UserCircle} variant="secondary">
          Krama Tamiu &amp; Tamiu
        </IconLink>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      {okFlashMessage && <PembayaranSavedBanner message={okFlashMessage} />}

      <div className="flex flex-wrap gap-2">
        <Button
          variant={pageTab === "daftar" ? "primary" : "secondary"}
          icon={List}
          type="button"
          onClick={() => setPageTab("daftar")}
        >
          Daftar
        </Button>
        <Button
          variant={pageTab === "tunggakan" ? "primary" : "secondary"}
          icon={BarChart3}
          type="button"
          onClick={() => setPageTab("tunggakan")}
        >
          Tunggakan
        </Button>
        <Button
          variant={pageTab === "riwayat" ? "primary" : "secondary"}
          icon={History}
          type="button"
          onClick={() => setPageTab("riwayat")}
        >
          Riwayat
        </Button>
        <Button
          variant={pageTab === "impor" ? "primary" : "secondary"}
          icon={FileSpreadsheet}
          type="button"
          onClick={() => setPageTab("impor")}
        >
          Impor/Ekspor
        </Button>
      </div>

      {pageTab === "tunggakan" && <DudukanTunggakanPanel />}

      {pageTab === "riwayat" && (
        <DudukanRiwayatPanel
          refreshToken={riwayatRefresh}
          canEdit={canEdit}
          canDeleteFinancial={canDeleteFinancial}
          onDataChange={load}
          onBayarSaved={showOkFlash}
        />
      )}

      {pageTab === "impor" && (
        <div className="space-y-3">
          {importFlash && (
            <p
              className={cn(
                "text-sm rounded-lg px-4 py-1.5 border leading-snug",
                importFlash.kind === "ok"
                  ? "text-copper-900 bg-copper-100 border-copper-300"
                  : "text-red-600 bg-red-50 border-red-100"
              )}
            >
              {importFlash.text}
            </p>
          )}
          <KeuanganImportExportPanel
            mode="dudukan"
            canEdit={canEdit}
            alwaysOpen
            onRefresh={load}
            onSaved={(msg) => {
              setImportFlash({ kind: "ok", text: msg });
              setRiwayatRefresh((n) => n + 1);
              setTimeout(() => setImportFlash(null), 4000);
            }}
            onError={(msg) => {
              if (msg) setImportFlash({ kind: "err", text: msg });
            }}
          />
        </div>
      )}

      {pageTab === "daftar" && (
        <>
      {periodeLewat && ringkasanBulan && ringkasanBulan.jumlah_telat > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 flex items-center gap-1">
          <AlertTriangle size={14} className="shrink-0" />
          <span>
            <strong>{formatBulanIndonesia(bulanIni, tahunIni)}</strong>:{" "}
            {ringkasanBulan.jumlah_telat} belum lunas (periode lewat)
          </span>
        </div>
      )}

      <Card className={DUDUKAN_CARD}>
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          <span className="text-xs font-medium text-copper-900">
            Monitoring {formatBulanIndonesia(bulanIni, tahunIni)}
          </span>
          {ringkasan && (
            <StatChip label="Pemasih aktif" value={String(ringkasan.totalPemasihAktif)} />
          )}
          {ringkasanBulan && (
            <>
              <StatChip label="Tagihan" value={formatRupiah(ringkasanBulan.total_tagihan)} />
              <StatChip label="Terkumpul" value={formatRupiah(ringkasanBulan.total_dibayar)} />
              <StatChip label="Sisa" value={formatRupiah(ringkasanBulan.total_sisa)} />
              {ringkasanBulan.jumlah_belum_lunas > 0 && (
                <StatChip
                  label="Belum lunas"
                  value={String(ringkasanBulan.jumlah_belum_lunas)}
                />
              )}
            </>
          )}
        </div>
      </Card>

      <Card
        compact
        title="Cari krama — bayar dudukan"
        className={cn(DUDUKAN_CARD, isPhone && DUDUKAN_CARD_PHONE, DUDUKAN_TABLE)}
      >
        <div className="flex flex-wrap items-end gap-1.5 mb-1.5">
          <div className="flex-1 min-w-[min(100%,18rem)]">
            <Label className="font-semibold text-copper-900">Cari nama / no. pemasih</Label>
            <Input
              placeholder="Ketik nama pengajeg, anggota, atau no. pemasih…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="!h-10 !text-sm border-2 border-copper-400 bg-copper-50/80 shadow-sm focus:border-copper-500 focus:ring-copper-500/40"
            />
          </div>
          <div className="flex shrink-0 items-end gap-1.5 self-end">
            <Button
              variant="secondary"
              type="button"
              icon={Filter}
              iconOnly
              className="h-9 min-h-9 min-w-9 shrink-0"
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
              className="h-9 min-h-9 min-w-9 shrink-0"
              onClick={resetFilters}
              disabled={loading || !hasActiveFilters}
              title="Reset semua filter"
              aria-label="Reset semua filter"
            />
            <Button
              type="button"
              icon={Printer}
              iconOnly
              className="h-9 min-h-9 min-w-9 shrink-0"
              disabled={loading || printingKartu || rows.length === 0}
              onClick={() => void cetakKartuHasilFilter()}
              title={
                printingKartu
                  ? "Menyiapkan PDF kartu dudukan…"
                  : rows.length === 0
                    ? "Tidak ada pemasih pada filter"
                    : rows.length > KARTU_DUDUKAN_BATCH_MAX
                      ? `Cetak kartu dudukan — maks. ${KARTU_DUDUKAN_BATCH_MAX} (filter: ${rows.length})`
                      : `Cetak Kartu Dudukan (${rows.length} pemasih)`
              }
              aria-label={
                printingKartu
                  ? "Menyiapkan PDF kartu dudukan"
                  : rows.length === 0
                    ? "Cetak kartu dudukan — tidak ada data"
                    : rows.length > KARTU_DUDUKAN_BATCH_MAX
                      ? `Cetak kartu dudukan, maksimal ${KARTU_DUDUKAN_BATCH_MAX} pemasih`
                      : `Cetak kartu dudukan, ${rows.length} pemasih`
              }
            />
          </div>
        </div>

        <div className={DUDUKAN_FILTER_ROW}>
          <div className={cn(DUDUKAN_FILTER_GRID, "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5")}>
            <div className="min-w-0">
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
            <div className="min-w-0">
              <Label>Jenis</Label>
              <Select
                value={jenisFilter}
                onChange={(e) => setJenisFilter(e.target.value)}
              >
                <option value="">Semua</option>
                {(!klasifikasi || klasifikasi === "KRAMA_TAMIU") &&
                  jenisKt.map((j) => (
                    <option key={`kt:${j.id}`} value={`kt:${j.id}`}>
                      {j.nama} ({formatRupiah(Number(j.dudukan_nominal) || 0)})
                    </option>
                  ))}
                {(!klasifikasi || klasifikasi === "TAMIU") &&
                  jenisT.map((j) => (
                    <option key={`t:${j.id}`} value={`t:${j.id}`}>
                      {j.nama} ({formatRupiah(Number(j.dudukan_nominal) || 0)})
                    </option>
                  ))}
              </Select>
            </div>
            <div className="min-w-0">
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
            <div className="min-w-0">
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
            <div className="min-w-0">
              <Label>Tunggakan</Label>
              <Select
                value={punyaTunggakan ? "ya" : ""}
                onChange={(e) => setPunyaTunggakan(e.target.value === "ya")}
              >
                <option value="">Semua</option>
                <option value="ya">Ada tunggakan saja</option>
              </Select>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900 shrink-0 self-end">
            <span className="text-muted">Pemasih:</span>
            <span className="font-semibold tabular-nums">{rows.length}</span>
          </span>
        </div>

        {isPhone ? (
          <ul className="space-y-2">
            {pagedRows.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5",
                  r.tunggakan_bulan > 0 && "border-amber-300 bg-amber-50/90"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-copper-950">
                      {r.kepala_nama}
                    </p>
                    <p className="font-mono text-[11px] text-copper-700">{r.nomor_kartu}</p>
                  </div>
                  <span className="shrink-0 rounded border border-copper-200 bg-copper-50 px-1.5 py-0.5 text-[10px] text-copper-800">
                    {r.jenis_nama?.trim() || "—"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">
                  {[r.alamat?.trim() || null, r.banjar_nama]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p className="mt-0.5 text-[11px] text-copper-700 tabular-nums">
                  Tarif {formatRupiah(r.tarif_bulanan)}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs tabular-nums",
                    r.total_sisa > 0 && "text-amber-900 font-medium"
                  )}
                >
                  {r.tunggakan_bulan > 0 ? (
                    <>
                      Tunggakan: {r.tunggakan_bulan} bln · {formatRupiah(r.total_sisa)}
                    </>
                  ) : r.total_sisa_dimuka > 0 ? (
                    <>Di muka · {formatRupiah(r.total_sisa_dimuka)}</>
                  ) : r.lunas_keringanan_bulan > 0 ? (
                    <span className="text-violet-900 font-medium">Lunas (R)</span>
                  ) : (
                    <span className="text-green-800">Lunas</span>
                  )}
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                  <DudukanWhatsAppButton
                    nomorKontak={r.nomor_kontak}
                    kepalaNama={r.kepala_nama}
                    tunggakanBulan={r.tunggakan_bulan}
                    totalSisa={r.total_sisa}
                    bulanTunggakan={r.bulan_tunggakan_aktif}
                    kramaId={r.id}
                    label="WhatsApp"
                    className="h-10 w-full justify-center text-xs text-emerald-800"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    icon={Wallet}
                    className="h-10 justify-center text-xs"
                    onClick={() => setBayarKramaId(r.id)}
                  >
                    Bayar
                  </Button>
                  <IconLink
                    to={`/krama-pemasih/${r.id}/cetak-jadwal-dudukan`}
                    state={{
                      backTo: dudukanPagePath(pageTab),
                      backLabel: "Kembali ke Dudukan",
                    }}
                    icon={CalendarDays}
                    variant="secondary"
                    className="h-10 justify-center text-xs"
                  >
                    Kartu Dudukan
                  </IconLink>
                  <IconLink
                    to={`/krama-pemasih/${r.id}`}
                    icon={Eye}
                    variant="secondary"
                    className="h-10 justify-center text-xs"
                  >
                    Lihat Pemasih
                  </IconLink>
                </div>
              </li>
            ))}
            {!loading && pagedRows.length === 0 && (
              <li className="py-6 text-center text-xs text-muted">Tidak ada data</li>
            )}
          </ul>
        ) : (
          <div className="overflow-x-auto app-scroll-x w-full -mx-0.5">
            <table className={cn(LIST_TABLE_ELEMENT, "min-w-[640px]")}>
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <SortableTableHead
                    label="No. Pemasih"
                    columnKey="nomor_kartu"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Pengajeg"
                    columnKey="kepala_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Alamat"
                    columnKey="alamat"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="hidden md:table-cell"
                  />
                  <SortableTableHead
                    label="Jenis"
                    columnKey="jenis_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Tarif/bln"
                    columnKey="tarif_bulanan"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="hidden sm:table-cell"
                  />
                  <SortableTableHead
                    label="Tunggakan"
                    columnKey="total_sisa"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Banjar"
                    columnKey="banjar_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="hidden lg:table-cell"
                  />
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      LIST_BODY_ROW,
                      r.tunggakan_bulan > 0 && "bg-amber-50/50"
                    )}
                  >
                    <td className="font-mono text-[11px] whitespace-nowrap">{r.nomor_kartu}</td>
                    <td className="max-w-[9rem] truncate font-medium" title={r.kepala_nama}>
                      {r.kepala_nama}
                    </td>
                    <td
                      className="hidden md:table-cell max-w-[10rem] truncate"
                      title={r.alamat}
                    >
                      {r.alamat}
                    </td>
                    <td className="max-w-[6rem] truncate" title={r.jenis_nama}>
                      {r.jenis_nama}
                    </td>
                    <td className="hidden sm:table-cell tabular-nums whitespace-nowrap">
                      {formatRupiah(r.tarif_bulanan)}
                    </td>
                    <td
                      className={cn(
                        "tabular-nums whitespace-nowrap",
                        r.total_sisa > 0 && "text-amber-900 font-medium"
                      )}
                    >
                      {r.tunggakan_bulan > 0 ? (
                        <>
                          {r.tunggakan_bulan} bln · {formatRupiah(r.total_sisa)}
                        </>
                      ) : r.total_sisa_dimuka > 0 ? (
                        <>Di muka · {formatRupiah(r.total_sisa_dimuka)}</>
                      ) : r.lunas_keringanan_bulan > 0 ? (
                        <span className="text-violet-900 font-medium">Lunas (R)</span>
                      ) : (
                        <span className="text-green-800">Lunas</span>
                      )}
                    </td>
                    <td
                      className="hidden lg:table-cell max-w-[5rem] truncate"
                      title={r.banjar_nama}
                    >
                      {r.banjar_nama}
                    </td>
                    <td>
                      <span className="inline-flex gap-0.5">
                        <DudukanWhatsAppButton
                          nomorKontak={r.nomor_kontak}
                          kepalaNama={r.kepala_nama}
                          tunggakanBulan={r.tunggakan_bulan}
                          totalSisa={r.total_sisa}
                          bulanTunggakan={r.bulan_tunggakan_aktif}
                          kramaId={r.id}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          icon={Wallet}
                          iconOnly
                          title="Bayar dudukan"
                          className="min-h-7 min-w-7"
                          onClick={() => setBayarKramaId(r.id)}
                        />
                        <IconLink
                          to={`/krama-pemasih/${r.id}/cetak-jadwal-dudukan`}
                          state={{
                            backTo: dudukanPagePath(pageTab),
                            backLabel: "Kembali ke Dudukan",
                          }}
                          icon={CalendarDays}
                          iconOnly
                          variant="ghost"
                          title="Kartu Dudukan"
                          aria-label="Kartu Dudukan"
                        />
                        <IconLink
                          to={`/krama-pemasih/${r.id}`}
                          icon={Eye}
                          iconOnly
                          variant="ghost"
                          title="Lihat Pemasih"
                          aria-label="Lihat Pemasih"
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !rows.length && (
              <p className="text-center py-3 text-xs text-muted">Tidak ada data</p>
            )}
          </div>
        )}
        {loading && <p className="text-center py-3 text-xs text-muted">Memuat…</p>}
        {!loading && (
          <ListPagination
            page={safePage}
            totalItems={rows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        )}
      </Card>
        </>
      )}

      {bayarKramaId && (
        <DudukanPembayaranDialog
          open={!!bayarKramaId}
          onClose={tutupModalBayar}
          onSuccess={load}
          onSaved={showOkFlash}
          canEdit={canEdit}
          canDeleteFinancial={canDeleteFinancial}
          kramaId={bayarKramaId}
          initialKeringananPeriode={initialKeringananPeriode}
        />
      )}
    </div>
  );
}
