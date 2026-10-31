import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Filter, Gift, HandCoins } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { usePersistedScalar } from "../../lib/page-filter-state";
import { canEditKeuangan } from "../../lib/auth-roles";
import { downloadExcel } from "../../lib/excel-export";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { buildLaporanPenerimaanDanaLainPdfInput } from "../../lib/laporan-penerimaan-dana-lain-pdf";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import {
  getLaporanPenerimaanDanaLain,
  type LaporanPenerimaanDanaLainRingkasan,
  type LaporanPenerimaanDanaLainRow,
} from "../../lib/services/laporan-penerimaan-dana-lain";
import { deletePenerimaanDanaLain } from "../../lib/services/penerimaan-dana-lain";
import type { PenerimaanDanaLainJenis } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { PenerimaanDanaLainDialog } from "../../components/dana-lain/PenerimaanDanaLainDialog";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { HapusPembayaranDialog } from "../../components/pembayaran/HapusPembayaranDialog";
import { DateInput } from "../../components/ui/DateInput";
import { IconLink } from "../../components/ui/IconLink";
import { Input, Label, Select } from "../../components/ui/Input";
import { ListPagination } from "../../components/ui/ListPagination";

const PAGE_ID = "laporan/penerimaan-dana-lain";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function periodeLabel(dari: string, sampai: string): string {
  if (dari && sampai) return `${formatTanggalLahir(dari)} – ${formatTanggalLahir(sampai)}`;
  if (dari) return `Dari ${formatTanggalLahir(dari)}`;
  if (sampai) return `Sampai ${formatTanggalLahir(sampai)}`;
  return "Semua tanggal";
}

export function LaporanPenerimaanDanaLainPage() {
  const { user } = useAuth();
  const canEdit = canEditKeuangan(user?.peran);
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Punia & Kerjasama");
  const [ringkasan, setRingkasan] = useState<LaporanPenerimaanDanaLainRingkasan | null>(null);
  const [rows, setRows] = useState<LaporanPenerimaanDanaLainRow[]>([]);
  const [jenis, setJenis] = usePersistedScalar(PAGE_ID, "jenis", "");
  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [statusSetor, setStatusSetor] = usePersistedScalar(PAGE_ID, "statusSetor", "semua");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [editId, setEditId] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);
  const [hapusBusy, setHapusBusy] = useState(false);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getLaporanPenerimaanDanaLain({
        jenis: (jenis || "") as PenerimaanDanaLainJenis | "",
        dari,
        sampai,
        q,
        statusSetor: (statusSetor as "semua" | "belum" | "sudah") || "semua",
      });
      setRingkasan(res.ringkasan);
      setRows(res.rows);
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setRingkasan(null);
    } finally {
      setLoading(false);
    }
  }, [jenis, dari, sampai, q, statusSetor]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportExcel() {
    void downloadExcel("laporan-punia-kerjasama", {
      name: "Punia & Kerjasama",
      headers: [
        "No",
        "Tanggal",
        "Jenis",
        "Sumber",
        "Nama",
        "No. Kartu",
        "Kegiatan",
        "Jumlah",
        "Petugas",
        "Setor",
        "Ket.",
      ],
      rows: rows.map((r, i) => [
        i + 1,
        r.tanggal,
        r.jenis_label,
        r.sumber_tipe_label,
        r.sumber_nama,
        r.nomor_kartu || "",
        r.kegiatan || "",
        r.jumlah,
        r.petugas_nama || "",
        r.tanggal_setor || "Belum",
        r.keterangan || "",
      ]),
      landscape: true,
    });
  }

  function exportPdf() {
    if (!ringkasan) return;
    const jenisLabel =
      jenis === "punia_kasukretan"
        ? "Punia Kasukretan"
        : jenis === "dana_kerjasama"
          ? "Dana Kerjasama"
          : "Semua jenis";
    openPdfPreview(
      buildLaporanPenerimaanDanaLainPdfInput({
        rows,
        ringkasan,
        periode: periodeLabel(dari, sampai),
        filterLabel: `${jenisLabel} · setor: ${statusSetor}`,
      })
    );
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex items-center gap-2 flex-wrap">
        <IconLink to="/laporan" icon={ArrowLeft}>
          Hub Laporan
        </IconLink>
        <h1 className="text-lg font-semibold text-copper-950 flex items-center gap-1.5">
          <Gift size={18} className="text-copper-700" />
          Punia Kasukretan & Dana Kerjasama
        </h1>
      </div>
      <p className="text-xs text-muted leading-snug">
        Bukan Laporan Punia Paturunan. Ini penerimaan sukarela/insidental dan kerjasama patroli yang
        dicatat petugas atau kantor.
      </p>

      <Card title="Filter" className={isPhone ? LAPORAN_CARD_PHONE : LAPORAN_CARD}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Jenis</Label>
            <Select value={jenis} onChange={(e) => setJenis(e.target.value)}>
              <option value="">Semua</option>
              <option value="punia_kasukretan">Punia Kasukretan</option>
              <option value="dana_kerjasama">Dana Kerjasama</option>
            </Select>
          </div>
          <div>
            <Label>Dari tanggal</Label>
            <DateInput value={dari} onChange={setDari} />
          </div>
          <div>
            <Label>Sampai tanggal</Label>
            <DateInput value={sampai} onChange={setSampai} />
          </div>
          <div>
            <Label>Status setor</Label>
            <Select value={statusSetor} onChange={(e) => setStatusSetor(e.target.value)}>
              <option value="semua">Semua</option>
              <option value="belum">Belum disetor</option>
              <option value="sudah">Sudah disetor</option>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Cari</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nama, kartu, kegiatan, petugas…"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" icon={Filter} className="h-9 text-sm" onClick={() => void load()}>
            Terapkan
          </Button>
          <LaporanExportButtons
            onExcel={exportExcel}
            onPdf={exportPdf}
            disabled={loading || rows.length === 0}
          />
        </div>
      </Card>

      {error && <p className="text-xs text-red-700">{error}</p>}

      {ringkasan && (
        <div className="flex flex-wrap gap-1.5">
          <StatChip label="Transaksi" value={String(ringkasan.jumlah_transaksi)} />
          <StatChip label="Total" value={formatRupiah(ringkasan.total)} />
          <StatChip label="Punia" value={formatRupiah(ringkasan.total_punia)} />
          <StatChip label="Kerjasama" value={formatRupiah(ringkasan.total_kerjasama)} />
          <StatChip label="Belum setor" value={formatRupiah(ringkasan.belum_setor)} />
          <StatChip label="Sudah setor" value={formatRupiah(ringkasan.sudah_setor)} />
        </div>
      )}

      <Card title="Daftar penerimaan" className={isPhone ? LAPORAN_CARD_PHONE : LAPORAN_CARD}>
        {loading ? (
          <p className="text-sm text-muted">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">Belum ada data untuk filter ini.</p>
        ) : isPhone ? (
          <ul className="divide-y divide-copper-100">
            {pagedRows.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-copper-950">{r.sumber_nama}</span>
                  <span className="tabular-nums font-semibold">{formatRupiah(r.jumlah)}</span>
                </div>
                <p className="text-[11px] text-muted">
                  {formatTanggalLahir(r.tanggal)} · {r.jenis_label} · {r.sumber_tipe_label}
                  {r.kegiatan ? ` · ${r.kegiatan}` : ""}
                </p>
                <p className="text-[11px] text-muted">
                  {r.petugas_nama || "—"} ·{" "}
                  {r.tanggal_setor ? `Setor ${formatTanggalLahir(r.tanggal_setor)}` : "Belum disetor"}
                </p>
                {canEdit && !r.setoran_id && (
                  <div className="mt-1 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => setEditId(r.id)}
                    >
                      Ubah
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 text-xs text-red-800"
                      onClick={() => setHapusId(r.id)}
                    >
                      Hapus
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className={LAPORAN_TABLE}>
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th>Tanggal</th>
                  <th>Jenis</th>
                  <th>Sumber</th>
                  <th>Nama</th>
                  <th>Kegiatan</th>
                  <th className="text-right">Jumlah</th>
                  <th>Petugas</th>
                  <th>Setor</th>
                  {canEdit && <th className="w-24" />}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr key={r.id} className="border-b border-copper-100 text-sm">
                    <td className="whitespace-nowrap">{formatTanggalLahir(r.tanggal)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1">
                        {r.jenis === "punia_kasukretan" ? (
                          <Gift size={12} className="text-copper-700" />
                        ) : (
                          <HandCoins size={12} className="text-copper-700" />
                        )}
                        {r.jenis_label}
                      </span>
                    </td>
                    <td>{r.sumber_tipe_label}</td>
                    <td>
                      <span className="font-medium">{r.sumber_nama}</span>
                      {r.nomor_kartu ? (
                        <span className="block text-[11px] text-muted font-mono">{r.nomor_kartu}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[10rem] truncate">{r.kegiatan || "—"}</td>
                    <td className="text-right tabular-nums font-medium">{formatRupiah(r.jumlah)}</td>
                    <td>{r.petugas_nama || "—"}</td>
                    <td
                      className={cn(
                        "whitespace-nowrap",
                        !r.tanggal_setor && "text-amber-900"
                      )}
                    >
                      {r.tanggal_setor ? formatTanggalLahir(r.tanggal_setor) : "Belum"}
                    </td>
                    {canEdit && (
                      <td className="whitespace-nowrap text-right">
                        {!r.setoran_id ? (
                          <span className="inline-flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-7 px-1.5 text-[11px]"
                              onClick={() => setEditId(r.id)}
                            >
                              Ubah
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-7 px-1.5 text-[11px] text-red-800"
                              onClick={() => setHapusId(r.id)}
                            >
                              Hapus
                            </Button>
                          </span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
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
          compact
        />
      </Card>

      {editId && (
        <PenerimaanDanaLainDialog
          open
          onClose={() => setEditId(null)}
          jenis="punia_kasukretan"
          editingId={editId}
          createdBy={user?.id}
          onSaved={() => {
            setEditId(null);
            void load();
          }}
        />
      )}

      <HapusPembayaranDialog
        open={hapusId != null}
        title="Hapus penerimaan?"
        message="Penerimaan akan dihapus. Jika sudah setor langsung ke buku kas, saldo ikut berkurang."
        confirmLabel="Ya, hapus"
        busy={hapusBusy}
        onConfirm={(alasan) => {
          if (!hapusId) return;
          setHapusBusy(true);
          void deletePenerimaanDanaLain(hapusId, {
            ...alasan,
            dihapusOlehUserId: user?.id,
          })
            .then(async () => {
              setHapusId(null);
              await load();
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setHapusBusy(false));
        }}
        onCancel={() => {
          if (!hapusBusy) setHapusId(null);
        }}
      />
    </div>
  );
}
