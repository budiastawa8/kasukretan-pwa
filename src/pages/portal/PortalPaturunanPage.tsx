import { useEffect, useState } from "react";
import { fetchPortalPaturunan, type PortalPaturunanData } from "../../lib/api/portal";
import { formatRupiah } from "../../lib/paturunan-hitung";
import { Card } from "../../components/ui/Card";

export function PortalPaturunanPage() {
  const [data, setData] = useState<PortalPaturunanData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortalPaturunan()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted">Memuat…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const totalSisa = data.iuran.reduce((s, i) => s + i.sisa, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-copper-900">Paturunan</h1>
        <p className="text-sm text-muted">
          Total sisa tagihan:{" "}
          <span className="font-semibold text-copper-900">{formatRupiah(totalSisa)}</span>
        </p>
      </div>

      <div className="space-y-2">
        {data.iuran.map((i) => (
          <Card key={i.iuran_id} className="text-sm">
            <div className="flex justify-between gap-2">
              <p className="font-medium text-copper-900">{i.iuran_nama}</p>
              <span className="text-xs font-medium text-copper-800">{i.status}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted mt-2">
              <dt>Tagihan</dt>
              <dd className="text-right text-copper-900">{formatRupiah(i.tagihan)}</dd>
              <dt>Dibayar</dt>
              <dd className="text-right text-copper-900">{formatRupiah(i.dibayar_wajib)}</dd>
              {i.punia > 0 && (
                <>
                  <dt>Punia</dt>
                  <dd className="text-right text-copper-900">{formatRupiah(i.punia)}</dd>
                </>
              )}
              <dt>Sisa</dt>
              <dd className="text-right font-medium text-copper-900">{formatRupiah(i.sisa)}</dd>
            </dl>
          </Card>
        ))}
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
                  <span className="font-medium text-copper-900">{r.iuran_nama}</span>
                  <span className="text-copper-900">{formatRupiah(r.jumlah)}</span>
                </div>
                <p className="text-muted mt-0.5">
                  {new Date(r.tanggal).toLocaleDateString("id-ID")}
                  {r.jenis === "punia" ? " · Punia" : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
