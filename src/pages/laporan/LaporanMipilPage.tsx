import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useSearchParams } from "react-router-dom";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { useTableSort } from "../../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { sortTableRows } from "../../lib/table-sort";
import { KRAMA_MIPIL_SORT } from "../../lib/table-sort-accessors";
import { SortableTableHead } from "../../components/ui/SortableTableHead";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { buildLaporanMipilPdfInput } from "../../lib/laporan-mipil-pdf";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  buildDemografiExcelRows,
  RekapDemografiMipilPanel,
} from "../../components/laporan/RekapDemografiMipilPanel";
import { StatistikJiwaMipilPanel, type StatistikJiwaJenis } from "../../components/laporan/StatistikJiwaMipilPanel";
import {
  getRekapDemografiMipil,
  type RekapDemografiMipil,
  type RekapDemografiMipilFilter,
} from "../../lib/services/laporan-demografi-mipil";
import { getDesaAdat } from "../../lib/services/desa";
import {
  daftarStatistikJiwaMipil,
  getLaporanStatistikJiwaMipil,
  kriteriaStatistikJiwaJenis,
  labelStatistikJiwaJenis,
  type LaporanStatistikJiwaMipil,
} from "../../lib/services/statistik-jiwa-mipil";
import {
  formatStatusPipilRow,
  getLaporanMipil,
  type LaporanMipilRingkasan,
} from "../../lib/services/laporan-mipil";
import { listArahan, listBanjar, listJenisMipil, listTempek } from "../../lib/services/master";
import type { Arahan, Banjar, JenisKramaMipilRow, KramaListItem, Tempek } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
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
import {
  ArrowLeft,
  BarChart3,
  Filter,
  PieChart,
  RotateCcw,
  Sparkles,
  Users,
} from "lucide-react";

type ViewTab = "statistik" | "demografi" | "daftar";

function parseViewTab(raw: string | null): ViewTab {
  if (raw === "statistik" || raw === "demografi" || raw === "daftar") return raw;
  return "daftar";
}

function parseJenisFocus(raw: string | null): StatistikJiwaJenis | null {
  if (raw === "yowana" || raw === "wredha" || raw === "balu_lanang" || raw === "balu_istri") return raw;
  return null;
}

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

const PAGE_ID = "laporan/mipil";

export function LaporanMipilPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Mipil");
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewTab, setViewTab] = usePersistedScalar<ViewTab>(PAGE_ID, "viewTab", "daftar");
  const [statistikJenis, setStatistikJenis] = usePersistedScalar<StatistikJiwaJenis>(
    PAGE_ID,
    "statistikJenis",
    "yowana"
  );
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [ringkasan, setRingkasan] = useState<LaporanMipilRingkasan | null>(null);
  const [rows, setRows] = useState<KramaListItem[]>([]);
  const [demografi, setDemografi] = useState<RekapDemografiMipil | null>(null);
  const [statistikJiwa, setStatistikJiwa] = useState<LaporanStatistikJiwaMipil | null>(null);

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [tempekId, setTempekId] = usePersistedScalar(PAGE_ID, "tempekId", "");
  const [arahanId, setArahanId] = usePersistedScalar(PAGE_ID, "arahanId", "");
  const [jenisMipilId, setJenisMipilId] = usePersistedScalar(PAGE_ID, "jenisMipilId", "");
  const [statusPipil, setStatusPipil] = usePersistedScalar(PAGE_ID, "statusPipil", "");
  const [statistikBanjarId, setStatistikBanjarId] = usePersistedScalar(PAGE_ID, "statistikBanjarId", "");
  const [statistikTempekId, setStatistikTempekId] = usePersistedScalar(PAGE_ID, "statistikTempekId", "");
  const [statistikJenisKelamin, setStatistikJenisKelamin] = usePersistedScalar(
    PAGE_ID,
    "statistikJenisKelamin",
    ""
  );
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [arahan, setArahan] = useState<Arahan[]>([]);
  const [statistikTempekList, setStatistikTempekList] = useState<Tempek[]>([]);
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [loading, setLoading] = useState(true);
  const [loadingDemografi, setLoadingDemografi] = useState(false);
  const [loadingStatistik, setLoadingStatistik] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const filterBase = useMemo(
    (): RekapDemografiMipilFilter => ({
      banjarId: banjarId || undefined,
      tempekId: tempekId || undefined,
      arahanId: arahanId || undefined,
      jenisMipilId: jenisMipilId || undefined,
      statusPipil: statusPipil
        ? (statusPipil as RekapDemografiMipilFilter["statusPipil"])
        : undefined,
    }),
    [banjarId, tempekId, arahanId, jenisMipilId, statusPipil]
  );

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, KRAMA_MIPIL_SORT),
    [rows, sortKey, sortDir]
  );
  const safePage = useMemo(() => clampPage(page, sortedRows.length, pageSize), [page, sortedRows.length, pageSize]);
  const pagedRows = useMemo(() => paginateSlice(sortedRows, safePage, pageSize), [sortedRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const loadDaftar = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const result = await getLaporanMipil({
        ...filterBase,
        q: q || undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filterBase, q]);

  const loadDemografi = useCallback(async () => {
    setLoadingDemografi(true);
    setError("");
    try {
      const result = await getRekapDemografiMipil(filterBase);
      setDemografi(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingDemografi(false);
    }
  }, [filterBase]);

  const loadStatistik = useCallback(async () => {
    setLoadingStatistik(true);
    setError("");
    try {
      const desa = await getDesaAdat();
      const result = await getLaporanStatistikJiwaMipil(
        {
          yowanaUmurMin: desa?.yowana_umur_min,
          yowanaUmurMax: desa?.yowana_umur_max,
          batasUmurNyada: desa?.jenis_umur_nyada,
        },
        {
          banjarId: statistikBanjarId || undefined,
          tempekId: statistikTempekId || undefined,
          jenisKelamin: statistikJenisKelamin || undefined,
        }
      );
      setStatistikJiwa(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingStatistik(false);
    }
  }, [statistikBanjarId, statistikTempekId, statistikJenisKelamin]);

  useEffect(() => {
    Promise.all([listBanjar(), listJenisMipil()]).then(([b, j]) => {
      setBanjar(b);
      setJenisMipil(j);
    });
  }, []);

  useEffect(() => {
    if (!statistikBanjarId) {
      setStatistikTempekList([]);
      setStatistikTempekId("");
      return;
    }
    void listTempek(statistikBanjarId).then((list) => {
      setStatistikTempekList(list);
      setStatistikTempekId((cur) => (cur && list.some((t) => t.id === cur) ? cur : ""));
    });
  }, [statistikBanjarId, setStatistikTempekId]);

  useEffect(() => {
    if (!banjarId) {
      setTempek([]);
      setTempekId("");
      setArahan([]);
      setArahanId("");
      return;
    }
    void listTempek(banjarId).then((list) => {
      setTempek(list);
      setTempekId((cur) => (cur && list.some((t) => t.id === cur) ? cur : ""));
    });
  }, [banjarId, setTempekId]);

  useEffect(() => {
    if (!tempekId) {
      setArahan([]);
      setArahanId("");
      return;
    }
    void listArahan(tempekId).then((list) => {
      setArahan(list);
      setArahanId((cur) => (cur && list.some((a) => a.id === cur) ? cur : ""));
    });
  }, [tempekId, setArahanId]);

  useEffect(() => {
    void loadDaftar();
  }, [loadDaftar]);

  useEffect(() => {
    if (viewTab === "demografi") void loadDemografi();
  }, [viewTab, loadDemografi]);

  useEffect(() => {
    if (viewTab === "statistik") void loadStatistik();
  }, [viewTab, loadStatistik]);

  function selectTab(tab: ViewTab) {
    setViewTab(tab);
    if (tab === "daftar") {
      setSearchParams({}, { replace: true });
    } else if (tab === "statistik") {
      setSearchParams({ tab: "statistik", jenis: statistikJenis }, { replace: true });
    } else {
      setSearchParams({ tab: "demografi" }, { replace: true });
    }
  }

  function selectStatistikJenis(jenis: StatistikJiwaJenis) {
    setStatistikJenis(jenis);
    setSearchParams({ tab: "statistik", jenis }, { replace: true });
  }

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) setViewTab(parseViewTab(tabParam));
    const jenis = parseJenisFocus(searchParams.get("jenis"));
    if (jenis) setStatistikJenis(jenis);
  }, [searchParams, setViewTab, setStatistikJenis]);

  const hasActiveFilters =
    viewTab === "statistik"
      ? statistikBanjarId !== "" || statistikTempekId !== "" || statistikJenisKelamin !== ""
      : q.trim() !== "" ||
        banjarId !== "" ||
        tempekId !== "" ||
        arahanId !== "" ||
        jenisMipilId !== "" ||
        statusPipil !== "";

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    if (viewTab === "statistik") {
      setStatistikBanjarId("");
      setStatistikTempekId("");
      setStatistikJenisKelamin("");
    } else {
      setQ("");
      setBanjarId("");
      setTempekId("");
      setArahanId("");
      setJenisMipilId("");
      setStatusPipil("");
      setPage(1);
    }
  }

  function applyFilter() {
    if (viewTab === "daftar") void loadDaftar();
    else if (viewTab === "demografi") void loadDemografi();
    else void loadStatistik();
  }

  const tabLoading =
    viewTab === "daftar" ? loading : viewTab === "demografi" ? loadingDemografi : loadingStatistik;

  function exportExcelDaftar() {
    if (rows.length === 0) return;
    const headers = [
      "No. Pipil",
      "Pengarep",
      "Jenis",
      "Banjar",
      "Tempek",
      "Arahan",
      "Status Pipil",
      "Tgl. Terdaftar",
    ];
    const data = rows.map((r) => [
      r.nomor_kartu,
      r.kepala_nama,
      r.jenis_nama ?? "—",
      r.banjar_nama,
      r.tempek_nama ?? "—",
      r.arahan_nama ?? "—",
      formatStatusPipilRow(r),
      r.tanggal_terdaftar,
    ]);
    void downloadExcel("laporan-krama-mipil", { name: "Data", headers, rows: data });
  }

  function exportPdfDaftar() {
    if (rows.length === 0) return;
    const metaLines: string[] = [];
    if (banjarId) {
      metaLines.push(`BANJAR ADAT: ${banjar.find((b) => b.id === banjarId)?.nama ?? "—"}`);
    }
    if (tempekId) {
      metaLines.push(`TEMPEK: ${tempek.find((t) => t.id === tempekId)?.nama ?? "—"}`);
    }
    if (arahanId) {
      metaLines.push(`ARAHAN: ${arahan.find((a) => a.id === arahanId)?.nama ?? "—"}`);
    }
    openPdfPreview(buildLaporanMipilPdfInput({ rows, ringkasan, metaLines }));
  }

  function exportExcelDemografi() {
    if (!demografi || demografi.total_jiwa === 0) return;
    const table = buildDemografiExcelRows(demografi);
    const headers = table[0]!.map(String);
    const data = table.slice(1);
    void downloadExcel("rekap-demografi-mipil", { name: "Demografi", headers, rows: data });
  }

  function exportPdfDemografi() {
    if (!demografi || demografi.total_jiwa === 0) return;
    const table = buildDemografiExcelRows(demografi);
    const headers = table[0]!.map(String);
    const dataRows = table.slice(1);
    openPdfPreview({
      filename: "rekap-demografi-mipil",
      judul: "Rekap Demografi Krama Mipil",
      subjudul: "Semua anggota aktif per banjar",
      periode: "Kelompok usia standar BPS · filter saat ini",
      headers,
      rows: dataRows,
      summaryLines: [`Total jiwa: ${demografi.total_jiwa}`],
      orientation: "landscape",
      alignRight: [3],
    });
  }

  const demografiEmpty = !demografi || demografi.total_jiwa === 0;

  const statistikExportRows = useMemo(() => {
    if (!statistikJiwa) return [];
    return daftarStatistikJiwaMipil(statistikJiwa, statistikJenis);
  }, [statistikJiwa, statistikJenis]);

  function statistikFilterLabel(): string {
    const parts: string[] = [];
    if (statistikBanjarId) {
      parts.push(`Banjar: ${banjar.find((b) => b.id === statistikBanjarId)?.nama ?? "—"}`);
    }
    if (statistikTempekId) {
      parts.push(`Tempek: ${statistikTempekList.find((t) => t.id === statistikTempekId)?.nama ?? "—"}`);
    }
    if (statistikJenisKelamin === "L") parts.push("JK: Laki-laki");
    if (statistikJenisKelamin === "P") parts.push("JK: Perempuan");
    return parts.length > 0 ? parts.join(" · ") : "Semua banjar";
  }

  function exportExcelStatistik() {
    if (statistikExportRows.length === 0) return;
    const label = labelStatistikJiwaJenis(statistikJenis);
    const headers = ["No. Pipil", "Nama", "JK", "Umur", "Status kawin", "Banjar", "Tempek"];
    const data = statistikExportRows.map((r) => [
      r.nomor_kartu,
      r.nama_lengkap,
      r.jenis_kelamin,
      r.umur > 0 ? r.umur : "",
      r.status_kawin_label,
      `${r.banjar_kode} — ${r.banjar_nama}`,
      r.tempek_nama,
    ]);
    void downloadExcel(`statistik-jiwa-${statistikJenis}-mipil`, {
      name: label,
      headers,
      rows: data,
    });
  }

  function exportPdfStatistik() {
    if (statistikExportRows.length === 0 || !statistikJiwa) return;
    const label = labelStatistikJiwaJenis(statistikJenis);
    const kriteria = kriteriaStatistikJiwaJenis(statistikJiwa, statistikJenis);
    const sortHint =
      statistikJenis === "balu_lanang" || statistikJenis === "balu_istri" ? "urut nama A–Z" : "urut umur A–Z";
    openPdfPreview({
      filename: `statistik-jiwa-${statistikJenis}-mipil`,
      judul: `Statistik Jiwa Mipil — ${label}`,
      periode: `${kriteria} · ${statistikFilterLabel()} · ${sortHint}`,
      headers: ["No. Pipil", "Nama", "JK", "Umur", "Status kawin", "Banjar", "Tempek"],
      rows: statistikExportRows.map((r) => [
        r.nomor_kartu,
        r.nama_lengkap,
        r.jenis_kelamin,
        r.umur > 0 ? r.umur : "—",
        r.status_kawin_label,
        `${r.banjar_kode} — ${r.banjar_nama}`,
        r.tempek_nama,
      ]),
      summaryLines: [`Jumlah ${label}: ${statistikExportRows.length}`],
      alignRight: [3],
    });
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <BarChart3 className="text-copper-700 shrink-0" size={22} />
            Laporan Krama Mipil
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Daftar Pipil, statistik jiwa (Yowana, Wredha, Balu), dan rekap demografi.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <IconLink to="/krama-mipil" icon={Users} variant="secondary">
            Krama Mipil
          </IconLink>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex gap-1 p-0.5 rounded-md bg-copper-100/80 border border-copper-200 w-fit">
        {(
          [
            ["daftar", "Daftar Pipil", Users],
            ["statistik", "Statistik Jiwa", Sparkles],
            ["demografi", "Demografi", PieChart],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1 text-xs rounded font-medium",
              viewTab === id ? "bg-white text-copper-900 shadow-sm" : "text-muted"
            )}
            onClick={() => selectTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {viewTab === "daftar" && ringkasan && (
        <Card className={LAPORAN_CARD}>
          <div className="flex flex-wrap items-center gap-1">
            <StatChip label="Krama aktif" value={String(ringkasan.total_krama)} />
            <StatChip label="Pipil aktif" value={String(ringkasan.jumlah_pipil_aktif)} />
            <StatChip
              label="Pipil tidak aktif"
              value={String(ringkasan.jumlah_pipil_tidak_aktif)}
            />
          </div>
          {ringkasan.perJenis.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 mt-1 border-t border-copper-100">
              {ringkasan.perJenis.map((j) => (
                <span
                  key={j.jenis_nama}
                  className="text-[11px] text-copper-800 bg-white border border-copper-100 rounded px-1.5 py-0.5"
                >
                  {j.jenis_nama}: {j.jumlah}
                </span>
              ))}
            </div>
          )}
          {ringkasan.perBanjar.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 mt-1 border-t border-copper-100">
              {ringkasan.perBanjar.map((b) => (
                <span
                  key={b.banjar_nama}
                  className="text-[11px] text-copper-700 bg-copper-50/50 border border-copper-100 rounded px-1.5 py-0.5"
                >
                  {b.banjar_nama}: {b.jumlah}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {viewTab === "demografi" && demografi && demografi.total_jiwa > 0 && (
        <Card className={LAPORAN_CARD}>
          <div className="flex flex-wrap items-center gap-1">
            <StatChip label="Total jiwa" value={String(demografi.total_jiwa)} />
            <StatChip label="Banjar" value={String(demografi.banjar.length)} />
          </div>
        </Card>
      )}

      <Card
        title={
          viewTab === "daftar"
            ? "Daftar krama"
            : viewTab === "demografi"
              ? "Rekap demografi per banjar"
              : "Statistik jiwa Mipil"
        }
        className={cn(
          LAPORAN_CARD,
          viewTab === "daftar" && isPhone && LAPORAN_CARD_PHONE,
          viewTab === "daftar" && LAPORAN_TABLE
        )}
      >
        <div className="flex flex-wrap items-end gap-1.5 mb-2">
          {viewTab === "daftar" && (
            <div className="flex-1 min-w-[120px]">
              <Label className="text-[11px]">Cari</Label>
              <Input
                className="text-sm h-9"
                placeholder="No. pipil, pengarep…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
          {viewTab === "statistik" ? (
            <>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Banjar</Label>
                <Select
                  className="text-sm h-9"
                  value={statistikBanjarId}
                  onChange={(e) => setStatistikBanjarId(e.target.value)}
                >
                  <option value="">Semua</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Tempek</Label>
                <Select
                  className="text-sm h-9"
                  value={statistikTempekId}
                  onChange={(e) => setStatistikTempekId(e.target.value)}
                  disabled={!statistikBanjarId}
                >
                  <option value="">{statistikBanjarId ? "Semua" : "Pilih banjar dulu"}</option>
                  {statistikTempekList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Jenis kelamin</Label>
                <Select
                  className="text-sm h-9"
                  value={statistikJenisKelamin}
                  onChange={(e) => setStatistikJenisKelamin(e.target.value)}
                >
                  <option value="">Semua</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </Select>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-[110px]">
                <Label className="text-[11px]">Jenis krama</Label>
                <Select
                  className="text-sm h-9"
                  value={jenisMipilId}
                  onChange={(e) => setJenisMipilId(e.target.value)}
                >
                  <option value="">Semua</option>
                  {jenisMipil.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Banjar</Label>
                <Select
                  className="text-sm h-9"
                  value={banjarId}
                  onChange={(e) => setBanjarId(e.target.value)}
                >
                  <option value="">Semua</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Tempek</Label>
                <Select
                  className="text-sm h-9"
                  value={tempekId}
                  onChange={(e) => setTempekId(e.target.value)}
                  disabled={!banjarId}
                >
                  <option value="">{banjarId ? "Semua" : "Pilih banjar dulu"}</option>
                  {tempek.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Arahan</Label>
                <Select
                  className="text-sm h-9"
                  value={arahanId}
                  onChange={(e) => setArahanId(e.target.value)}
                  disabled={!tempekId}
                >
                  <option value="">{tempekId ? "Semua" : "Pilih tempek dulu"}</option>
                  {arahan.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[110px]">
                <Label className="text-[11px]">Status Pipil</Label>
                <Select
                  className="text-sm h-9"
                  value={statusPipil}
                  onChange={(e) => setStatusPipil(e.target.value)}
                >
                  <option value="">Semua</option>
                  <option value="aktif">Aktif</option>
                  <option value="tidak_aktif">Tidak aktif</option>
                </Select>
              </div>
            </>
          )}
          <Button
            variant="secondary"
            type="button"
            icon={Filter}
            className="h-9 text-xs shrink-0"
            onClick={applyFilter}
            disabled={tabLoading}
          >
            Filter
          </Button>
          <Button
            variant="secondary"
            type="button"
            icon={RotateCcw}
            className="h-9 text-xs shrink-0"
            onClick={resetFilters}
            disabled={tabLoading || !hasActiveFilters}
          >
            Reset
          </Button>
          {viewTab === "statistik" ? (
            <LaporanExportButtons
              onExcel={exportExcelStatistik}
              onPdf={exportPdfStatistik}
              disabled={tabLoading}
              excelDisabled={statistikExportRows.length === 0}
              pdfDisabled={statistikExportRows.length === 0}
            />
          ) : (
            <LaporanExportButtons
              onExcel={viewTab === "daftar" ? exportExcelDaftar : exportExcelDemografi}
              onPdf={viewTab === "daftar" ? exportPdfDaftar : exportPdfDemografi}
              disabled={tabLoading}
              excelDisabled={viewTab === "daftar" ? rows.length === 0 : demografiEmpty}
              pdfDisabled={viewTab === "daftar" ? rows.length === 0 : demografiEmpty}
            />
          )}
        </div>

        {viewTab === "statistik" ? (
          <StatistikJiwaMipilPanel
            data={statistikJiwa}
            loading={loadingStatistik}
            activeJenis={statistikJenis}
            onJenisChange={selectStatistikJenis}
          />
        ) : viewTab === "daftar" ? (
          <>
            {isPhone ? (
              <ul className="space-y-2">
                {loading ? (
                  <li className="py-4 text-center text-muted text-xs">Memuat…</li>
                ) : pagedRows.length === 0 ? (
                  <li className="py-4 text-center text-muted text-xs">Tidak ada data.</li>
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
                        {[r.jenis_nama ?? null, r.banjar_nama, r.tempek_nama ?? null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-copper-800">
                        <span>{formatStatusPipilRow(r)}</span>
                        <span className="text-muted">·</span>
                        <span className="whitespace-nowrap">
                          Terdaftar {formatTanggalLahir(r.tanggal_terdaftar)}
                        </span>
                      </p>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="overflow-x-auto -mx-0.5">
                <table className={LAPORAN_TABLE_ELEMENT}>
                  <thead>
                    <tr className={LAPORAN_HEAD_ROW}>
                      <SortableTableHead label="No. Pipil" columnKey="nomor_kartu" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTableHead label="Pengarep" columnKey="kepala_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTableHead label="Jenis" columnKey="jenis_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTableHead label="Banjar" columnKey="banjar_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTableHead label="Tempek" columnKey="tempek_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTableHead label="Status Pipil" columnKey="status_pipil" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                      <SortableTableHead label="Terdaftar" columnKey="tanggal_terdaftar" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-muted text-xs">
                          Memuat…
                        </td>
                      </tr>
                    ) : pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-muted text-xs">
                          Tidak ada data.
                        </td>
                      </tr>
                    ) : (
                      pagedRows.map((r) => (
                        <tr key={r.id} className={LAPORAN_BODY_ROW}>
                          <td className="font-mono text-xs">{r.nomor_kartu}</td>
                          <td>{r.kepala_nama}</td>
                          <td className="text-xs">{r.jenis_nama ?? "—"}</td>
                          <td className="text-xs">{r.banjar_nama}</td>
                          <td className="text-xs">{r.tempek_nama ?? "—"}</td>
                          <td className="text-xs">{formatStatusPipilRow(r)}</td>
                          <td className="text-xs whitespace-nowrap">
                            {formatTanggalLahir(r.tanggal_terdaftar)}
                          </td>
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
          </>
        ) : (
          <RekapDemografiMipilPanel data={demografi} loading={loadingDemografi} />
        )}
      </Card>
    </div>
  );
}
