import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePersistedScalar } from "../lib/page-filter-state";
import { useTableSort } from "../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE } from "../lib/pagination";
import { PATURUNAN_SORT } from "../lib/table-sort-accessors";
import { SortableTableHead } from "../components/ui/SortableTableHead";
import { Link, useSearchParams } from "react-router-dom";
import {
  countKramaPaturunan,
  getPaturunanRingkasan,
  getRingkasanIuran,
  listBanjar,
  listKramaPaturunan,
  listPeringatanIuranAktif,
  type PaturunanKramaRow,
  type PaturunanRingkasan,
  type PeringatanIuranItem,
  type RingkasanIuran,
} from "../lib/services/paturunan";
import {
  createIuranPaturunan,
  deleteIuranPaturunan,
  listIuranPaturunan,
  updateIuranPaturunan,
} from "../lib/services/iuran-paturunan";
import { listJenisMipil, listTempek } from "../lib/services/master";
import { formatRupiah, isPastTanggalTarget } from "../lib/paturunan-hitung";
import { KeuanganImportExportPanel } from "../components/keuangan/KeuanganImportExportPanel";
import { PaturunanPembayaranDialog } from "../components/paturunan/PaturunanPembayaranDialog";
import { PaturunanRiwayatPanel } from "../components/paturunan/PaturunanRiwayatPanel";
import {
  PembayaranSavedBanner,
  usePageOkFlash,
} from "../components/pembayaran/pembayaran-dialog-shared";
import {
  applyPageTabToSearchParams,
  parsePaturunanPageTab,
  paturunanPagePath,
} from "../lib/page-tab-url";
import { PaturunanStatusBadge } from "../components/paturunan/PaturunanStatusBadge";
import { PaturunanWhatsAppButton } from "../components/paturunan/PaturunanWhatsAppButton";
import { FieldHint } from "../components/pembayaran/pembayaran-dialog-shared";
import { normalizeTanggalIsoForInput } from "../lib/date-iso";
import type { Banjar, IuranPaturunanRow, JenisKramaMipilRow, Tempek } from "../lib/types";
import { cn, formatTanggalLahir } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { canDeleteFinancialTransaction, canEditKeuangan } from "../lib/auth-roles";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { RupiahInput } from "../components/ui/RupiahInput";
import type { RupiahInputValue } from "../lib/rupiah-input";
import { DateInput } from "../components/ui/DateInput";
import { IconLink } from "../components/ui/IconLink";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ListPagination } from "../components/ui/ListPagination";
import {
  PATURUNAN_CARD,
  PATURUNAN_CARD_PHONE,
  PATURUNAN_FILTER_GRID,
  PATURUNAN_PAGE,
  PATURUNAN_TABLE,
} from "../components/paturunan/paturunan-compact";
import { LIST_BODY_ROW, LIST_HEAD_ROW, LIST_TABLE_ELEMENT } from "../components/ui/list-compact";
import {
  Coins,
  Eye,
  FileSpreadsheet,
  Filter,
  List,
  RotateCcw,
  Users,
  Plus,
  Check,
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Wallet,
  History,
} from "lucide-react";

type PageTab = "daftar" | "riwayat" | "impor";

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

const PAGE_ID = "paturunan/daftar";

export function PaturunanPage() {
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();
  const canEdit = canEditKeuangan(user?.peran);
  const canDeleteFinancial = canDeleteFinancialTransaction(user?.peran);

  const [ringkasan, setRingkasan] = useState<PaturunanRingkasan | null>(null);
  const [ringkasanIuran, setRingkasanIuran] = useState<RingkasanIuran | null>(null);
  const [rows, setRows] = useState<PaturunanKramaRow[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [iuranList, setIuranList] = useState<IuranPaturunanRow[]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [tempekId, setTempekId] = usePersistedScalar(PAGE_ID, "tempekId", "");
  const [jenisMipilId, setJenisMipilId] = usePersistedScalar(PAGE_ID, "jenisMipilId", "");
  const [iuranId, setIuranId] = usePersistedScalar(PAGE_ID, "iuranId", "");
  const activeIuranId = iuranId || iuranList[0]?.id || "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importFlash, setImportFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const [editingIuranId, setEditingIuranId] = useState<string | null>(null);
  const [showTambahIuran, setShowTambahIuran] = useState(false);
  const [peringatanList, setPeringatanList] = useState<PeringatanIuranItem[]>([]);
  const [tanggalTargetBaru, setTanggalTargetBaru] = useState("");
  const [newIuranNominal, setNewIuranNominal] = useState<RupiahInputValue>("");
  const [editTanggalTarget, setEditTanggalTarget] = useState("");
  const [editIuranNominal, setEditIuranNominal] = useState<RupiahInputValue>("");
  const [bayarRow, setBayarRow] = useState<PaturunanKramaRow | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab = useMemo(
    () => parsePaturunanPageTab(searchParams.get("tab")),
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
  const [deleteIuranTarget, setDeleteIuranTarget] = useState<IuranPaturunanRow | null>(null);
  const [deleteIuranBusy, setDeleteIuranBusy] = useState(false);
  const [riwayatRefresh, setRiwayatRefresh] = useState(0);
  const { okFlashMessage, showOkFlash } = usePageOkFlash();

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const safePage = useMemo(
    () => clampPage(page, totalItems, pageSize),
    [page, totalItems, pageSize]
  );
  const pagedRows = rows;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, debouncedQ, banjarId, tempekId, jenisMipilId, iuranId]);

  const selectedIuranNama = useMemo(
    () => iuranList.find((i) => i.id === activeIuranId)?.nama ?? null,
    [iuranList, activeIuranId]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const filterKey = `${debouncedQ}|${banjarId}|${tempekId}|${jenisMipilId}|${iuranId}|${sortKey}|${sortDir}|${pageSize}`;
  const lastFullLoadKey = useRef("");
  const iuranListRef = useRef(iuranList);
  iuranListRef.current = iuranList;

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      setLoading(true);
      setError("");
      try {
        // Jangan pakai iuranList.length === 0 sebagai syarat needFull:
        // desa tanpa iuran paturunan akan memicu load berulang (pagination blink / UI stuck).
        const needFull = opts?.force === true || lastFullLoadKey.current !== filterKey;
        let iuran = iuranListRef.current;

        const mastersPromise = needFull
          ? Promise.all([listBanjar(), listJenisMipil(), listIuranPaturunan()]).then(
              ([b, j, iuranRows]) => {
                setBanjar(b);
                setJenisMipil(j);
                setIuranList(iuranRows);
                iuranListRef.current = iuranRows;
                return iuranRows;
              }
            )
          : null;

        const ringkasanBg =
          needFull
            ? Promise.all([getPaturunanRingkasan(), listPeringatanIuranAktif()]).then(
                ([r, peringatan]) => {
                  setRingkasan(r);
                  setPeringatanList(peringatan);
                }
              )
            : null;

        if (iuran.length === 0) {
          iuran = mastersPromise
            ? await mastersPromise
            : await listIuranPaturunan().then((rows) => {
                setIuranList(rows);
                iuranListRef.current = rows;
                return rows;
              });
        } else if (mastersPromise) {
          void mastersPromise.catch(() => {
            /* filter master gagal — daftar tetap jalan */
          });
        }

        if (needFull) lastFullLoadKey.current = filterKey;

        const effectiveIuranId = iuranId || iuran[0]?.id || "";
        const filter = {
          q: debouncedQ || undefined,
          banjarId: banjarId || undefined,
          tempekId: tempekId || undefined,
          jenisMipilId: jenisMipilId || undefined,
          iuranId: effectiveIuranId || undefined,
        };
        const offset = (Math.max(1, page) - 1) * pageSize;
        const [list, total] = await Promise.all([
          listKramaPaturunan({
            ...filter,
            limit: pageSize,
            offset,
            orderBy: sortKey && sortKey in PATURUNAN_SORT ? sortKey : undefined,
            orderDir: sortKey ? sortDir : undefined,
          }),
          countKramaPaturunan(filter),
        ]);
        setRows(list);
        setTotalItems(total);
        setLoading(false);

        if (ringkasanBg) {
          void ringkasanBg.catch(() => {
            /* chip ringkasan opsional */
          });
        }
        if (needFull && effectiveIuranId) {
          void getRingkasanIuran(effectiveIuranId)
            .then((ringI) => setRingkasanIuran(ringI))
            .catch(() => {
              /* chip iuran opsional */
            });
        }
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    },
    [
      filterKey,
      debouncedQ,
      banjarId,
      tempekId,
      jenisMipilId,
      iuranId,
      page,
      pageSize,
      sortKey,
      sortDir,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    void load().catch((e) => {
      if (!cancelled) console.error(e);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (!banjarId) {
      setTempek([]);
      setTempekId("");
      return;
    }
    listTempek(banjarId).then(setTempek);
    setTempekId("");
  }, [banjarId]);

  const selectedIuran = iuranList.find((i) => i.id === activeIuranId);

  const hasActiveTagihanFilters =
    q.trim() !== "" ||
    banjarId !== "" ||
    tempekId !== "" ||
    jenisMipilId !== "" ||
    (iuranId !== "" && iuranList.length > 0 && iuranId !== iuranList[0].id);

  function resetTagihanFilters() {
    setQ("");
    setBanjarId("");
    setTempekId("");
    setJenisMipilId("");
    setIuranId(iuranList[0]?.id ?? "");
    setPage(1);
  }

  async function handleCreateIuran(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      const id = await createIuranPaturunan(
        String(fd.get("nama")),
        newIuranNominal === "" ? 0 : newIuranNominal,
        tanggalTargetBaru,
        String(fd.get("keterangan") || "") || undefined
      );
      form.reset();
      setNewIuranNominal("");
      setTanggalTargetBaru("");
      setIuranId(id);
      setShowTambahIuran(false);
      await load({ force: true });
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleUpdateIuran(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    try {
      await updateIuranPaturunan(
        id,
        String(fd.get("nama")),
        editIuranNominal === "" ? 0 : editIuranNominal,
        editTanggalTarget,
        String(fd.get("keterangan") || "") || undefined
      );
      setEditingIuranId(null);
      await load({ force: true });
    } catch (err) {
      setError(String(err));
    }
  }

  function requestDeleteIuran(item: IuranPaturunanRow) {
    if (!canEdit) return;
    setDeleteIuranTarget(item);
  }

  async function confirmDeleteIuran() {
    if (!deleteIuranTarget || !canEdit) return;
    setDeleteIuranBusy(true);
    try {
      await deleteIuranPaturunan(deleteIuranTarget.id);
      if (iuranId === deleteIuranTarget.id) setIuranId("");
      setEditingIuranId(null);
      setDeleteIuranTarget(null);
      await load({ force: true });
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleteIuranBusy(false);
    }
  }

  return (
    <div className={cn(PATURUNAN_PAGE, "w-full max-w-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <Coins className="text-copper-700 shrink-0" size={22} />
            Paturunan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Tagihan = nominal iuran × % jenis krama ·{" "}
            <Link to="/master" className="text-copper-800 hover:underline">
              Master (%)
            </Link>
          </p>
        </div>
        <IconLink to="/krama-mipil" icon={Users} variant="secondary">
          Krama Mipil
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

      {pageTab === "riwayat" && (
        <PaturunanRiwayatPanel
          refreshToken={riwayatRefresh}
          canEdit={canEdit}
          canDeleteFinancial={canDeleteFinancial}
          onDataChange={() => setRiwayatRefresh((n) => n + 1)}
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
            mode="paturunan"
            canEdit={canEdit}
            alwaysOpen
            onRefresh={() => load({ force: true })}
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
      {peringatanList.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 space-y-0.5">
          {peringatanList.map((p) => (
            <p key={p.iuran_id} className="flex items-center gap-1 flex-wrap">
              <AlertTriangle size={14} className="shrink-0" />
              <span>
                <strong>{p.iuran_nama}</strong>: {p.jumlah_belum_lunas} belum lunas (lewat{" "}
                {formatTanggalLahir(p.tanggal_target)})
                {iuranId !== p.iuran_id ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="underline font-medium"
                      onClick={() => setIuranId(p.iuran_id)}
                    >
                      buka
                    </button>
                  </>
                ) : null}
              </span>
            </p>
          ))}
        </div>
      )}

      <Card className={PATURUNAN_CARD}>
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          {canEdit && (
            <Button
              type="button"
              variant="secondary"
              className="h-8 text-xs px-2"
              icon={showTambahIuran ? ChevronUp : ChevronDown}
              onClick={() => setShowTambahIuran((v) => !v)}
            >
              {showTambahIuran ? "Tutup form" : "Tambah Paturunan"}
            </Button>
          )}
          {ringkasan && (
            <StatChip label="Krama Mipil Aktif" value={String(ringkasan.totalMipilAktif)} />
          )}
          {ringkasanIuran && activeIuranId && (
            <>
              <StatChip
                label="Total tagihan"
                value={formatRupiah(ringkasanIuran.total_tagihan)}
              />
              <StatChip
                label="Wajib terkumpul"
                value={formatRupiah(ringkasanIuran.total_dibayar_wajib)}
              />
              <StatChip
                label="Punia"
                value={formatRupiah(ringkasanIuran.total_punia)}
              />
              <StatChip label="Sisa wajib" value={formatRupiah(ringkasanIuran.total_sisa)} />
              {ringkasanIuran.lewat_target && ringkasanIuran.jumlah_belum_lunas_telat > 0 && (
                <StatChip
                  label="Telat bayar"
                  value={String(ringkasanIuran.jumlah_belum_lunas_telat)}
                />
              )}
            </>
          )}
        </div>

        {canEdit && showTambahIuran && (
          <form
            onSubmit={handleCreateIuran}
            className="grid gap-3 sm:grid-cols-2 mb-3 pb-3 border-b border-copper-100"
          >
            <div className="space-y-1">
              <Label htmlFor="iuran-nama">Nama paturunan</Label>
              <FieldHint>Judul kegiatan atau iuran, misalnya Ngenteg Linggih 2027.</FieldHint>
              <Input
                id="iuran-nama"
                name="nama"
                placeholder="Ngenteg Linggih 2027"
                required
                className="text-sm h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="iuran-nominal">Nominal dasar</Label>
              <FieldHint>
                Tarif acuan per krama; tagihan = nominal × persen jenis krama (Master).
              </FieldHint>
              <RupiahInput
                id="iuran-nominal"
                value={newIuranNominal}
                onChange={setNewIuranNominal}
                className="text-sm h-9"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="iuran-target">Tanggal target</Label>
              <FieldHint>Batas waktu bayar; lewat tanggal ini dianggap telat.</FieldHint>
              <DateInput
                id="iuran-target"
                value={tanggalTargetBaru}
                onChange={setTanggalTargetBaru}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="iuran-keterangan">Keterangan</Label>
              <FieldHint>Catatan tambahan untuk paturunan ini (opsional).</FieldHint>
              <Input
                id="iuran-keterangan"
                name="keterangan"
                placeholder="Contoh: pelaksanaan di pura desa"
                className="text-sm h-9"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" icon={Plus} className="h-9 text-sm px-4">
                Simpan paturunan
              </Button>
            </div>
          </form>
        )}

        {iuranList.length === 0 ? (
          <p className="text-xs text-muted">Belum ada iuran.</p>
        ) : (
          <ul className="space-y-0.5">
            {iuranList.map((i) =>
              editingIuranId === i.id ? (
                <li
                  key={i.id}
                  className="p-1.5 rounded border border-copper-200 bg-copper-50/80"
                >
                  <form
                    onSubmit={(e) => handleUpdateIuran(e, i.id)}
                    className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5"
                  >
                    <Input name="nama" defaultValue={i.nama} required className="text-sm" />
                    <RupiahInput
                      value={editIuranNominal}
                      onChange={setEditIuranNominal}
                      className="text-sm h-9"
                      required
                    />
                    <DateInput
                      value={editTanggalTarget}
                      onChange={setEditTanggalTarget}
                      required
                    />
                    <Input
                      name="keterangan"
                      defaultValue={i.keterangan ?? ""}
                      placeholder="Keterangan"
                      className="text-sm"
                    />
                    <span className="flex gap-1 sm:col-span-2 lg:col-span-5">
                      <Button type="submit" icon={Check} className="h-8 text-xs flex-1">
                        Simpan
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        icon={X}
                        className="h-8 text-xs"
                        onClick={() => setEditingIuranId(null)}
                      >
                        Batal
                      </Button>
                    </span>
                  </form>
                </li>
              ) : (
                <li
                  key={i.id}
                  className={cn(
                    "flex items-center gap-1 py-0.5 px-1 rounded border text-xs",
                    iuranId === i.id
                      ? "border-copper-400 bg-copper-50"
                      : "border-transparent hover:bg-copper-50/60"
                  )}
                >
                  <button
                    type="button"
                    className="text-left flex-1 min-w-0 truncate"
                    onClick={() => setIuranId(i.id)}
                    title={i.keterangan ?? undefined}
                  >
                    <span className="font-medium text-copper-900">{i.nama}</span>
                    <span className="text-muted mx-1">·</span>
                    <span>{formatRupiah(Number(i.nominal))}</span>
                    {i.tanggal_target ? (
                      <span className="text-muted mx-1">
                        · {formatTanggalLahir(i.tanggal_target)}
                        {isPastTanggalTarget(i.tanggal_target) ? (
                          <span className="text-amber-800 font-medium"> lewat</span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                  {canEdit && (
                    <span className="flex shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Pencil}
                        iconOnly
                        title="Ubah"
                        className="min-h-8 min-w-8"
                        onClick={() => {
                          setEditingIuranId(i.id);
                          setEditTanggalTarget(normalizeTanggalIsoForInput(i.tanggal_target));
                          setEditIuranNominal(Math.round(Number(i.nominal) || 0));
                        }}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Trash2}
                        iconOnly
                        title="Nonaktifkan"
                        className="min-h-8 min-w-8"
                        onClick={() => requestDeleteIuran(i)}
                      />
                    </span>
                  )}
                </li>
              )
            )}
          </ul>
        )}
      </Card>

      <Card
        compact
        title={
          selectedIuran
            ? `Daftar tagihan — ${selectedIuran.nama}`
            : "Daftar Krama Mipil"
        }
        className={cn(PATURUNAN_CARD, isPhone && PATURUNAN_CARD_PHONE, PATURUNAN_TABLE)}
      >
        <div className="space-y-2 mb-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[min(100%,18rem)]">
              <Label className="font-semibold text-copper-900">Cari</Label>
              <Input
                placeholder="No. pipil, pengarep, atau anggota…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="!h-10 !text-sm border-2 border-copper-400 bg-copper-50/80 shadow-sm focus:border-copper-500 focus:ring-copper-500/40"
              />
            </div>
            <div className="flex gap-1.5 shrink-0 self-end">
              <Button
                variant="secondary"
                type="button"
                icon={Filter}
                className="h-10 text-xs"
                onClick={() => void load({ force: true })}
                disabled={loading}
              >
                Filter
              </Button>
              <Button
                variant="secondary"
                type="button"
                icon={RotateCcw}
                className="h-10 text-xs"
                onClick={resetTagihanFilters}
                disabled={loading || !hasActiveTagihanFilters}
                title="Reset semua filter"
              >
                Reset
              </Button>
            </div>
          </div>
          <div className={cn(PATURUNAN_FILTER_GRID, "sm:grid-cols-2 lg:grid-cols-4")}>
            <div className="min-w-0">
              <Label>Iuran</Label>
              <Select
                value={activeIuranId}
                onChange={(e) => setIuranId(e.target.value)}
                disabled={iuranList.length === 0}
              >
                {iuranList.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nama}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0">
              <Label>Jenis krama</Label>
              <Select
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
            <div className="min-w-0">
              <Label>Banjar</Label>
              <Select
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
            <div className="min-w-0">
              <Label>Tempek</Label>
              <Select
                value={tempekId}
                onChange={(e) => setTempekId(e.target.value)}
                disabled={!banjarId}
              >
                <option value="">{banjarId ? "Semua" : "Pilih banjar"}</option>
                {tempek.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
            <span className="text-muted">Krama:</span>
            <span className="font-semibold tabular-nums">{totalItems}</span>
          </span>
        </div>

        {isPhone ? (
          <ul className="space-y-2">
            {pagedRows.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5",
                  r.peringatan_telat && "border-amber-300 bg-amber-50/90"
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
                  {[r.tempek_nama?.trim() || null, r.arahan_nama?.trim() || null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {activeIuranId ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="tabular-nums text-copper-900">
                      <span className="text-muted">Tagihan:</span>{" "}
                      {r.tagihan != null ? formatRupiah(r.tagihan) : "—"}
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        (r.sisa ?? 0) > 0 ? "text-amber-900 font-medium" : "text-copper-900"
                      )}
                    >
                      <span className="text-muted font-normal">Sisa:</span>{" "}
                      {(r.tagihan ?? 0) <= 0 ? "—" : formatRupiah(r.sisa ?? 0)}
                    </span>
                    <PaturunanStatusBadge
                      tagihan={r.tagihan ?? 0}
                      dibayarWajib={r.dibayar ?? 0}
                      punia={r.punia ?? 0}
                    />
                  </div>
                ) : null}
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                  <PaturunanWhatsAppButton
                    nomorKontak={r.nomor_kontak}
                    kepalaNama={r.kepala_nama}
                    sisa={r.sisa ?? 0}
                    tagihan={r.tagihan ?? 0}
                    dibayar={r.dibayar ?? 0}
                    iuranNama={selectedIuranNama}
                    label="WhatsApp"
                    className="h-10 w-full justify-center text-xs text-emerald-800"
                  />
                  {activeIuranId ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={Wallet}
                      className="h-10 justify-center text-xs"
                      onClick={() => setBayarRow(r)}
                    >
                      {(r.tagihan ?? 0) > 0 ? "Bayar" : "Punia"}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <IconLink
                    to={`/krama-mipil/${r.id}/cetak-kartu-paturunan`}
                    state={{
                      backTo: paturunanPagePath(pageTab),
                      backLabel: "Kembali ke Paturunan",
                    }}
                    icon={CalendarDays}
                    variant="secondary"
                    className="h-10 justify-center text-xs"
                  >
                    Kartu
                  </IconLink>
                  <IconLink
                    to={`/krama-mipil/${r.id}`}
                    icon={Eye}
                    variant="secondary"
                    className="h-10 justify-center text-xs"
                  >
                    Lihat
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
                    label="No. Pipil"
                    columnKey="nomor_kartu"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Pengarep"
                    columnKey="kepala_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Jenis"
                    columnKey="jenis_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Tempek"
                    columnKey="tempek_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  {activeIuranId ? (
                    <SortableTableHead
                      label="Tagihan"
                      columnKey="tagihan"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {activeIuranId ? (
                    <SortableTableHead
                      label="Wajib"
                      columnKey="dibayar"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {activeIuranId ? (
                    <SortableTableHead
                      label="Sisa"
                      columnKey="sisa"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {activeIuranId ? (
                    <SortableTableHead
                      label="Punia"
                      columnKey="punia"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                    />
                  ) : null}
                  {activeIuranId ? <th>Status</th> : null}
                  <SortableTableHead
                    label="Arahan"
                    columnKey="arahan_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="hidden lg:table-cell"
                  />
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      LIST_BODY_ROW,
                      r.peringatan_telat && "bg-amber-50/90"
                    )}
                  >
                    <td className="font-mono text-[11px] whitespace-nowrap">{r.nomor_kartu}</td>
                    <td className="max-w-[9rem] truncate" title={r.kepala_nama}>
                      {r.kepala_nama}
                    </td>
                    <td className="max-w-[6rem] truncate" title={r.jenis_nama ?? ""}>
                      {r.jenis_nama?.trim() || "—"}
                    </td>
                    <td className="max-w-[5rem] truncate" title={r.tempek_nama?.trim() ?? ""}>
                      {r.tempek_nama?.trim() || "—"}
                    </td>
                    {activeIuranId ? (
                      <td className="tabular-nums whitespace-nowrap">
                        {r.tagihan != null ? formatRupiah(r.tagihan) : "—"}
                      </td>
                    ) : null}
                    {activeIuranId ? (
                      <td className="tabular-nums whitespace-nowrap text-copper-800">
                        {(r.tagihan ?? 0) <= 0 ? "—" : formatRupiah(r.dibayar ?? 0)}
                      </td>
                    ) : null}
                    {activeIuranId ? (
                      <td
                        className={cn(
                          "tabular-nums whitespace-nowrap",
                          (r.sisa ?? 0) > 0 && "text-amber-900 font-medium"
                        )}
                      >
                        {(r.tagihan ?? 0) <= 0 ? "—" : formatRupiah(r.sisa ?? 0)}
                      </td>
                    ) : null}
                    {activeIuranId ? (
                      <td className="tabular-nums whitespace-nowrap text-violet-900">
                        {(r.punia ?? 0) > 0 ? formatRupiah(r.punia ?? 0) : "—"}
                      </td>
                    ) : null}
                    {activeIuranId ? (
                      <td className="whitespace-nowrap">
                        <PaturunanStatusBadge
                          tagihan={r.tagihan ?? 0}
                          dibayarWajib={r.dibayar ?? 0}
                          punia={r.punia ?? 0}
                        />
                      </td>
                    ) : null}
                    <td
                      className="hidden lg:table-cell max-w-[5rem] truncate"
                      title={r.arahan_nama ?? ""}
                    >
                      {r.arahan_nama?.trim() || "—"}
                    </td>
                    <td>
                      <span className="inline-flex gap-0.5">
                        <PaturunanWhatsAppButton
                          nomorKontak={r.nomor_kontak}
                          kepalaNama={r.kepala_nama}
                          sisa={r.sisa ?? 0}
                          tagihan={r.tagihan ?? 0}
                          dibayar={r.dibayar ?? 0}
                          iuranNama={selectedIuranNama}
                        />
                        {activeIuranId && (
                          <Button
                            type="button"
                            variant="ghost"
                            icon={Wallet}
                            iconOnly
                            title={
                              (r.tagihan ?? 0) > 0 ? "Pembayaran" : "Tambah Punia"
                            }
                            className="min-h-7 min-w-7"
                            onClick={() => setBayarRow(r)}
                          />
                        )}
                        <IconLink
                          to={`/krama-mipil/${r.id}/cetak-kartu-paturunan`}
                          state={{
                            backTo: paturunanPagePath(pageTab),
                            backLabel: "Kembali ke Paturunan",
                          }}
                          icon={CalendarDays}
                          iconOnly
                          variant="ghost"
                          title="Kartu Paturunan"
                          aria-label="Kartu Paturunan"
                        />
                        <IconLink
                          to={`/krama-mipil/${r.id}`}
                          icon={Eye}
                          iconOnly
                          variant="ghost"
                          title="Lihat"
                          aria-label="Lihat"
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && totalItems === 0 && (
              <p className="text-center py-3 text-xs text-muted">Tidak ada data</p>
            )}
          </div>
        )}
        {loading && <p className="text-center py-3 text-xs text-muted">Memuat…</p>}
        {!loading && (
          <ListPagination
            page={safePage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        )}
      </Card>
        </>
      )}

      {bayarRow && activeIuranId && (
        <PaturunanPembayaranDialog
          open={!!bayarRow}
          onClose={() => setBayarRow(null)}
          onSuccess={() => void load({ force: true })}
          onSaved={showOkFlash}
          canEdit={canEdit}
          canDeleteFinancial={canDeleteFinancial}
          kramaId={bayarRow.id}
          iuranId={activeIuranId}
          nomorKartu={bayarRow.nomor_kartu}
          kepalaNama={bayarRow.kepala_nama}
          banjarId={bayarRow.banjar_id}
          banjarNama={bayarRow.banjar_nama}
          tempekNama={bayarRow.tempek_nama}
          arahanNama={bayarRow.arahan_nama}
          tagihan={bayarRow.tagihan ?? 0}
        />
      )}
      <ConfirmDialog
        open={deleteIuranTarget != null}
        title="Nonaktifkan iuran?"
        message={
          deleteIuranTarget
            ? `Nonaktifkan iuran "${deleteIuranTarget.nama}"? Iuran tidak akan muncul lagi untuk tagihan baru.`
            : ""
        }
        confirmLabel="Ya, nonaktifkan"
        busy={deleteIuranBusy}
        onConfirm={() => void confirmDeleteIuran()}
        onCancel={() => {
          if (!deleteIuranBusy) setDeleteIuranTarget(null);
        }}
      />
    </div>
  );
}
