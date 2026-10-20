import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateInput } from "../ui/DateInput";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  PERIODE_PRESET_LABEL as PRESET_LABEL,
  periodePreset,
  type PeriodePreset as Preset,
} from "../../lib/periode-preset";
import {
  listPembayaranOlehPetugas,
  type PembayaranSetoranItem,
} from "../../lib/services/setoran";
import { formatTanggalLahir } from "../../lib/utils";

/** Ringkasan + daftar pembayaran yang dicatat petugas sendiri (Tim Bantuan). */
export function PembayaranSayaCard({ petugasId }: { petugasId: string }) {
  const [periode, setPeriode] = useState(() => periodePreset("bulan-ini"));
  const [preset, setPreset] = useState<Preset | null>("bulan-ini");
  const [rows, setRows] = useState<PembayaranSetoranItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(
        await listPembayaranOlehPetugas({
          petugasId,
          dari: periode.dari,
          sampai: periode.sampai,
          hanyaDudukan: true,
        })
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
  }

  function ubahTanggal(field: "dari" | "sampai", iso: string) {
    setPreset(null);
    setPeriode((prev) => ({ ...prev, [field]: iso }));
  }

  const total = rows.reduce((s, r) => s + r.jumlah, 0);

  return (
    <Card title="Pembayaran yang saya catat">
      <p className="mb-2 text-xs text-muted leading-snug">
        Hanya transaksi Dudukan yang Anda input. Total penerimaan banjar tidak ditampilkan.
      </p>
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
          <p className="text-[11px] text-muted">Dari</p>
          <DateInput value={periode.dari} onChange={(v) => ubahTanggal("dari", v)} />
        </div>
        <div>
          <p className="text-[11px] text-muted">Sampai</p>
          <DateInput value={periode.sampai} onChange={(v) => ubahTanggal("sampai", v)} />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-copper-200 bg-copper-50/60 px-3 py-2">
        <p className="text-xs text-muted">Agregat periode ini</p>
        <p className="text-lg font-semibold tabular-nums text-copper-950">{formatRupiah(total)}</p>
        <p className="text-[11px] text-muted">{rows.length} transaksi</p>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {loading && <p className="mt-2 text-xs text-muted">Memuat…</p>}
      {!loading && rows.length === 0 && (
        <p className="mt-2 text-xs text-muted">Belum ada pembayaran pada periode ini.</p>
      )}
      {!loading && rows.length > 0 && (
        <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-sm">
          {[...rows].reverse().map((r) => (
            <li
              key={`${r.sumber}-${r.id}`}
              className="rounded border border-copper-100 bg-white px-2.5 py-1.5"
            >
              <div className="flex justify-between gap-2">
                <p className="font-medium text-copper-950 truncate">{r.kepala_nama}</p>
                <p className="shrink-0 tabular-nums font-medium">{formatRupiah(r.jumlah)}</p>
              </div>
              <p className="text-[11px] text-muted">
                {formatTanggalLahir(r.tanggal)} · {r.nomor_kartu} · {r.uraian}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
