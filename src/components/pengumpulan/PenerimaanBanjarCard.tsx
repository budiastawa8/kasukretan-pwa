import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateInput } from "../ui/DateInput";
import { Label, Select } from "../ui/Input";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  PERIODE_PRESET_LABEL as PRESET_LABEL,
  periodePreset,
  type PeriodePreset as Preset,
} from "../../lib/periode-preset";
import { listBanjar } from "../../lib/services/master";
import { getPenerimaanBanjar, type PenerimaanBanjar } from "../../lib/services/penerimaan-banjar";
import type { ModePengumpulan, PetugasLapangan } from "../../lib/services/pengumpulan";

const SEMUA = "__semua__";

export function PenerimaanBanjarCard({
  petugas,
  mode,
}: {
  petugas: PetugasLapangan;
  mode: ModePengumpulan;
}) {
  const [periode, setPeriode] = useState(() => periodePreset("bulan-ini"));
  const [preset, setPreset] = useState<Preset | null>("bulan-ini");
  const [banjarPilihan, setBanjarPilihan] = useState(petugas.banjar_id);
  const [banjarList, setBanjarList] = useState<{ id: string; nama: string }[]>([]);
  const [data, setData] = useState<PenerimaanBanjar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!petugas.semua_banjar) return;
    listBanjar()
      .then((rows) => setBanjarList(rows.map((b) => ({ id: b.id, nama: b.nama }))))
      .catch((e) => setError(String(e)));
  }, [petugas.semua_banjar]);

  const banjarId = petugas.semua_banjar
    ? banjarPilihan === SEMUA
      ? null
      : banjarPilihan
    : petugas.banjar_id;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getPenerimaanBanjar({ mode, banjarId, dari: periode.dari, sampai: periode.sampai }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [mode, banjarId, periode]);

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

  const namaMode = mode === "paturunan" ? "Paturunan" : "Dudukan";
  const namaBanjar = banjarId
    ? banjarId === petugas.banjar_id
      ? petugas.banjar_nama
      : (banjarList.find((b) => b.id === banjarId)?.nama ?? "")
    : "Semua banjar";
  const tampilRincian = data && (data.rincian.length > 1 || !banjarId);

  return (
    <Card title={`Penerimaan ${namaMode} Banjar`}>
      {petugas.semua_banjar && (
        <div className="mb-2">
          <Label className="text-xs">Banjar</Label>
          <Select value={banjarPilihan} onChange={(e) => setBanjarPilihan(e.target.value)}>
            <option value={SEMUA}>Semua banjar</option>
            {banjarList.length === 0 && (
              <option value={petugas.banjar_id}>{petugas.banjar_nama}</option>
            )}
            {banjarList.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nama}
              </option>
            ))}
          </Select>
        </div>
      )}
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

      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}

      <div className="mt-3 rounded-md border border-copper-100 bg-copper-50/40 px-3 py-2.5">
        <p className="text-xs text-muted">{namaBanjar}</p>
        <p className="text-xl font-semibold tabular-nums text-copper-950">
          {loading && !data ? "Memuat…" : formatRupiah(data?.total ?? 0)}
        </p>
        {data && (
          <p className="text-xs text-muted">
            {data.transaksi} transaksi · {data.krama} krama membayar
            {mode === "paturunan" && (data.punia ?? 0) > 0 && (
              <>
                {" "}
                · wajib {formatRupiah(data.wajib ?? 0)} · punia {formatRupiah(data.punia ?? 0)}
              </>
            )}
          </p>
        )}
      </div>

      {tampilRincian && data.rincian.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted">{data.rincianJudul}</p>
          <ul className="mt-1 divide-y divide-copper-100 border border-copper-100 rounded-md">
            {data.rincian.map((r) => (
              <li key={r.kunci} className="flex items-start justify-between gap-2 px-2 py-1.5">
                <span className="min-w-0">
                  <span className="block text-sm text-copper-950 truncate">{r.label}</span>
                  <span className="block text-[11px] text-muted">
                    {r.transaksi} transaksi · {r.krama} krama
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums">{formatRupiah(r.jumlah)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted">
        Dihitung dari tanggal bayar, semua petugas, termasuk yang belum disetor.
      </p>
    </Card>
  );
}
