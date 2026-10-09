import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, Printer, RefreshCw } from "lucide-react";
import {
  fetchPetugasRekapHariIni,
  fetchPetugasStrukPreview,
  type PetugasRekapHariIni,
  type PetugasRekapHariIniBaris,
} from "../../lib/api/petugas";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  PETUGAS_STRUK_PREVIEW_PATH,
  stashPetugasStrukPreview,
} from "../../lib/petugas-struk-preview";
import { cn, formatTanggalLahir, today } from "../../lib/utils";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DateInput } from "../../components/ui/DateInput";
import { Label } from "../../components/ui/Input";

function formatWaktu(iso: string): string {
  const raw = iso?.trim() || "";
  if (!raw) return "—";
  // created_at may be "2026-07-21T10:15:30.000Z" or "2026-07-21 10:15:30"
  const m = raw.match(/T(\d{2}):(\d{2})/) || raw.match(/\s(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  return formatTanggalLahir(raw);
}

/** Parse krama/iuran dari id rekap jika API belum mengirim field eksplisit. */
function resolveReprintKeys(row: PetugasRekapHariIniBaris): {
  kramaId: string;
  iuranId?: string;
} | null {
  const kramaId = row.krama_id?.trim();
  if (kramaId) {
    return {
      kramaId,
      iuranId: row.jenis === "paturunan" ? row.iuran_id?.trim() || undefined : undefined,
    };
  }
  if (row.jenis === "dudukan") {
    const m = row.id.match(/^dud[:\-](.+)$/);
    return m?.[1] ? { kramaId: m[1] } : null;
  }
  // Format baru: pat:{kramaId}:{iuranId} — format lama: pat-{kramaId}
  const colon = row.id.match(/^pat:(.+?)(?::(.+))?$/);
  if (colon?.[1]) {
    return { kramaId: colon[1], iuranId: colon[2] || row.iuran_id };
  }
  const dash = row.id.match(/^pat-(.+)$/);
  return dash?.[1] ? { kramaId: dash[1], iuranId: row.iuran_id } : null;
}

export function PetugasRekapHariIniPage() {
  const navigate = useNavigate();
  const [tanggal, setTanggal] = useState(today());
  const [data, setData] = useState<PetugasRekapHariIni | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reprintId, setReprintId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchPetugasRekapHariIni(tanggal || undefined));
    } catch (e) {
      setError(String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tanggal]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cetakUlang(row: PetugasRekapHariIniBaris) {
    const keys = resolveReprintKeys(row);
    if (!keys) {
      setError("Data rekap belum lengkap — muat ulang halaman.");
      return;
    }
    setReprintId(row.id);
    setError("");
    try {
      const preview = await fetchPetugasStrukPreview({
        jenis: row.jenis,
        kramaId: keys.kramaId,
        tanggal: data?.tanggal || tanggal,
        iuranId: keys.iuranId,
      });
      if (preview.kind === "dudukan") {
        stashPetugasStrukPreview({
          kind: "dudukan",
          payload: preview.payload,
          backTo: "/petugas/rekap-hari-ini",
          backLabel: "Kembali ke rekap",
        });
      } else {
        stashPetugasStrukPreview({
          kind: "paturunan",
          payload: preview.payload,
          backTo: "/petugas/rekap-hari-ini",
          backLabel: "Kembali ke rekap",
        });
      }
      navigate(PETUGAS_STRUK_PREVIEW_PATH);
    } catch (e) {
      setError(String(e));
    } finally {
      setReprintId(null);
    }
  }

  const ringkasan = data?.ringkasan;
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/petugas"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-copper-900"
        >
          <ArrowLeft size={14} />
          Beranda
        </Link>
        <h1 className="text-lg font-bold text-copper-900 mt-1 flex items-center gap-2">
          <ClipboardList className="text-copper-700 shrink-0" size={22} />
          Rekap hari ini
        </h1>
        <p className="text-sm text-muted">
          Penerimaan sementara milik Anda — nama, alamat, dan jumlah bayar. Cetak ulang struk dari
          rincian di bawah.
        </p>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="min-w-[10rem]">
            <Label className="text-[11px]">Tanggal</Label>
            <DateInput value={tanggal} onChange={setTanggal} />
          </div>
          <Button
            type="button"
            variant="secondary"
            icon={RefreshCw}
            className="h-9 text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            Muat ulang
          </Button>
        </div>
        {data?.petugas && (
          <p className="text-xs text-muted">
            Petugas: <span className="font-medium text-copper-900">{data.petugas.nama}</span>
            {" · "}
            {formatTanggalLahir(data.tanggal)}
          </p>
        )}
        {!loading && data && !data.petugas && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
            Akun belum terhubung ke tim petugas. Sinkronkan akun petugas dari desktop.
          </p>
        )}
      </Card>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {ringkasan && (
        <div className="grid grid-cols-2 gap-2">
          <Card className="!p-3">
            <p className="text-[11px] text-muted">Paturunan</p>
            <p className="text-sm font-semibold tabular-nums text-emerald-900">
              {formatRupiah(ringkasan.total_paturunan)}
            </p>
          </Card>
          <Card className="!p-3">
            <p className="text-[11px] text-muted">Dudukan</p>
            <p className="text-sm font-semibold tabular-nums text-emerald-900">
              {formatRupiah(ringkasan.total_dudukan)}
            </p>
          </Card>
          <Card className="!p-3 col-span-2">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[11px] text-muted">Total diterima</p>
                <p className="text-base font-bold tabular-nums text-copper-950">
                  {formatRupiah(ringkasan.total)}
                </p>
              </div>
              <p className="text-xs text-muted">
                {ringkasan.jumlah_penerimaan} penerimaan
              </p>
            </div>
          </Card>
        </div>
      )}

      <Card title="Rincian penerimaan" compact>
        {loading ? (
          <p className="text-xs text-muted text-center py-4">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted text-center py-4 px-1">
            Belum ada pembayaran tercatat pada tanggal ini.
          </p>
        ) : (
          <ul className="divide-y divide-copper-100 -mx-2">
            {rows.map((r) => (
              <li key={r.id} className="px-2 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-copper-900 leading-snug">
                      {r.nama}
                    </p>
                    <p className="text-[11px] text-muted mt-0.5 leading-snug">
                      {r.alamat}
                    </p>
                    <p className="text-[11px] text-muted mt-0.5">
                      <span
                        className={cn(
                          "inline-block rounded px-1 py-0.5 mr-1",
                          r.jenis === "paturunan"
                            ? "bg-sky-50 text-sky-900"
                            : "bg-amber-50 text-amber-900"
                        )}
                      >
                        {r.jenis_label}
                      </span>
                      {r.nomor_kartu}
                      {r.item_count > 1 ? ` · ${r.item_count} item` : ""}
                      {" · "}
                      {formatWaktu(r.waktu)}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <p className="text-sm font-semibold tabular-nums text-emerald-900">
                      {formatRupiah(r.jumlah)}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      icon={Printer}
                      className="h-8 text-[11px] px-2"
                      disabled={reprintId === r.id}
                      onClick={() => void cetakUlang(r)}
                    >
                      {reprintId === r.id ? "Menyiapkan…" : "Cetak ulang"}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
