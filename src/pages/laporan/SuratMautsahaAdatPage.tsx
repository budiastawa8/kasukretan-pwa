import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";
import { ArrowLeft, Printer, Receipt, Trash2 } from "lucide-react";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { getDesaAdat } from "../../lib/services/desa";
import {
  deleteSuratMautsahaAdat,
  listSuratMautsahaAdat,
  type SuratMautsahaAdatListRow,
} from "../../lib/services/surat-keterangan-mautsaha-adat";
import {
  stashKwitansiIpmaPreview,
  stashSuratMautsahaAdatPreview,
} from "../../lib/laporan-pdf-preview";
import { buildSuratMautsahaAdatPdfPayload } from "../../lib/surat-keterangan-mautsaha-adat-pdf";
import { formatRupiah } from "../../lib/paturunan-hitung";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { useAuth } from "../../context/AuthContext";
import { canDeleteArsipIpma } from "../../lib/auth-roles";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import { ListPagination } from "../../components/ui/ListPagination";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { LIST_FILTER_ROW } from "../../components/ui/list-compact";

export function SuratMautsahaAdatPage() {
  const isPhone = useIsPhoneClient();
  const openPdf = useLaporanPdfNavigate();
  const { user } = useAuth();
  const canDeleteArsip = canDeleteArsipIpma(user?.peran);

  const [rows, setRows] = useState<SuratMautsahaAdatListRow[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tanggalDari, setTanggalDari] = useState("");
  const [tanggalSampai, setTanggalSampai] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [deleteTarget, setDeleteTarget] = useState<SuratMautsahaAdatListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const safePage = useMemo(() => clampPage(page, rows.length, pageSize), [page, rows.length, pageSize]);
  const pagedRows = useMemo(() => paginateSlice(rows, safePage, pageSize), [rows, safePage, pageSize]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const result = await listSuratMautsahaAdat({
        q: debouncedQ || undefined,
        tanggalDari: tanggalDari || undefined,
        tanggalSampai: tanggalSampai || undefined,
      });
      setRows(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, tanggalDari, tanggalSampai]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reprintKwitansi(suratId: string) {
    setPrinting(true);
    setError("");
    try {
      const desa = await getDesaAdat();
      if (!desa) throw new Error("Data desa adat belum ada.");
      const row = rows.find((r) => r.id === suratId);
      if (!row) throw new Error("Surat tidak ditemukan.");
      if (Math.round(Number(row.tarif_nominal) || 0) <= 0) {
        throw new Error("Surat ini tidak memiliki biaya administrasi.");
      }
      const payload = buildSuratMautsahaAdatPdfPayload(desa, row);
      openPdf((backTo) =>
        stashKwitansiIpmaPreview([payload], backTo, "Kembali ke arsip IPMA")
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setPrinting(false);
    }
  }

  async function reprint(suratId: string) {
    setPrinting(true);
    setError("");
    try {
      const desa = await getDesaAdat();
      if (!desa) throw new Error("Data desa adat belum ada.");
      const row = rows.find((r) => r.id === suratId);
      if (!row) throw new Error("Surat tidak ditemukan.");
      const payload = buildSuratMautsahaAdatPdfPayload(desa, row);
      openPdf((backTo) =>
        stashSuratMautsahaAdatPreview([payload], backTo, "Kembali ke arsip IPMA")
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setPrinting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !canDeleteArsip) return;
    setDeleteBusy(true);
    try {
      await deleteSuratMautsahaAdat(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex items-center gap-2 mb-3">
        <IconLink to="/laporan" icon={ArrowLeft} variant="secondary" iconOnly title="Kembali" />
        <div>
          <h1 className="text-lg font-semibold text-copper-950">Arsip Surat IPMA</h1>
          <p className="text-sm text-muted">ILIKITA Pemasih Mautsaha Adat — riwayat penerbitan.</p>
        </div>
      </div>

      <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}>
        <div className={LIST_FILTER_ROW}>
          <div className="flex-1 min-w-[8rem]">
            <Label>Cari</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nama usaha / nomor" />
          </div>
          <div>
            <Label>Dari</Label>
            <Input type="date" value={tanggalDari} onChange={(e) => setTanggalDari(e.target.value)} />
          </div>
          <div>
            <Label>Sampai</Label>
            <Input type="date" value={tanggalSampai} onChange={(e) => setTanggalSampai(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

        <div className={LAPORAN_TABLE}>
          {isPhone ? (
            <ul className="space-y-2">
              {loading ? (
                <li className="p-3 text-sm text-muted">Memuat...</li>
              ) : pagedRows.length === 0 ? (
                <li className="p-3 text-sm text-muted">Belum ada arsip.</li>
              ) : (
                pagedRows.map((row) => {
                  const biaya =
                    Math.round(Number(row.tarif_nominal) || 0) > 0
                      ? formatRupiah(Number(row.tarif_nominal))
                      : "—";
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-copper-950">{row.lembaga_nama}</p>
                        <p className="font-mono text-[11px] text-copper-700">{row.nomor_surat}</p>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-muted capitalize">
                        {row.jenis.replace("_", " ")} · {formatTanggalLahir(row.tanggal_terbit)}
                      </p>
                      <p className="mt-1 text-xs text-copper-800">
                        Berlaku s/d {formatTanggalLahir(row.tanggal_berlaku_sampai)} · Biaya {biaya}
                      </p>
                      <div className="mt-2 flex h-10 items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-10 min-w-10 px-2"
                          disabled={printing}
                          title="Cetak surat IPMA"
                          onClick={() => void reprint(row.id)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        {Math.round(Number(row.tarif_nominal) || 0) > 0 && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 min-w-10 px-2"
                            disabled={printing}
                            title="Cetak kwitansi biaya admin"
                            onClick={() => void reprintKwitansi(row.id)}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDeleteArsip && (
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-10 min-w-10 px-2"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          ) : (
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th>Nomor</th>
                  <th>Tanggal</th>
                  <th>Lembaga/Usaha</th>
                  <th>Jenis</th>
                  <th>Berlaku s/d</th>
                  <th>Biaya</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-3 text-sm text-muted">
                      Memuat...
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-3 text-sm text-muted">
                      Belum ada arsip.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="text-sm font-mono">{row.nomor_surat}</td>
                      <td className="text-sm">{formatTanggalLahir(row.tanggal_terbit)}</td>
                      <td className="text-sm">{row.lembaga_nama}</td>
                      <td className="text-sm capitalize">{row.jenis.replace("_", " ")}</td>
                      <td className="text-sm">{formatTanggalLahir(row.tanggal_berlaku_sampai)}</td>
                      <td className="text-sm tabular-nums">
                        {Math.round(Number(row.tarif_nominal) || 0) > 0
                          ? formatRupiah(Number(row.tarif_nominal))
                          : "—"}
                      </td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={printing}
                            title="Cetak surat IPMA"
                            onClick={() => void reprint(row.id)}
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {Math.round(Number(row.tarif_nominal) || 0) > 0 && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={printing}
                              title="Cetak kwitansi biaya admin"
                              onClick={() => void reprintKwitansi(row.id)}
                            >
                              <Receipt className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDeleteArsip && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <ListPagination
          page={safePage}
          totalItems={rows.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Card>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Hapus arsip surat?"
        message={`Hapus ${deleteTarget?.nomor_surat}? Arsip surat dihapus; transaksi biaya admin (jika ada) tetap di Keuangan → Pemasukan dan dapat dihapus terpisah.`}
        confirmLabel="Hapus"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
