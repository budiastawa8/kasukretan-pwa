import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";

import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";

import { buildBuktiSetoranDudukanPdfPayload, paymentDayKey } from "../../lib/bukti-setoran-pdf";

import { downloadExcel } from "../../lib/excel-export";

import {
  stashBuktiSetoranDudukanPreview,
  stashLaporanPdfPreview,
} from "../../lib/laporan-pdf-preview";

import {

  formatPeriodeDudukanMmYyyy,

  formatBulanIndonesia,

  formatRupiah,

  tahunSaatIni,

} from "../../lib/dudukan-hitung";

import {

  deletePembayaranDudukan,

  listRiwayatPembayaranDudukan,

  type DudukanRiwayatRow,

} from "../../lib/services/dudukan-pembayaran";

import { listBanjar } from "../../lib/services/dudukan";

import { listTimKasukretan } from "../../lib/services/master";

import { listRtBtnPemasih } from "../../lib/services/krama-query";

import {
  buildRiwayatDudukanPdfInput,
  type RiwayatDudukanExportFilter,
} from "../../lib/riwayat-dudukan-export";

import type { Banjar, TimKasukretan } from "../../lib/types";

import { cn, formatTanggalLahir } from "../../lib/utils";

import { Card } from "../ui/Card";

import { DateInput } from "../ui/DateInput";

import { Input, Label, Select } from "../ui/Input";

import { ListPagination } from "../ui/ListPagination";

import { Button } from "../ui/Button";

import { DUDUKAN_CARD } from "./dudukan-compact";

import { ConfirmDialog } from "../ui/ConfirmDialog";

import { DudukanPembayaranDialog } from "./DudukanPembayaranDialog";

import {

  LIST_BODY_ROW,

  LIST_HEAD_ROW,

  LIST_TABLE,

  LIST_TABLE_ELEMENT,

} from "../ui/list-compact";

import { FileSpreadsheet, FileText, Filter, Pencil, RotateCcw, Trash2 } from "lucide-react";



function klasifikasiLabel(kode: string): string {

  if (kode === "KRAMA_TAMIU") return "Krama Tamiu";

  if (kode === "TAMIU") return "Tamiu";

  return kode;

}



function riwayatExportFilename(params: {

  dari: string;

  sampai: string;

  tahun: string;

  bulan: string;

}): string {

  const parts = ["riwayat-dudukan"];

  if (params.dari) parts.push(`dari-${params.dari}`);

  if (params.sampai) parts.push(`sampai-${params.sampai}`);

  if (params.tahun) parts.push(`th${params.tahun}`);

  if (params.bulan) parts.push(`bln${params.bulan.padStart(2, "0")}`);

  return parts.join("-");

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



const PAGE_ID = "dudukan/riwayat";

export function DudukanRiwayatPanel({

  refreshToken = 0,

  canEdit = false,

  canDeleteFinancial = false,

  onDataChange,

  onBayarSaved,

}: Props) {

  const openPdf = useLaporanPdfNavigate();

  const [rows, setRows] = useState<DudukanRiwayatRow[]>([]);

  const [banjar, setBanjar] = useState<Banjar[]>([]);

  const [tim, setTim] = useState<TimKasukretan[]>([]);

  const [tahun, setTahun] = usePersistedScalar(PAGE_ID, "tahun", "");

  const [bulan, setBulan] = usePersistedScalar(PAGE_ID, "bulan", "");

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");

  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");

  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);

  const [petugasId, setPetugasId] = usePersistedScalar(PAGE_ID, "petugasId", "");

  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");

  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");

  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");

  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");

  const [page, setPage] = useState(1);

  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [editKramaId, setEditKramaId] = useState<string | null>(null);

  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<DudukanRiwayatRow | null>(null);

  const [deleteBusy, setDeleteBusy] = useState(false);



  const hasFilters =

    banjarId !== "" ||

    rtBtn !== "" ||

    petugasId !== "" ||

    dari !== "" ||

    sampai !== "" ||

    klasifikasi !== "" ||

    q.trim() !== "" ||

    tahun !== "" ||

    bulan !== "";



  const buktiSetoranRows = useMemo(() => {

    const tanggal = dari.trim();

    if (!tanggal) return [];

    return rows.filter((r) => paymentDayKey(r.tanggal) === tanggal);

  }, [rows, dari]);



  const load = useCallback(async () => {

    setLoading(true);

    setError("");

    try {

      const tahunNum = tahun.trim() ? Number(tahun) : undefined;

      const bulanNum = bulan.trim() ? Number(bulan) : undefined;

      const [list, b] = await Promise.all([

        listRiwayatPembayaranDudukan({

          tahun: tahunNum != null && Number.isFinite(tahunNum) ? tahunNum : undefined,

          bulan: bulanNum != null && Number.isFinite(bulanNum) ? bulanNum : undefined,

          banjarId: banjarId || undefined,

          rtBtn: rtBtn || undefined,

          petugasId: petugasId || undefined,

          dari: dari || undefined,

          sampai: sampai || undefined,

          klasifikasi: (klasifikasi as "KRAMA_TAMIU" | "TAMIU") || undefined,

          q: q || undefined,

        }),

        listBanjar(),

      ]);

      setRows(list);

      setBanjar(b);

      setPage(1);

    } catch (e) {

      setError(String(e));

    } finally {

      setLoading(false);

    }

  }, [tahun, bulan, banjarId, rtBtn, petugasId, dari, sampai, klasifikasi, q]);



  useEffect(() => {

    load();

  }, [load, refreshToken]);



  useEffect(() => {

    setRtBtn("");

    listRtBtnPemasih({ banjarId: banjarId || undefined, statusKrama: "aktif" }).then(

      setRtBtnOptions

    );

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



  const totalKas = rows.reduce((s, r) => s + r.jumlah, 0);



  const exportFilter = useMemo((): RiwayatDudukanExportFilter => {

    const filter: RiwayatDudukanExportFilter = {};

    if (banjarId) filter.banjarNama = banjar.find((b) => b.id === banjarId)?.nama;

    if (rtBtn) filter.rtBtn = rtBtn;

    if (petugasId) {

      const petugas = tim.find((t) => t.id === petugasId);

      filter.petugasNama = petugas

        ? `${petugas.nama}${!banjarId && petugas.banjar_nama ? ` (${petugas.banjar_nama})` : ""}`

        : undefined;

    }

    if (klasifikasi) filter.klasifikasi = klasifikasiLabel(klasifikasi);

    if (tahun.trim()) filter.tahunTagihan = tahun.trim();

    if (bulan.trim()) {

      const bulanNum = Number(bulan);

      if (Number.isFinite(bulanNum)) {

        filter.bulanTagihan = formatBulanIndonesia(

          bulanNum,

          Number(tahun) || tahunSaatIni()

        );

      }

    }

    if (q.trim()) filter.q = q.trim();

    return filter;

  }, [banjarId, rtBtn, petugasId, klasifikasi, tahun, bulan, q, banjar, tim]);



  function resetFilters() {
    clearPagePersistedState(PAGE_ID);

    setTahun("");

    setBulan("");

    setBanjarId("");

    setRtBtn("");

    setPetugasId("");

    setDari("");

    setSampai("");

    setKlasifikasi("");

    setQ("");

  }



  function cetakBuktiSetoran() {

    const tanggal = dari.trim();

    if (!tanggal) {

      window.alert("Isi Dari tanggal untuk bukti setoran (satu hari).");

      return;

    }

    if (buktiSetoranRows.length === 0) {

      window.alert("Tidak ada pembayaran pada tanggal yang dipilih.");

      return;

    }

    try {

      openPdf((backTo) =>
        stashBuktiSetoranDudukanPreview(
          buildBuktiSetoranDudukanPdfPayload(buktiSetoranRows, { dari: tanggal }),
          backTo,
          "Kembali ke Dudukan"
        )
      );

    } catch (e) {

      window.alert(e instanceof Error ? e.message : String(e));

    }

  }



  function exportPdf() {

    if (rows.length === 0) return;

    try {

      openPdf((backTo) =>
        stashLaporanPdfPreview({
          input: buildRiwayatDudukanPdfInput(rows, { dari, sampai, filter: exportFilter }),
          backTo,
          backLabel: "Kembali ke Dudukan",
        })
      );

    } catch (e) {

      window.alert(e instanceof Error ? e.message : String(e));

    }

  }



  async function exportExcel() {

    if (rows.length === 0) return;

    const headers = [

      "Tgl. Bayar",

      "No. Kartu",

      "Pengajeg",

      "Banjar",

      "Klasifikasi",

      "Jenis",

      "Periode Tagihan",

      "Jumlah",

      "Petugas",

      "Alamat",

      "RT/BTN",

      "Keterangan",

    ];

    const data = rows.map((r) => [

      formatTanggalLahir(r.tanggal),

      r.nomor_kartu,

      r.kepala_nama,

      r.banjar_nama,

      klasifikasiLabel(r.klasifikasi_kode),

      r.jenis_nama,

      formatPeriodeDudukanMmYyyy(r.bulan, r.tahun),

      r.jumlah,

      r.petugas_nama ?? "",

      r.alamat,

      r.rt_btn,

      r.keterangan ?? "",

    ]);

    data.push(["", "", "", "", "", "", "Total", totalKas, "", "", "", ""]);

    await downloadExcel(riwayatExportFilename({ dari, sampai, tahun, bulan }), {

      name: "Riwayat",

      headers,

      rows: data,

      landscape: true,

    });

  }



  function handleEdit(row: DudukanRiwayatRow) {

    if (!canEdit) return;

    setEditKramaId(row.krama_id);

    setEditPaymentId(row.id);

  }



  function closeEditDialog() {

    setEditKramaId(null);

    setEditPaymentId(null);

  }



  function requestHapus(row: DudukanRiwayatRow) {

    if (!canDeleteFinancial) return;

    setDeleteRow(row);

  }



  async function confirmHapus() {

    if (!deleteRow || !canDeleteFinancial) return;

    setDeleteBusy(true);

    setError("");

    try {

      await deletePembayaranDudukan(deleteRow.id);

      setDeleteRow(null);

      await load();

      onDataChange?.();

    } catch (e) {

      setError(String(e));

    } finally {

      setDeleteBusy(false);

    }

  }



  async function handleEditSuccess() {

    await load();

    onDataChange?.();

  }



  return (

    <div className="space-y-2">

      {error && (

        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">

          {error}

        </p>

      )}



      <Card compact className={cn(DUDUKAN_CARD, LIST_TABLE)}>

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

              <DateInput value={dari} onChange={setDari} />

            </div>

            <div>

              <Label>Sampai tanggal</Label>

              <DateInput value={sampai} onChange={setSampai} />

            </div>

            <div>

              <Label>Tahun tagihan</Label>

              <Input

                type="number"

                min={2000}

                max={2100}

                value={tahun}

                onChange={(e) => setTahun(e.target.value)}

                placeholder="Semua tahun"

              />

            </div>

            <div>

              <Label>Bulan tagihan</Label>

              <Select value={bulan} onChange={(e) => setBulan(e.target.value)}>

                <option value="">Semua bulan</option>

                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (

                  <option key={m} value={String(m)}>

                    {formatBulanIndonesia(m, Number(tahun) || tahunSaatIni())}

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

              <Label>RT/BTN</Label>

              <Select value={rtBtn} onChange={(e) => setRtBtn(e.target.value)}>

                <option value="">Semua RT/BTN</option>

                {rtBtnOptions.map((v) => (

                  <option key={v} value={v}>

                    {v}

                  </option>

                ))}

              </Select>

            </div>

            <div>

              <Label>Klasifikasi</Label>

              <Select value={klasifikasi} onChange={(e) => setKlasifikasi(e.target.value)}>

                <option value="">Semua</option>

                <option value="KRAMA_TAMIU">Krama Tamiu</option>

                <option value="TAMIU">Tamiu</option>

              </Select>

            </div>

            <div>

              <Label>Cari kartu / nama</Label>

              <Input

                value={q}

                onChange={(e) => setQ(e.target.value)}

                placeholder="Nomor kartu atau nama Pengajeg"

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

          <StatChip label="Total kas" value={formatRupiah(totalKas)} />

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

            Excel

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

            disabled={loading || !dari.trim() || buktiSetoranRows.length === 0}

            title="Cetak bukti setoran satu hari (Dari tanggal), dikelompokkan Petugas lalu RT/BTN"

          >

            Bukti setoran

          </Button>

          </span>

        </div>



        {loading ? (

          <p className="text-xs text-muted py-4">Memuat riwayat…</p>

        ) : rows.length === 0 ? (

          <p className="text-xs text-muted py-4">Belum ada pembayaran dudukan tercatat.</p>

        ) : (

          <>

            <div className="overflow-x-auto">

              <table className={LIST_TABLE_ELEMENT}>

                <thead>

                  <tr className={LIST_HEAD_ROW}>

                    <th>Tgl. Bayar</th>

                    <th>No. Kartu</th>

                    <th>Pengajeg</th>

                    <th>Alamat</th>

                    <th>Jenis</th>

                    <th>Periode</th>

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

                      <td className="max-w-[8rem] truncate" title={r.kepala_nama}>

                        {r.kepala_nama}

                      </td>

                      <td className="max-w-[10rem] truncate text-muted" title={r.alamat}>

                        {r.alamat}

                      </td>

                      <td className="max-w-[7rem] truncate text-muted" title={r.jenis_nama}>

                        {r.jenis_nama}

                      </td>

                      <td className="whitespace-nowrap tabular-nums">

                        {formatPeriodeDudukanMmYyyy(r.bulan, r.tahun)}

                      </td>

                      <td className="text-right tabular-nums font-medium">

                        {formatRupiah(r.jumlah)}

                      </td>

                      <td className="text-muted max-w-[6rem] truncate" title={r.petugas_nama ?? ""}>

                        {r.petugas_nama ?? "—"}

                      </td>

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

                              onClick={() => handleEdit(r)}

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
        title="Hapus pembayaran dudukan?"
        message={
          deleteRow
            ? `Hapus pembayaran ${formatRupiah(deleteRow.jumlah)} (${formatPeriodeDudukanMmYyyy(deleteRow.bulan, deleteRow.tahun)}) untuk ${deleteRow.kepala_nama}? Tagihan periode tersebut akan muncul kembali sebagai tunggakan.`
            : ""
        }
        confirmLabel="Ya, hapus"
        busy={deleteBusy}
        onConfirm={() => void confirmHapus()}
        onCancel={() => {
          if (!deleteBusy) setDeleteRow(null);
        }}
      />



      {editKramaId && (

        <DudukanPembayaranDialog

          open

          kramaId={editKramaId}

          initialTab="riwayat"

          initialEditingPaymentId={editPaymentId}

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


