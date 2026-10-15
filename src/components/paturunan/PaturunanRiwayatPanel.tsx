import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import {
  buildBuktiSetoranPaturunanPdfPayload,
  paymentDayKey,
} from "../../lib/bukti-setoran-pdf";
import { downloadExcel } from "../../lib/excel-export";
import {
  stashBuktiSetoranPaturunanPreview,
  stashLaporanPdfPreview,
} from "../../lib/laporan-pdf-preview";
import { formatRupiah } from "../../lib/paturunan-hitung";
import {
  buildRiwayatPaturunanExportRows,
  buildRiwayatPaturunanPdfInput,
  type RiwayatPaturunanExportFilter,
  RIWAYAT_PATURUNAN_EXPORT_HEADERS,
  riwayatPaturunanExportFilename,
} from "../../lib/riwayat-paturunan-export";
import {
  deletePembayaranPaturunan,
  getTagihanPaturunanKramaIuran,
  listRiwayatPembayaranPaturunan,
  type PaturunanRiwayatRow,
} from "../../lib/services/paturunan-pembayaran";
import { listBanjar } from "../../lib/services/paturunan";
import { listIuranPaturunan } from "../../lib/services/iuran-paturunan";
import { listTempek, listTimKasukretan } from "../../lib/services/master";
import type {
  Banjar,
  IuranPaturunanRow,
  PaturunanPembayaranJenis,
  Tempek,
  TimKasukretan,
} from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../ui/Card";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { ListPagination } from "../ui/ListPagination";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PaturunanPembayaranDialog } from "./PaturunanPembayaranDialog";
import { PATURUNAN_CARD } from "./paturunan-compact";
import {
  LIST_BODY_ROW,
  LIST_HEAD_ROW,
  LIST_TABLE,
  LIST_TABLE_ELEMENT,
} from "../ui/list-compact";
import { FileSpreadsheet, FileText, Filter, Pencil, RotateCcw, Trash2 } from "lucide-react";

function JenisBadge({ jenis }: { jenis: PaturunanPembayaranJenis }) {
  return (
    <span
      className={cn(
        "inline-block text-[10px] font-medium px-1.5 py-0.5 rounded",
        jenis === "punia" ? "bg-violet-100 text-violet-900" : "bg-copper-100 text-copper-800"
      )}
    >
      {jenis === "punia" ? "Punia" : "Wajib"}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

type Props = {
  refreshToken?: number;
  canEdit?: boolean;
  canDeleteFinancial?: boolean;
  onDataChange?: () => void;
  onBayarSaved?: (message: string) => void;
};

const PAGE_ID = "paturunan/riwayat";

export function PaturunanRiwayatPanel({
  refreshToken = 0,
  canEdit = false,
  canDeleteFinancial = false,
  onDataChange,
  onBayarSaved,
}: Props) {
  const openPdf = useLaporanPdfNavigate();
  const [rows, setRows] = useState<PaturunanRiwayatRow[]>([]);
  const [iuranList, setIuranList] = useState<IuranPaturunanRow[]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [tim, setTim] = useState<TimKasukretan[]>([]);
  const [iuranId, setIuranId] = usePersistedScalar(PAGE_ID, "iuranId", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [tempekId, setTempekId] = usePersistedScalar(PAGE_ID, "tempekId", "");
  const [petugasId, setPetugasId] = usePersistedScalar(PAGE_ID, "petugasId", "");
  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [jenis, setJenis] = usePersistedScalar(PAGE_ID, "jenis", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteRow, setDeleteRow] = useState<PaturunanRiwayatRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [editRow, setEditRow] = useState<PaturunanRiwayatRow | null>(null);
  const [editTagihan, setEditTagihan] = useState(0);
  const [editBusy, setEditBusy] = useState(false);

  const hasFilters =
    iuranId !== "" ||
    banjarId !== "" ||
    tempekId !== "" ||
    petugasId !== "" ||
    dari !== "" ||
    sampai !== "" ||
    jenis !== "" ||
    q.trim() !== "";

  const buktiRange = useMemo(() => {
    const d = dari.trim();
    if (!d) return null;
    return { dari: d, sampai: sampai.trim() || d };
  }, [dari, sampai]);

  const buktiSetoranRows = useMemo(() => {
    if (!buktiRange || buktiRange.sampai < buktiRange.dari) return [];
    return rows.filter((r) => {
      const day = paymentDayKey(r.tanggal);
      return day >= buktiRange.dari && day <= buktiRange.sampai;
    });
  }, [rows, buktiRange]);

  function changeDari(iso: string) {
    setDari(iso);
    setSampai(iso);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, iuran, b] = await Promise.all([
        listRiwayatPembayaranPaturunan({
          iuranId: iuranId || undefined,
          banjarId: banjarId || undefined,
          tempekId: tempekId || undefined,
          petugasId: petugasId || undefined,
          dari: dari || undefined,
          sampai: sampai || undefined,
          jenis: (jenis as PaturunanPembayaranJenis) || undefined,
          q: q || undefined,
        }),
        listIuranPaturunan(),
        listBanjar(),
      ]);
      setRows(list);
      setIuranList(iuran);
      setBanjar(b);
      setPage(1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [iuranId, banjarId, tempekId, petugasId, dari, sampai, jenis, q]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

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
    listTimKasukretan(banjarId || undefined)
      .then((t) => {
        setTim(t);
        if (petugasId && !t.some((x) => x.id === petugasId)) setPetugasId("");
      })
      .catch(() => setTim([]));
  }, [banjarId, petugasId]);

  const safePage = useMemo(
    () => clampPage(page, rows.length, pageSize),
    [page, rows.length, pageSize]
  );
  const pagedRows = useMemo(
    () => paginateSlice(rows, safePage, pageSize),
    [rows, safePage, pageSize]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const totalWajib = rows
    .filter((r) => r.jenis === "wajib")
    .reduce((s, r) => s + r.jumlah, 0);
  const totalPunia = rows
    .filter((r) => r.jenis === "punia")
    .reduce((s, r) => s + r.jumlah, 0);

  const exportFilter = useMemo((): RiwayatPaturunanExportFilter => {
    const filter: RiwayatPaturunanExportFilter = {};
    if (iuranId) filter.iuranNama = iuranList.find((i) => i.id === iuranId)?.nama;
    if (banjarId) filter.banjarNama = banjar.find((b) => b.id === banjarId)?.nama;
    if (tempekId) filter.tempekNama = tempek.find((t) => t.id === tempekId)?.nama;
    if (petugasId) {
      const petugas = tim.find((t) => t.id === petugasId);
      filter.petugasNama = petugas
        ? `${petugas.nama}${!banjarId && petugas.banjar_nama ? ` (${petugas.banjar_nama})` : ""}`
        : undefined;
    }
    if (jenis === "wajib") filter.jenisBayar = "Wajib";
    else if (jenis === "punia") filter.jenisBayar = "Punia";
    if (q.trim()) filter.q = q.trim();
    return filter;
  }, [iuranId, banjarId, tempekId, petugasId, jenis, q, iuranList, banjar, tempek, tim]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setIuranId("");
    setBanjarId("");
    setTempekId("");
    setPetugasId("");
    setDari("");
    setSampai("");
    setJenis("");
    setQ("");
  }

  function cetakBuktiSetoran() {
    if (!buktiRange) {
      window.alert("Isi Dari tanggal untuk bukti setoran.");
      return;
    }
    if (buktiRange.sampai < buktiRange.dari) {
      window.alert("Sampai tanggal tidak boleh sebelum Dari tanggal.");
      return;
    }
    if (buktiSetoranRows.length === 0) {
      window.alert("Tidak ada pembayaran pada rentang tanggal yang dipilih.");
      return;
    }
    try {
      openPdf((backTo) =>
        stashBuktiSetoranPaturunanPreview(
          buildBuktiSetoranPaturunanPdfPayload(buktiSetoranRows, buktiRange),
          backTo,
          "Kembali ke Paturunan"
        )
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function exportExcel() {
    if (rows.length === 0) return;
    await downloadExcel(riwayatPaturunanExportFilename(dari, sampai), {
      name: "Riwayat",
      headers: [...RIWAYAT_PATURUNAN_EXPORT_HEADERS],
      rows: buildRiwayatPaturunanExportRows(rows),
      landscape: true,
    });
  }

  function exportPdf() {
    if (rows.length === 0) return;
    try {
      openPdf((backTo) =>
        stashLaporanPdfPreview({
          input: buildRiwayatPaturunanPdfInput(rows, { dari, sampai, filter: exportFilter }),
          backTo,
          backLabel: "Kembali ke Paturunan",
        })
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  function requestHapus(row: PaturunanRiwayatRow) {
    if (!canDeleteFinancial) return;
    setDeleteRow(row);
  }

  async function handleEdit(row: PaturunanRiwayatRow) {
    if (!canEdit || !row.banjar_id) return;
    setEditBusy(true);
    setError("");
    try {
      const tagihan = await getTagihanPaturunanKramaIuran(row.krama_id, row.iuran_id);
      setEditTagihan(tagihan);
      setEditRow(row);
    } catch (e) {
      setError(String(e));
    } finally {
      setEditBusy(false);
    }
  }

  function closeEditDialog() {
    setEditRow(null);
  }

  async function handleEditSuccess() {
    await load();
    onDataChange?.();
  }

  async function confirmHapus() {
    if (!deleteRow || !canDeleteFinancial) return;
    setDeleteBusy(true);
    setError("");
    try {
      await deletePembayaranPaturunan(deleteRow.id);
      setDeleteRow(null);
      await load();
      onDataChange?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  function jenisLabel(jenis: PaturunanPembayaranJenis): string {
    return jenis === "punia" ? "Punia" : "Wajib";
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      <Card compact className={cn(PATURUNAN_CARD, LIST_TABLE)}>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Filter size={14} className="text-copper-700 shrink-0" />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 flex-1 min-w-0">
            <div>
              <Label>Petugas</Label>
              <Select value={petugasId} onChange={(e) => setPetugasId(e.target.value)}>
                <option value="">Semua petugas</option>
                {tim.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama}
                    {!banjarId && t.banjar_nama ? ` (${t.banjar_nama})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Dari tanggal</Label>
              <DateInput value={dari} onChange={changeDari} />
            </div>
            <div>
              <Label>Sampai tanggal</Label>
              <DateInput value={sampai} onChange={setSampai} />
            </div>
            <div>
              <Label>Iuran</Label>
              <Select value={iuranId} onChange={(e) => setIuranId(e.target.value)}>
                <option value="">Semua iuran</option>
                {iuranList.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nama}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Banjar</Label>
              <Select value={banjarId} onChange={(e) => setBanjarId(e.target.value)}>
                <option value="">Semua banjar</option>
                {banjar.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nama}
                  </option>
                ))}
              </Select>
            </div>
            <div>
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
            <div>
              <Label>Jenis</Label>
              <Select value={jenis} onChange={(e) => setJenis(e.target.value)}>
                <option value="">Semua jenis</option>
                <option value="wajib">Wajib</option>
                <option value="punia">Punia</option>
              </Select>
            </div>
            <div>
              <Label>Cari pipil / nama</Label>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nomor pipil atau pengarep"
              />
            </div>
          </div>
          {hasFilters && (
            <Button type="button" variant="secondary" icon={RotateCcw} onClick={resetFilters}>
              Reset
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <StatChip label="Transaksi" value={String(rows.length)} />
          <StatChip label="Total wajib" value={formatRupiah(totalWajib)} />
          <StatChip label="Total punia" value={formatRupiah(totalPunia)} />
          <span className="inline-flex flex-wrap items-center gap-1 ml-auto">
            <Button
              type="button"
              variant="secondary"
              icon={FileSpreadsheet}
              className="h-8 text-xs"
              onClick={() => void exportExcel()}
              disabled={loading || rows.length === 0}
              title="Unduh semua baris sesuai filter aktif"
            >
              Ekspor Excel
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={FileText}
              className="h-8 text-xs"
              onClick={exportPdf}
              disabled={loading || rows.length === 0}
              title="Pratinjau PDF semua baris sesuai filter aktif"
            >
              Ekspor PDF
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={FileText}
              className="h-8 text-xs"
              onClick={cetakBuktiSetoran}
              disabled={loading || buktiSetoranRows.length === 0}
              title="Cetak bukti setoran rentang Dari–Sampai tanggal, satu banjar, satu tempek"
            >
              Bukti setoran
            </Button>
          </span>
        </div>

        {loading ? (
          <p className="text-xs text-muted py-4">Memuat riwayat…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted py-4">Belum ada pembayaran paturunan tercatat.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={LIST_TABLE_ELEMENT}>
                <thead>
                  <tr className={LIST_HEAD_ROW}>
                    <th>Tanggal</th>
                    <th>No. Pipil</th>
                    <th>Pengarep</th>
                    <th>Banjar</th>
                    <th>Tempek</th>
                    <th>Arahan</th>
                    <th>Nama Paturunan</th>
                    <th>Jenis</th>
                    <th className="text-right">Jumlah</th>
                    <th>Petugas</th>
                    {(canEdit || canDeleteFinancial) && <th className="w-0 text-right">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((r) => (
                    <tr key={r.id} className={LIST_BODY_ROW}>
                      <td className="whitespace-nowrap">{formatTanggalLahir(r.tanggal)}</td>
                      <td className="font-mono text-[11px]">{r.nomor_kartu}</td>
                      <td className="max-w-[9rem] truncate" title={r.kepala_nama}>
                        {r.kepala_nama}
                      </td>
                      <td className="max-w-[5rem] truncate" title={r.banjar_nama}>
                        {r.banjar_nama}
                      </td>
                      <td className="max-w-[4rem] truncate" title={r.tempek_nama}>
                        {r.tempek_nama}
                      </td>
                      <td className="max-w-[4rem] truncate" title={r.arahan_nama}>
                        {r.arahan_nama}
                      </td>
                      <td>{r.iuran_nama}</td>
                      <td>
                        <JenisBadge jenis={r.jenis} />
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        {formatRupiah(r.jumlah)}
                      </td>
                      <td className="text-muted">{r.petugas_nama ?? "—"}</td>
                      {(canEdit || canDeleteFinancial) && (
                        <td className="text-right whitespace-nowrap">
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {canEdit && (
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Pencil}
                              iconOnly
                              title="Edit"
                              className="min-h-7 min-w-7"
                              disabled={editBusy}
                              onClick={() => void handleEdit(r)}
                            />
                            )}
                            {canDeleteFinancial && (
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Trash2}
                              iconOnly
                              title="Hapus"
                              className="min-h-7 min-w-7"
                              onClick={() => requestHapus(r)}
                            />
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              page={safePage}
              totalItems={rows.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              compact
            />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={deleteRow != null}
        title="Hapus pembayaran paturunan?"
        message={
          deleteRow
            ? `Hapus pembayaran ${formatRupiah(deleteRow.jumlah)} (${deleteRow.iuran_nama}, ${jenisLabel(deleteRow.jenis)}) untuk ${deleteRow.kepala_nama}? Sisa tagihan paturunan akan disesuaikan.`
            : ""
        }
        confirmLabel="Ya, hapus"
        busy={deleteBusy}
        onConfirm={() => void confirmHapus()}
        onCancel={() => {
          if (!deleteBusy) setDeleteRow(null);
        }}
      />

      {editRow && editRow.banjar_id && (
        <PaturunanPembayaranDialog
          open
          kramaId={editRow.krama_id}
          iuranId={editRow.iuran_id}
          nomorKartu={editRow.nomor_kartu}
          kepalaNama={editRow.kepala_nama}
          banjarId={editRow.banjar_id}
          banjarNama={editRow.banjar_nama}
          tempekNama={editRow.tempek_nama}
          arahanNama={editRow.arahan_nama}
          tagihan={editTagihan}
          initialTab="riwayat"
          initialEditingPaymentId={editRow.id}
          onClose={closeEditDialog}
          onSuccess={() => void handleEditSuccess()}
          onSaved={onBayarSaved}
          canEdit={canEdit}
          canDeleteFinancial={canDeleteFinancial}
        />
      )}
    </div>
  );
}
