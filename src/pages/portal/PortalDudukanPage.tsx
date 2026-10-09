import { useEffect, useState } from "react";
import { fetchPortalDudukan, type PortalDudukanData } from "../../lib/api/portal";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { Card } from "../../components/ui/Card";

export function PortalDudukanPage() {
  const [data, setData] = useState<PortalDudukanData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortalDudukan()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted">Memuat…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const tunggakan = data.bulan.filter((b) => b.sisa > 0);
  const totalTunggakan = tunggakan.reduce((s, b) => s + b.sisa, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-copper-900">Dudukan</h1>
        <p className="text-sm text-muted">
          Tarif bulanan:{" "}
          <span className="font-semibold text-copper-900">
            {formatRupiah(data.tarif_bulanan)}
          </span>
        </p>
        {totalTunggakan > 0 && (
          <p className="text-sm text-amber-900 mt-1">
            Total tunggakan: <span className="font-semibold">{formatRupiah(totalTunggakan)}</span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        {data.bulan.length === 0 ? (
          <p className="text-xs text-muted">Belum ada periode dudukan.</p>
        ) : (
          data.bulan.map((b) => (
            <Card key={`${b.tahun}-${b.bulan}`} className="text-sm">
              <div className="flex justify-between gap-2">
                <p className="font-medium text-copper-900">{b.label}</p>
                <span className="text-xs font-medium text-copper-800">{b.status}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted mt-2">
                <dt>Tagihan</dt>
                <dd className="text-right text-copper-900">{formatRupiah(b.tagihan)}</dd>
                <dt>Dibayar</dt>
                <dd className="text-right text-copper-900">{formatRupiah(b.dibayar)}</dd>
                {b.keringanan > 0 && (
                  <>
                    <dt>Keringanan</dt>
                    <dd className="text-right text-copper-900">{formatRupiah(b.keringanan)}</dd>
                  </>
                )}
                {b.sisa > 0 && (
                  <>
                    <dt>Sisa</dt>
                    <dd className="text-right font-medium text-amber-900">{formatRupiah(b.sisa)}</dd>
                  </>
                )}
              </dl>
            </Card>
          ))
        )}
      </div>

      {data.riwayat.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-copper-900 mb-2">Riwayat pembayaran</h2>
          <ul className="space-y-2">
            {data.riwayat.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-copper-100 bg-copper-50/40 px-3 py-2 text-xs"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-copper-900">{r.label}</span>
                  <span className="text-copper-900">{formatRupiah(r.jumlah)}</span>
                </div>
                <p className="text-muted mt-0.5">{new Date(r.tanggal).toLocaleDateString("id-ID")}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
