import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, FileDown, RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateInput } from "../ui/DateInput";
import { Label } from "../ui/Input";
import { unduhBuktiSetoran } from "../../lib/bukti-setoran-petugas-unduh";
import { nomorBuktiSetoran } from "../../lib/bukti-setoran-petugas-pdf";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  PERIODE_PRESET_LABEL as PRESET_LABEL,
  periodePreset,
  type PeriodePreset as Preset,
} from "../../lib/periode-preset";
import {
  listPembayaranDalamSetoran,
  listSetoran,
  type PembayaranSetoranItem,
  type SetoranRow,
} from "../../lib/services/setoran";
import { cn, formatTanggalLahir } from "../../lib/utils";

export function RiwayatSetoranCard({
  petugasId,
  petugasJabatan,
}: {
  petugasId: string;
  petugasJabatan?: string | null;
}) {
  const [periode, setPeriode] = useState(() => periodePreset("bulan-ini"));
  const [preset, setPreset] = useState<Preset | null>("bulan-ini");
  const [rows, setRows] = useState<SetoranRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PembayaranSetoranItem[]>([]);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(
        await listSetoran({ petugasId, dari: periode.dari, sampai: periode.sampai, limit: 500 })
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [petugasId, periode]);

  useEffect(() => {
    void load();
  }, [load]);

  function pilihPreset(p: Preset) {
    setPreset(p);
    setPeriode(periodePreset(p));
    setExpandedId(null);
  }

  function ubahTanggal(field: "dari" | "sampai", iso: string) {
    setPreset(null);
    setExpandedId(null);
    setPeriode((prev) => ({ ...prev, [field]: iso }));
  }

  async function toggleDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setDetail([]);
    try {
      setDetail(await listPembayaranDalamSetoran(id));
    } catch (e) {
      setError(String(e));
    }
  }

  async function unduh(s: SetoranRow) {
    setPdfBusy(s.id);
    setError("");
    try {
      await unduhBuktiSetoran(s, { petugasJabatan });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(null);
    }
  }

  const total = rows.reduce((s, r) => s + r.total, 0);
  const jumlahTransaksi = rows.reduce((s, r) => s + r.jumlah_transaksi, 0);

  return (
    <Card title="Riwayat Setoran">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={preset === p ? "primary" : "secondary"}
            className="h-9 px-3 text-xs"
            onClick={() => pilihPreset(p)}
          >
            {PRESET_LABEL[p]}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          icon={RefreshCw}
          className="h-9 ml-auto"
          title="Muat ulang"
          aria-label="Muat ulang"
          disabled={loading}
          onClick={() => void load()}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Dari</Label>
          <DateInput value={periode.dari} onChange={(iso) => ubahTanggal("dari", iso)} />
        </div>
        <div>
          <Label className="text-xs">Sampai</Label>
          <DateInput value={periode.sampai} onChange={(iso) => ubahTanggal("sampai", iso)} />
        </div>
      </div>

      <p className="mt-3 text-sm">
        Total disetor: <strong className="tabular-nums">{formatRupiah(total)}</strong>{" "}
        <span className="text-xs text-muted">
          ({rows.length} setoran · {jumlahTransaksi} transaksi)
        </span>
      </p>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}

      {rows.length === 0 ? (
        <p className="mt-2 py-3 text-center text-xs text-muted">
          {loading ? "Memuat…" : "Belum ada setoran pada periode ini."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-copper-100 border border-copper-100 rounded-md">
          {rows.map((s) => {
            const open = expandedId === s.id;
            return (
              <li key={s.id}>
                <div className="flex items-start gap-2 px-2 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-1.5 text-left"
                    onClick={() => void toggleDetail(s.id)}
                    aria-expanded={open}
                  >
                    {open ? (
                      <ChevronDown size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                    ) : (
                      <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-copper-950">
                        {formatTanggalLahir(s.tanggal)} ·{" "}
                        <span className="tabular-nums">{formatRupiah(s.total)}</span>
                      </span>
                      <span className="block text-[11px] text-muted">
                        {nomorBuktiSetoran(s.id)} · {s.jumlah_transaksi} transaksi · diterima{" "}
                        {s.diterima_oleh_nama ?? "—"}
                      </span>
                      {s.keterangan && (
                        <span className="block text-[11px] text-muted truncate">{s.keterangan}</span>
                      )}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={FileDown}
                    className="h-9 shrink-0 px-2.5 text-xs"
                    disabled={pdfBusy != null}
                    onClick={() => void unduh(s)}
                  >
                    {pdfBusy === s.id ? "…" : "PDF"}
                  </Button>
                </div>
                {open && (
                  <div className="border-t border-copper-100 bg-copper-50/40 px-2 py-1.5">
                    {detail.length === 0 ? (
                      <p className="text-xs text-muted">Memuat…</p>
                    ) : (
                      <ul className="space-y-1">
                        {detail.map((d) => (
                          <li
                            key={`${d.sumber}:${d.id}`}
                            className={cn("flex items-start justify-between gap-2 text-xs")}
                          >
                            <span className="min-w-0">
                              <span className="text-muted">{formatTanggalLahir(d.tanggal)}</span>
                              {" · "}
                              <span className="font-medium text-copper-950">{d.kepala_nama}</span>
                              <span className="block text-muted truncate">{d.uraian}</span>
                            </span>
                            <span className="shrink-0 tabular-nums">{formatRupiah(d.jumlah)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
