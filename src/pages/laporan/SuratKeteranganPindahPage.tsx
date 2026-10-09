import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { getDesaAdat } from "../../lib/services/desa";
import {
  listSuratKeteranganPindah,
  deleteSuratKeteranganPindah,
  parseSkpSnapshot,
  type SkpJenis,
  type SuratKeteranganPindahListRow,
} from "../../lib/services/surat-keterangan-pindah";
import { stashSuratKeteranganPindahPreview } from "../../lib/laporan-pdf-preview";
import { buildSuratKeteranganPindahPdfPayload } from "../../lib/surat-keterangan-pindah-pdf";
import { listBanjar } from "../../lib/services/master";
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
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SuratKeteranganPindahEditDialog } from "../../components/laporan/SuratKeteranganPindahEditDialog";
import { ArrowLeft, FileText, Pencil, Printer, RotateCcw, Trash2 } from "lucide-react";

const TABLE_COLS =
  "[&_colgroup_col:nth-child(1)]:w-[9%] [&_colgroup_col:nth-child(2)]:w-[14%] [&_colgroup_col:nth-child(3)]:w-[8%] [&_colgroup_col:nth-child(4)]:w-[14%] [&_colgroup_col:nth-child(5)]:w-[11%] [&_colgroup_col:nth-child(6)]:w-[18%] [&_colgroup_col:nth-child(7)]:w-[26%]";

function jenisLabel(jenis: SkpJenis): string {
  return jenis === "keluarga" ? "Keluarga" : "Anggota";
}

const PAGE_ID = "laporan/surat-keterangan-pindah";

export function SuratKeteranganPindahPage() {
  const isPhone = useIsPhoneClient();
  const openPdf = useLaporanPdfNavigate();
  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [rows, setRows] = useState<SuratKeteranganPindahListRow[]>([]);

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [jenis, setJenis] = usePersistedScalar(PAGE_ID, "jenis", "");
  const [tanggalDari, setTanggalDari] = usePersistedScalar(PAGE_ID, "tanggalDari", "");
  const [tanggalSampai, setTanggalSampai] = usePersistedScalar(PAGE_ID, "tanggalSampai", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [busyId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<SuratKeteranganPindahListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SuratKeteranganPindahListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

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
    listBanjar().then(setBanjar);
  }, []);

  const load = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const result = await listSuratKeteranganPindah({
        banjarId: banjarId || undefined,
        jenis: jenis ? (jenis as SkpJenis) : undefined,
        tanggalDari: tanggalDari || undefined,
        tanggalSampai: tanggalSampai || undefined,
        q: debouncedQ || undefined,
      });
      setRows(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [banjarId, jenis, tanggalDari, tanggalSampai, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setJenis("");
    setBanjarId("");
    setTanggalDari("");
    setTanggalSampai("");
  }

  async function reprint(suratId: string) {
    setPrinting(true);
    setError("");
    try {
      const desa = await getDesaAdat();
      if (!desa) throw new Error("Data desa adat belum ada.");
      const row = rows.find((r) => r.id === suratId);
      if (!row) throw new Error("Surat tidak ditemukan.");
      const payload = buildSuratKeteranganPindahPdfPayload(desa, row);
      openPdf((backTo) =>
        stashSuratKeteranganPindahPreview([payload], backTo, "Kembali ke arsip SKP")
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      window.alert(msg);
    } finally {
      setPrinting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setError("");
    try {
      await deleteSuratKeteranganPindah(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <FileText className="text-copper-700" size={22} />
            Surat Keterangan Pindah
          </h2>
          <p className="text-[11px] text-muted mt-0.5">
            Arsip SKP keluarga & anggota — nomor SKP otomatis, cetak ulang tanpa nomor baru.
          </p>
        </div>
        <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
          Laporan
        </IconLink>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      <Card title="Arsip surat" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
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
              placeholder="Nama / nomor SKP / no. Pipil…"
            />
          </div>
          <div className="min-w-[100px]">
            <Label>Jenis</Label>
            <Select value={jenis} onChange={(e) => setJenis(e.target.value)}>
              <option value="">Semua</option>
              <option value="keluarga">Keluarga</option>
              <option value="anggota">Anggota</option>
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
          <div className="min-w-[120px]">
            <Label>Tanggal dari</Label>
            <Input type="date" value={tanggalDari} onChange={(e) => setTanggalDari(e.target.value)} />
          </div>
          <div className="min-w-[120px]">
            <Label>Tanggal sampai</Label>
            <Input
              type="date"
              value={tanggalSampai}
              onChange={(e) => setTanggalSampai(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-1">
            <Button type="button" variant="secondary" icon={RotateCcw} onClick={resetFilters}>
              Reset
            </Button>
          </div>
        </div>

        <div className={LAPORAN_HEAD_ROW}>
          <span className="text-xs text-muted">
            {loading ? "Memuat…" : `${rows.length} surat terarsip`}
          </span>
        </div>

        {isPhone ? (
          <ul className="space-y-2">
            {loading ? (
              <li className="py-4 text-center text-muted text-xs">Memuat data…</li>
            ) : pagedRows.length === 0 ? (
              <li className="py-4 text-center text-muted text-xs">Belum ada surat keterangan pindah.</li>
            ) : (
              pagedRows.map((r) => {
                const snap = parseSkpSnapshot(r.snapshot_json);
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-copper-950">{r.nama_subjek}</p>
                      <p className="font-mono text-[11px] text-copper-700 tabular-nums">{r.nomor_surat}</p>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted">
                      {[jenisLabel(r.jenis), r.banjar_nama, formatTanggalLahir(r.tanggal_terbit)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-copper-800">{snap.desa_adat_tujuan}</p>
                    <div className="mt-2 flex h-10 items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Printer}
                        iconOnly
                        className="h-10 w-10 min-h-10 min-w-10"
                        title="Cetak ulang"
                        aria-label="Cetak ulang"
                        disabled={printing || busyId === r.id}
                        onClick={() => void reprint(r.id)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Pencil}
                        iconOnly
                        className="h-10 w-10 min-h-10 min-w-10"
                        title="Edit"
                        aria-label="Edit surat"
                        disabled={busyId === r.id}
                        onClick={() => setEditRow(r)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        icon={Trash2}
                        iconOnly
                        className="h-10 w-10 min-h-10 min-w-10 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Hapus"
                        aria-label="Hapus surat"
                        disabled={busyId === r.id || deleteBusy}
                        onClick={() => setDeleteTarget(r)}
                      />
                    </div>
                  </li>
                );
              })
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
                  <th>Tanggal</th>
                  <th>Nomor SKP</th>
                  <th>Jenis</th>
                  <th>Nama subjek</th>
                  <th>Banjar</th>
                  <th>Desa adat tujuan</th>
                  <th>Aksi</th>
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
                      Belum ada surat keterangan pindah.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => {
                    const snap = parseSkpSnapshot(r.snapshot_json);
                    return (
                      <tr key={r.id}>
                        <td className="tabular-nums text-[11px]">
                          {formatTanggalLahir(r.tanggal_terbit)}
                        </td>
                        <td className="text-[11px] tabular-nums">{r.nomor_surat}</td>
                        <td className="text-[11px]">{jenisLabel(r.jenis)}</td>
                        <td>{r.nama_subjek}</td>
                        <td className="text-muted text-[11px]">{r.banjar_nama}</td>
                        <td className="text-[11px]">{snap.desa_adat_tujuan}</td>
                        <td>
                          <div className="flex gap-0.5 justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Printer}
                              iconOnly
                              title="Cetak ulang"
                              aria-label="Cetak ulang"
                              disabled={printing || busyId === r.id}
                              onClick={() => void reprint(r.id)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Pencil}
                              iconOnly
                              title="Edit"
                              aria-label="Edit surat"
                              disabled={busyId === r.id}
                              onClick={() => setEditRow(r)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Trash2}
                              iconOnly
                              title="Hapus"
                              aria-label="Hapus surat"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={busyId === r.id || deleteBusy}
                              onClick={() => setDeleteTarget(r)}
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
        )}

        <ListPagination
          page={safePage}
          totalItems={rows.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Card>

      <SuratKeteranganPindahEditDialog
        open={editRow !== null}
        row={editRow}
        onClose={() => setEditRow(null)}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus arsip SKP"
        message={
          deleteTarget
            ? `Hapus arsip ${deleteTarget.nomor_surat} (${parseSkpSnapshot(deleteTarget.snapshot_json).nama_subjek})? Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        busy={deleteBusy}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
