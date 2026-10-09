import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";
import { formatRupiah, formatTunggakanPeriodeRingkas } from "../../lib/dudukan-hitung";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { getDesaAdat } from "../../lib/services/desa";
import {
  arsipRowToLaporanRow,
  issueSuratPenagihanBatch,
  listEligibleSuratPenagihan,
  listSuratPenagihanArsip,
  MIN_BULAN_SURAT_PENAGIHAN,
  type SuratPenagihanArsipRow,
  type SuratPenagihanEligibleRow,
} from "../../lib/services/surat-penagihan-dudukan";
import { stashSuratPenagihanDudukanPreview } from "../../lib/laporan-pdf-preview";
import { buildSuratPenagihanPdfPayload } from "../../lib/surat-penagihan-dudukan-pdf";
import { listRtBtnPemasih } from "../../lib/services/krama";
import { listBanjar, listJenisKramaTamiu, listJenisTamiu } from "../../lib/services/master";
import type { JenisKramaTamiuRow, JenisTamiuRow, KlasifikasiKode } from "../../lib/types";
import { formatTanggalLahir } from "../../lib/utils";
import { cn } from "../../lib/utils";
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
import { AlertTriangle, ArrowLeft, FileText, History, Printer, RotateCcw } from "lucide-react";

type PageTab = "terbit" | "arsip";

const TAHUN_BERJALAN = new Date().getFullYear();

const TABLE_COLS =
  "[&_colgroup_col:nth-child(1)]:w-[14%] [&_colgroup_col:nth-child(2)]:w-[18%] [&_colgroup_col:nth-child(3)]:w-[20%] [&_colgroup_col:nth-child(4)]:w-[8%] [&_colgroup_col:nth-child(5)]:w-[12%] [&_colgroup_col:nth-child(6)]:w-[16%] [&_colgroup_col:nth-child(7)]:w-[12%]";

/** Arsip: kolom ringkas pakai lebar tetap; Pengajeg mengisi sisa tabel. */
const ARSIP_TABLE_COLS =
  "[&_colgroup_col:nth-child(1)]:w-[11rem] [&_colgroup_col:nth-child(2)]:w-[5.75rem] [&_colgroup_col:nth-child(3)]:w-[9.75rem] [&_colgroup_col:nth-child(4)]:w-auto [&_colgroup_col:nth-child(5)]:w-[2.75rem] [&_colgroup_col:nth-child(6)]:w-[7rem] [&_colgroup_col:nth-child(7)]:w-[5.5rem]";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-[11px] text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const PAGE_ID = "laporan/surat-penagihan-dudukan";

export function SuratPenagihanDudukanPage() {
  const isPhone = useIsPhoneClient();
  const openPdf = useLaporanPdfNavigate();
  const [pageTab, setPageTab] = useState<PageTab>("terbit");
  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);
  const [rows, setRows] = useState<SuratPenagihanEligibleRow[]>([]);
  const [arsipRows, setArsipRows] = useState<SuratPenagihanArsipRow[]>([]);

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");
  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");
  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [arsipLoading, setArsipLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [arsipPage, setArsipPage] = useState(1);
  const [arsipPageSize, setArsipPageSize] = useState(LIST_PAGE_SIZE);

  const [arsipQ, setArsipQ] = useState("");
  const [debouncedArsipQ, setDebouncedArsipQ] = useState("");
  const [arsipTahun, setArsipTahun] = useState(String(TAHUN_BERJALAN));
  const [arsipBanjarId, setArsipBanjarId] = useState("");
  const [arsipTanggalDari, setArsipTanggalDari] = useState("");
  const [arsipTanggalSampai, setArsipTanggalSampai] = useState("");

  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;
  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;

  const safePage = useMemo(() => clampPage(page, rows.length, pageSize), [page, rows.length, pageSize]);
  const pagedRows = useMemo(() => paginateSlice(rows, safePage, pageSize), [rows, safePage, pageSize]);
  const safeArsipPage = useMemo(
    () => clampPage(arsipPage, arsipRows.length, arsipPageSize),
    [arsipPage, arsipRows.length, arsipPageSize]
  );
  const pagedArsipRows = useMemo(
    () => paginateSlice(arsipRows, safeArsipPage, arsipPageSize),
    [arsipRows, safeArsipPage, arsipPageSize]
  );

  const ringkasan = useMemo(() => {
    const totalSisa = rows.reduce((s, r) => s + r.total_sisa, 0);
    const sudahTerbit = rows.filter((r) => r.nomor_surat).length;
    return { total: rows.length, totalSisa, sudahTerbit };
  }, [rows]);

  const ringkasanArsip = useMemo(() => {
    const totalSisa = arsipRows.reduce((s, r) => s + Number(r.total_sisa) || 0, 0);
    return { total: arsipRows.length, totalSisa };
  }, [arsipRows]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (arsipPage !== safeArsipPage) setArsipPage(safeArsipPage);
  }, [arsipPage, safeArsipPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedArsipQ(arsipQ.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [arsipQ]);

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
      const result = await listEligibleSuratPenagihan({
        banjarId: banjarId || undefined,
        klasifikasi: klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined,
        jenisKramaTamiuId,
        jenisTamiuId,
        rtBtn: rtBtn || undefined,
        q: debouncedQ || undefined,
      });
      setRows(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [banjarId, klasifikasi, jenisKramaTamiuId, jenisTamiuId, rtBtn, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadArsip = useCallback(async () => {
    setArsipPage(1);
    setArsipLoading(true);
    setError("");
    try {
      const result = await listSuratPenagihanArsip({
        q: debouncedArsipQ || undefined,
        tahun: arsipTahun ? Number(arsipTahun) : undefined,
        banjarId: arsipBanjarId || undefined,
        tanggalDari: arsipTanggalDari || undefined,
        tanggalSampai: arsipTanggalSampai || undefined,
      });
      setArsipRows(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setArsipLoading(false);
    }
  }, [
    debouncedArsipQ,
    arsipTahun,
    arsipBanjarId,
    arsipTanggalDari,
    arsipTanggalSampai,
  ]);

  useEffect(() => {
    if (pageTab !== "arsip") return;
    void loadArsip();
  }, [pageTab, loadArsip]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setKlasifikasi("");
    setJenisFilter("");
    setBanjarId("");
    setRtBtn("");
  }

  function resetArsipFilters() {
    setArsipQ("");
    setArsipTahun(String(TAHUN_BERJALAN));
    setArsipBanjarId("");
    setArsipTanggalDari("");
    setArsipTanggalSampai("");
  }

  async function openPreview(kramaIds: string[]) {
    if (!kramaIds.length) return;
    setPrinting(true);
    setError("");
    try {
      const desa = await getDesaAdat();
      if (!desa) throw new Error("Data desa adat belum ada.");
      const issued = await issueSuratPenagihanBatch(kramaIds);
      const payloads = issued.map(({ surat, row }) =>
        buildSuratPenagihanPdfPayload(desa, surat, row)
      );
      await load();
      openPdf((backTo) =>
        stashSuratPenagihanDudukanPreview(payloads, backTo, "Kembali ke Surat Penagihan")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      window.alert(msg);
    } finally {
      setPrinting(false);
    }
  }

  async function printRow(kramaId: string) {
    await openPreview([kramaId]);
  }

  async function printAll() {
    await openPreview(rows.map((r) => r.id));
  }

  async function reprintArsip(suratId: string) {
    setPrinting(true);
    setError("");
    try {
      const desa = await getDesaAdat();
      if (!desa) throw new Error("Data desa adat belum ada.");
      const arsip = arsipRows.find((r) => r.id === suratId);
      if (!arsip) throw new Error("Surat tidak ditemukan.");
      const payload = buildSuratPenagihanPdfPayload(
        desa,
        arsip,
        arsipRowToLaporanRow(arsip)
      );
      openPdf((backTo) =>
        stashSuratPenagihanDudukanPreview([payload], backTo, "Kembali ke Surat Penagihan")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      window.alert(msg);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <FileText className="text-copper-700" size={22} />
            Surat Penagihan Dudukan
          </h2>
          <p className="text-[11px] text-muted mt-0.5">
            Krama Tamiu &amp; Tamiu dengan tunggakan ≥ {MIN_BULAN_SURAT_PENAGIHAN} bulan — nomor SP
            otomatis per bulan.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <IconLink to="/laporan/tunggakan-dudukan" icon={AlertTriangle} variant="secondary">
            Tunggakan Dudukan
          </IconLink>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={pageTab === "terbit" ? "primary" : "secondary"}
          icon={FileText}
          onClick={() => setPageTab("terbit")}
        >
          Terbitkan surat
        </Button>
        <Button
          type="button"
          variant={pageTab === "arsip" ? "primary" : "secondary"}
          icon={History}
          onClick={() => setPageTab("arsip")}
        >
          Daftar surat tagihan
        </Button>
      </div>

      {pageTab === "terbit" && (
        <>
      <Card className={LAPORAN_CARD}>
        <div className="flex flex-wrap gap-1">
          <StatChip label="Eligible" value={String(ringkasan.total)} />
          <StatChip label="Total sisa" value={formatRupiah(ringkasan.totalSisa)} />
          <StatChip label="Sudah terbit bulan ini" value={String(ringkasan.sudahTerbit)} />
        </div>
      </Card>

      <Card title="Daftar pemasih" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
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
            <Select value={banjarId} onChange={(e) => setBanjarId(e.target.value)}>
              <option value="">Semua</option>
              {banjar.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nama}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[80px]">
            <Label>RT/BTN</Label>
            <Select value={rtBtn} onChange={(e) => setRtBtn(e.target.value)}>
              <option value="">Semua</option>
              {rtBtnOptions.map((rt) => (
                <option key={rt} value={rt}>
                  {rt}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end gap-1">
            <Button type="button" variant="secondary" icon={RotateCcw} onClick={resetFilters}>
              Reset
            </Button>
            <Button
              type="button"
              icon={Printer}
              disabled={printing || rows.length === 0}
              onClick={() => void printAll()}
            >
              {printing ? "Menyiapkan…" : "Cetak semua"}
            </Button>
          </div>
        </div>

        <div className={LAPORAN_HEAD_ROW}>
          <span className="text-xs text-muted">
            {loading ? "Memuat…" : `${rows.length} pemasih eligible`}
          </span>
        </div>

        {isPhone ? (
          <ul className="space-y-2">
            {loading ? (
              <li className="text-center text-muted py-4 text-xs">Memuat data…</li>
            ) : pagedRows.length === 0 ? (
              <li className="text-center text-muted py-4 text-xs">
                Tidak ada pemasih dengan tunggakan ≥ {MIN_BULAN_SURAT_PENAGIHAN} bulan.
              </li>
            ) : (
              pagedRows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-copper-950">{r.kepala_nama}</p>
                    <p className="font-mono text-[11px] text-copper-700 tabular-nums">{r.nomor_kartu}</p>
                  </div>
                  <p className="mt-1 text-xs leading-snug text-muted">{r.alamat || "—"}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                    <span className="text-copper-900">
                      <span className="text-muted">Bln:</span> {r.tunggakan_bulan}
                    </span>
                    <span className="font-medium text-amber-900">
                      <span className="text-muted font-normal">Sisa:</span> {formatRupiah(r.total_sisa)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-copper-800">
                    {r.nomor_surat ? (
                      <>
                        {r.nomor_surat}
                        {r.tanggal_terbit ? (
                          <span className="text-muted"> · {formatTanggalLahir(r.tanggal_terbit)}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-amber-700">Belum terbit</span>
                    )}
                  </p>
                  <div className="mt-2 flex h-10 items-stretch">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={Printer}
                      className="h-10 flex-1 text-xs"
                      disabled={printing}
                      onClick={() => void printRow(r.id)}
                    >
                      Cetak
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className={cn(LAPORAN_TABLE_ELEMENT, TABLE_COLS)}>
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>No. Pemasih</th>
                  <th>Pengajeg</th>
                  <th>Alamat</th>
                  <th>Bln</th>
                  <th>Sisa</th>
                  <th>Nomor SP</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      Memuat data…
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      Tidak ada pemasih dengan tunggakan ≥ {MIN_BULAN_SURAT_PENAGIHAN} bulan.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => (
                    <tr key={r.id}>
                      <td className="tabular-nums">{r.nomor_kartu}</td>
                      <td>{r.kepala_nama}</td>
                      <td className="text-muted">{r.alamat || "—"}</td>
                      <td className="tabular-nums text-center">{r.tunggakan_bulan}</td>
                      <td className="tabular-nums text-right">{formatRupiah(r.total_sisa)}</td>
                      <td className="text-[11px]">
                        {r.nomor_surat ? (
                          <span title={formatTunggakanPeriodeRingkas(r.bulan_tunggakan_aktif)}>
                            {r.nomor_surat}
                            {r.tanggal_terbit ? (
                              <span className="block text-muted">
                                {formatTanggalLahir(r.tanggal_terbit)}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-amber-700">Belum terbit</span>
                        )}
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          icon={Printer}
                          disabled={printing}
                          onClick={() => void printRow(r.id)}
                        >
                          Cetak
                        </Button>
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
        />
      </Card>
        </>
      )}

      {pageTab === "arsip" && (
        <>
          <Card className={LAPORAN_CARD}>
            <div className="flex flex-wrap gap-1">
              <StatChip label="Surat terbit" value={String(ringkasanArsip.total)} />
              <StatChip label="Total sisa (snapshot)" value={formatRupiah(ringkasanArsip.totalSisa)} />
            </div>
          </Card>

          <Card title="Daftar surat tagihan" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
            <div
              className={cn(
                LIST_FILTER_ROW,
                "[&_label]:!text-[11px] [&_input]:!h-8 [&_select]:!h-8 [&_input]:!text-xs [&_select]:!text-xs"
              )}
            >
              <div className="flex-1 min-w-[140px]">
                <Label>Cari</Label>
                <Input
                  value={arsipQ}
                  onChange={(e) => setArsipQ(e.target.value)}
                  placeholder="Nomor SP / nama / no. pemasih…"
                />
              </div>
              <div className="min-w-[100px]">
                <Label>Tahun</Label>
                <Select value={arsipTahun} onChange={(e) => setArsipTahun(e.target.value)}>
                  <option value="">Semua</option>
                  <option value={String(TAHUN_BERJALAN)}>{TAHUN_BERJALAN}</option>
                  <option value={String(TAHUN_BERJALAN - 1)}>{TAHUN_BERJALAN - 1}</option>
                  <option value={String(TAHUN_BERJALAN - 2)}>{TAHUN_BERJALAN - 2}</option>
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label>Banjar</Label>
                <Select value={arsipBanjarId} onChange={(e) => setArsipBanjarId(e.target.value)}>
                  <option value="">Semua</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Dari</Label>
                <Input
                  type="date"
                  value={arsipTanggalDari}
                  onChange={(e) => setArsipTanggalDari(e.target.value)}
                />
              </div>
              <div>
                <Label>Sampai</Label>
                <Input
                  type="date"
                  value={arsipTanggalSampai}
                  onChange={(e) => setArsipTanggalSampai(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="secondary" icon={RotateCcw} onClick={resetArsipFilters}>
                  Reset
                </Button>
              </div>
            </div>

            <div className={LAPORAN_HEAD_ROW}>
              <span className="text-xs text-muted">
                {arsipLoading ? "Memuat…" : `${arsipRows.length} surat tercatat`}
              </span>
            </div>

            {isPhone ? (
              <ul className="space-y-2">
                {arsipLoading ? (
                  <li className="text-center text-muted py-4 text-xs">Memuat arsip…</li>
                ) : pagedArsipRows.length === 0 ? (
                  <li className="text-center text-muted py-4 text-xs">Belum ada surat penagihan tercatat.</li>
                ) : (
                  pagedArsipRows.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-copper-950">{r.kepala_nama}</p>
                        <p className="font-mono text-[11px] text-copper-700 tabular-nums">{r.nomor_kartu}</p>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-muted">
                        {[r.nomor_surat, formatTanggalLahir(r.tanggal_terbit), r.banjar_nama]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                        <span className="text-copper-900">
                          <span className="text-muted">Bln:</span> {r.tunggakan_bulan}
                        </span>
                        <span className="font-medium text-amber-900">
                          <span className="text-muted font-normal">Sisa:</span> {formatRupiah(r.total_sisa)}
                        </span>
                      </div>
                      <div className="mt-2 flex h-10 items-stretch">
                        <Button
                          type="button"
                          variant="secondary"
                          icon={Printer}
                          className="h-10 flex-1 text-xs"
                          disabled={printing}
                          onClick={() => void reprintArsip(r.id)}
                        >
                          Cetak
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="overflow-x-auto">
                <table className={cn(LAPORAN_TABLE_ELEMENT, "table-fixed w-full", ARSIP_TABLE_COLS)}>
                  <colgroup>
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Nomor SP</th>
                      <th className="whitespace-nowrap">Tanggal</th>
                      <th className="whitespace-nowrap">No. Pemasih</th>
                      <th>Pengajeg</th>
                      <th className="whitespace-nowrap text-center">Bln</th>
                      <th className="whitespace-nowrap text-right">Sisa</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {arsipLoading ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          Memuat arsip…
                        </td>
                      </tr>
                    ) : pagedArsipRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center text-muted py-4">
                          Belum ada surat penagihan tercatat.
                        </td>
                      </tr>
                    ) : (
                      pagedArsipRows.map((r) => (
                        <tr key={r.id}>
                          <td className="text-[11px] font-mono whitespace-nowrap">{r.nomor_surat}</td>
                          <td className="text-xs whitespace-nowrap">{formatTanggalLahir(r.tanggal_terbit)}</td>
                          <td className="text-xs tabular-nums whitespace-nowrap">{r.nomor_kartu}</td>
                          <td className="min-w-0">
                            <span className="block">{r.kepala_nama}</span>
                            <span className="text-[11px] text-muted">{r.banjar_nama}</span>
                          </td>
                          <td className="text-xs tabular-nums text-center whitespace-nowrap">{r.tunggakan_bulan}</td>
                          <td className="text-xs tabular-nums text-right whitespace-nowrap">{formatRupiah(r.total_sisa)}</td>
                          <td className="text-right whitespace-nowrap">
                            <Button
                              type="button"
                              variant="secondary"
                              icon={Printer}
                              disabled={printing}
                              onClick={() => void reprintArsip(r.id)}
                            >
                              Cetak
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <ListPagination
              page={safeArsipPage}
              totalItems={arsipRows.length}
              pageSize={arsipPageSize}
              onPageChange={setArsipPage}
              onPageSizeChange={setArsipPageSize}
            />
          </Card>
        </>
      )}
    </div>
  );
}
