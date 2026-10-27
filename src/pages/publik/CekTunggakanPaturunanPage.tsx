import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import {
  fetchPublikCekTunggakanCari,
  fetchPublikCekTunggakanDetail,
  fetchPublikCekTunggakanStatus,
  type PublikCekTunggakanDetail,
  type PublikCekTunggakanSearchItem,
} from "../../lib/api/publik-cek-tunggakan";
import { CEK_TUNGGAKAN_PATURUNAN_PATH } from "../../lib/cek-tunggakan-publik";
import { formatRupiah } from "../../lib/paturunan-hitung";
import { ApiError } from "../../lib/api/client";
import { PaturunanStatusBadge } from "../../components/paturunan/PaturunanStatusBadge";
import { AppLogo } from "../../components/ui/AppLogo";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input, Label } from "../../components/ui/Input";

const MIN_Q = 3;

function errMsg(e: unknown): string {
  if (e instanceof ApiError && e.message.trim()) return e.message;
  if (e instanceof Error && e.message.trim()) return e.message;
  return "Terjadi kesalahan. Coba lagi.";
}

function KramaMeta({
  banjar,
  tempek,
  jenis,
  nomorKartu,
}: {
  banjar: string;
  tempek: string | null;
  jenis: string | null;
  nomorKartu: string;
}) {
  const parts = [banjar, tempek?.trim() || null, jenis?.trim() || null].filter(Boolean);
  return (
    <p className="text-xs text-muted">
      {parts.join(" · ")}
      {nomorKartu ? ` · ${nomorKartu}` : ""}
    </p>
  );
}

function ClosedState({ desaNama }: { desaNama: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-copper-100 to-copper-50">
      <Card className="w-full max-w-md space-y-3 text-center">
        <AppLogo size={64} alt="" className="mx-auto" />
        <h1 className="text-lg font-bold text-copper-900">Cek tunggakan Paturunan</h1>
        <p className="text-sm text-copper-800">{desaNama}</p>
        <p className="text-sm text-muted leading-relaxed">
          Pencarian tunggakan Paturunan sedang ditutup oleh pengurus desa adat.
        </p>
      </Card>
    </div>
  );
}

function SearchView({
  desaNama,
  initialQ,
}: {
  desaNama: string;
  initialQ: string;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<PublikCekTunggakanSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_Q) {
      setResults([]);
      setSearched(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setResults(await fetchPublikCekTunggakanCari(trimmed));
      setSearched(true);
    } catch (e) {
      setError(errMsg(e));
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQ.trim().length >= MIN_Q) void runSearch(initialQ);
  }, [initialQ, runSearch]);

  function onChangeQ(value: string) {
    setQ(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (value.trim()) url.searchParams.set("q", value.trim());
      else url.searchParams.delete("q");
      window.history.replaceState(null, "", url.pathname + url.search);
      void runSearch(value);
    }, 350);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-copper-100/80 to-copper-50 flex justify-center">
      <div className="w-full max-w-md min-h-screen flex flex-col shadow-xl bg-card border-x border-copper-200">
        <header className="sticky top-0 z-10 border-b border-copper-200 bg-card/95 backdrop-blur px-4 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <AppLogo size={36} alt="" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-copper-900 leading-tight">
                Cek tunggakan Paturunan
              </h1>
              <p className="text-[11px] text-muted truncate">{desaNama}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 space-y-4">
          <div>
            <Label htmlFor="cek-tunggakan-q">Cari nama atau nomor kartu</Label>
            <div className="relative mt-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <Input
                id="cek-tunggakan-q"
                value={q}
                onChange={(e) => onChangeQ(e.target.value)}
                placeholder="Contoh: I Made…"
                className="pl-9"
                autoComplete="off"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-muted mt-1">
              Ketik minimal {MIN_Q} huruf. Hasil hanya untuk Krama Mipil aktif.
            </p>
          </div>

          {loading && <p className="text-sm text-muted">Mencari…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && searched && !error && results.length === 0 && (
            <p className="text-sm text-muted">Tidak ada yang cocok. Coba nama lain.</p>
          )}

          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full text-left rounded-lg border border-copper-100 bg-copper-50/40 px-3 py-2.5 hover:border-copper-300 hover:bg-copper-50 transition-colors"
                  onClick={() => navigate(`${CEK_TUNGGAKAN_PATURUNAN_PATH}/${r.id}`)}
                >
                  <p className="font-medium text-sm text-copper-900">{r.kepala_nama}</p>
                  <KramaMeta
                    banjar={r.banjar_nama}
                    tempek={r.tempek_nama}
                    jenis={r.jenis_nama}
                    nomorKartu={r.nomor_kartu}
                  />
                </button>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}

function DetailView({
  desaNama,
  kramaId,
}: {
  desaNama: string;
  kramaId: string;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<PublikCekTunggakanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchPublikCekTunggakanDetail(kramaId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(errMsg(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kramaId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-copper-100/80 to-copper-50 flex justify-center">
      <div className="w-full max-w-md min-h-screen flex flex-col shadow-xl bg-card border-x border-copper-200">
        <header className="sticky top-0 z-10 border-b border-copper-200 bg-card/95 backdrop-blur px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            icon={ArrowLeft}
            className="mb-2"
            onClick={() => navigate(CEK_TUNGGAKAN_PATURUNAN_PATH)}
          >
            Kembali
          </Button>
          <p className="text-[11px] text-muted">{desaNama}</p>
          {data && (
            <>
              <h1 className="text-base font-bold text-copper-900 leading-snug">
                {data.krama.kepala_nama}
              </h1>
              <KramaMeta
                banjar={data.krama.banjar_nama}
                tempek={data.krama.tempek_nama}
                jenis={data.krama.jenis_nama}
                nomorKartu={data.krama.nomor_kartu}
              />
            </>
          )}
        </header>

        <main className="flex-1 px-4 py-4 space-y-3">
          {loading && <p className="text-sm text-muted">Memuat…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {data && (
            <>
              <Card className="text-sm space-y-1">
                <div>
                  <p className="text-xs text-muted">Total sisa tagihan</p>
                  <p className="text-lg font-semibold text-copper-900 tabular-nums">
                    {formatRupiah(data.total_sisa)}
                  </p>
                </div>
                {(data.total_punia ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-muted">Total punia</p>
                    <p className="text-sm font-semibold text-copper-900 tabular-nums">
                      {formatRupiah(data.total_punia)}
                    </p>
                  </div>
                )}
              </Card>

              <div className="space-y-2">
                {data.iuran.map((i) => (
                  <Card key={i.iuran_id} className="text-sm">
                    <div className="flex justify-between gap-2 items-start">
                      <p className="font-medium text-copper-900">{i.iuran_nama}</p>
                      <span className="shrink-0">
                        <PaturunanStatusBadge
                          tagihan={i.tagihan}
                          dibayarWajib={i.dibayar_wajib}
                          punia={i.punia ?? 0}
                        />
                      </span>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted mt-2">
                      <dt>Tagihan</dt>
                      <dd className="text-right text-copper-900 tabular-nums">
                        {formatRupiah(i.tagihan)}
                      </dd>
                      <dt>Dibayar</dt>
                      <dd className="text-right text-copper-900 tabular-nums">
                        {formatRupiah(i.dibayar_wajib)}
                      </dd>
                      {(i.punia ?? 0) > 0 && (
                        <>
                          <dt>Punia</dt>
                          <dd className="text-right text-copper-900 tabular-nums">
                            {formatRupiah(i.punia)}
                          </dd>
                        </>
                      )}
                      <dt>Sisa</dt>
                      <dd className="text-right font-medium text-copper-900 tabular-nums">
                        {formatRupiah(i.sisa)}
                      </dd>
                    </dl>
                  </Card>
                ))}
              </div>

              {data.iuran.length === 0 && (
                <p className="text-sm text-muted">Belum ada paturunan aktif.</p>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function CekTunggakanPaturunanPage() {
  const { kramaId } = useParams<{ kramaId?: string }>();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<{ aktif: boolean; nama: string } | null>(null);
  const [bootError, setBootError] = useState("");

  useEffect(() => {
    fetchPublikCekTunggakanStatus()
      .then((s) => setStatus({ aktif: s.aktif, nama: s.nama_desa_adat }))
      .catch((e) => setBootError(errMsg(e)));
  }, []);

  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-copper-100 to-copper-50">
        <Card className="w-full max-w-md space-y-2 text-center">
          <p className="text-sm text-red-600">{bootError}</p>
          <button
            type="button"
            className="text-xs text-copper-800 underline"
            onClick={() => window.location.reload()}
          >
            Muat ulang
          </button>
        </Card>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-copper-100 to-copper-50">
        <p className="text-sm text-muted">Memuat…</p>
      </div>
    );
  }

  if (!status.aktif) {
    return <ClosedState desaNama={status.nama} />;
  }

  if (kramaId) {
    return <DetailView desaNama={status.nama} kramaId={kramaId} />;
  }

  return <SearchView desaNama={status.nama} initialQ={searchParams.get("q") ?? ""} />;
}
