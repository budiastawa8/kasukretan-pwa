import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Filter, Trash2 } from "lucide-react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { usePersistedScalar } from "../../lib/page-filter-state";
import { downloadExcel } from "../../lib/excel-export";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import {
  labelAlasanHapusPembayaran,
  listPembayaranHapusLog,
  type PembayaranHapusLogRow,
} from "../../lib/services/pembayaran-hapus-log";
import { listTimKasukretan } from "../../lib/services/master";
import type { TimKasukretan } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
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
import { DateInput } from "../../components/ui/DateInput";
import { IconLink } from "../../components/ui/IconLink";
import { Input, Label, Select } from "../../components/ui/Input";
import { ListPagination } from "../../components/ui/ListPagination";

const PAGE_ID = "laporan/pembayaran-hapus";

function sumberLabel(sumber: string): string {
  if (sumber === "paturunan") return "Paturunan";
  if (sumber === "dudukan") return "Dudukan";
  if (sumber === "dana_lain") return "Punia / Kerjasama";
  return sumber;
}

export function LaporanPembayaranHapusPage() {
  const isPhone = useIsPhoneClient();
  const [rows, setRows] = useState<PembayaranHapusLogRow[]>([]);
  const [tim, setTim] = useState<TimKasukretan[]>([]);
  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");
  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");
  const [sumber, setSumber] = usePersistedScalar(PAGE_ID, "sumber", "");
  const [petugasId, setPetugasId] = usePersistedScalar(PAGE_ID, "petugasId", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

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
      const [list, timRows] = await Promise.all([
        listPembayaranHapusLog({
          dari,
          sampai,
          sumber: (sumber || "") as "" | "paturunan" | "dudukan" | "dana_lain",
          petugasId: petugasId || undefined,
          q,
        }),
        listTimKasukretan().catch(() => [] as TimKasukretan[]),
      ]);
      setRows(list);
      setTim(timRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dari, sampai, sumber, petugasId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalJumlah = useMemo(
    () => rows.reduce((s, r) => s + r.jumlah, 0),
    [rows]
  );

  function exportExcel() {
    void downloadExcel("jejak-hapus-pembayaran", {
      name: "Jejak Hapus",
      headers: [
        "Waktu hapus",
        "Sumber",
        "Tanggal transaksi",
        "Krama / pemberi",
        "Nomor kartu",
        "Uraian",
        "Jumlah",
        "Petugas pencatat",
        "Dihapus oleh",
        "Alasan",
      ],
      rows: rows.map((r) => [
        r.created_at,
        sumberLabel(r.sumber),
        r.tanggal_transaksi,
        r.kepala_nama ?? "",
        r.nomor_kartu ?? "",
        r.uraian ?? "",
        r.jumlah,
        r.petugas_nama ?? "",
        r.dihapus_oleh_nama ?? "",
        r.alasan_teks || labelAlasanHapusPembayaran(r.alasan_kode),
      ]),
    });
  }

  return (
    <div className={cn(LAPORAN_PAGE, "w-full max-w-full")}>
      <div className={LAPORAN_HEAD_ROW}>
        <IconLink to="/laporan" icon={ArrowLeft} className="shrink-0">
          Laporan
        </IconLink>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-copper-950 leading-tight flex items-center gap-2">
            <Trash2 className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
            Jejak Hapus Pembayaran
          </h1>
          <p className="text-xs text-muted mt-0.5 leading-snug">
            Audit pembayaran yang dihapus petugas/kantor sebelum masuk setoran — termasuk alasan.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={Download}
          className="h-9 text-xs shrink-0"
          onClick={exportExcel}
          disabled={loading || rows.length === 0}
        >
          Excel
        </Button>
      </div>

      <Card title="Filter" className={isPhone ? LAPORAN_CARD_PHONE : LAPORAN_CARD}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label>Dari (tanggal hapus)</Label>
            <DateInput value={dari} onChange={setDari} />
          </div>
          <div>
            <Label>Sampai</Label>
            <DateInput value={sampai} onChange={setSampai} />
          </div>
          <div>
            <Label>Sumber</Label>
            <Select value={sumber} onChange={(e) => setSumber(e.target.value)}>
              <option value="">Semua</option>
              <option value="paturunan">Paturunan</option>
              <option value="dudukan">Dudukan</option>
              <option value="dana_lain">Punia / Kerjasama</option>
            </Select>
          </div>
          <div>
            <Label>Petugas</Label>
            <Select value={petugasId} onChange={(e) => setPetugasId(e.target.value)}>
              <option value="">Semua</option>
              {tim.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Cari</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nama, kartu, uraian, alasan…"
            />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={Filter}
            className={cn("text-xs", isPhone ? "h-10" : "h-8")}
            onClick={() => void load()}
            disabled={loading}
          >
            Terapkan
          </Button>
          <span className="text-xs text-muted">
            {rows.length} jejak · total {formatRupiah(totalJumlah)}
          </span>
        </div>
      </Card>

      <Card title="Daftar hapus" className={cn(isPhone ? LAPORAN_CARD_PHONE : LAPORAN_CARD, LAPORAN_TABLE, "mt-3")}>
        {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">Belum ada jejak hapus pada filter ini.</p>
        ) : isPhone ? (
          <ul className="divide-y divide-copper-100">
            {pagedRows.map((r) => (
              <li key={r.id} className="py-2 space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-sm text-copper-950 truncate">
                    {r.kepala_nama || "—"}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-amber-950">
                    {formatRupiah(r.jumlah)}
                  </span>
                </div>
                <p className="text-[11px] text-muted">
                  {sumberLabel(r.sumber)} · {r.uraian}
                </p>
                <p className="text-[11px] text-muted">
                  Hapus {formatTanggalLahir(r.created_at.slice(0, 10))}
                  {r.dihapus_oleh_nama ? ` · oleh ${r.dihapus_oleh_nama}` : ""}
                </p>
                <p className="text-xs text-copper-900">
                  Alasan: {r.alasan_teks || labelAlasanHapusPembayaran(r.alasan_kode)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr>
                  <th>Waktu hapus</th>
                  <th>Sumber</th>
                  <th>Krama / pemberi</th>
                  <th>Uraian</th>
                  <th className="text-right">Jumlah</th>
                  <th>Dihapus oleh</th>
                  <th>Alasan</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-xs">
                      {r.created_at.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="text-xs">{sumberLabel(r.sumber)}</td>
                    <td>
                      <span className="font-medium">{r.kepala_nama || "—"}</span>
                      {r.nomor_kartu ? (
                        <span className="block text-[11px] text-muted font-mono">
                          {r.nomor_kartu}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-xs max-w-[14rem] truncate" title={r.uraian ?? ""}>
                      {r.uraian}
                    </td>
                    <td className="text-right tabular-nums font-semibold">
                      {formatRupiah(r.jumlah)}
                    </td>
                    <td className="text-xs">
                      {r.dihapus_oleh_nama || "—"}
                      {r.petugas_nama && r.petugas_nama !== r.dihapus_oleh_nama ? (
                        <span className="block text-muted">catat: {r.petugas_nama}</span>
                      ) : null}
                    </td>
                    <td className="text-xs">{r.alasan_teks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPagination
          page={safePage}
          pageSize={pageSize}
          totalItems={rows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          compact
        />
      </Card>
    </div>
  );
}
