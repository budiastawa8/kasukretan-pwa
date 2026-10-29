import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, QrCode, Search, XCircle } from "lucide-react";
import { KartuQrScanner } from "../../components/KartuQrScanner";
import { AppLogo } from "../../components/ui/AppLogo";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input, Label } from "../../components/ui/Input";
import { ApiError } from "../../lib/api/client";
import {
  fetchPublikCekPetugasStatus,
  fetchPublikCekPetugasVerifikasi,
  type PublikCekPetugasResult,
} from "../../lib/api/publik-cek-petugas";
import { CEK_PETUGAS_PATH } from "../../lib/cek-petugas-publik";
import { formatNomorPengenalDisplay } from "../../lib/penomoran-petugas";
import { parsePetugasKartuQrPayload } from "../../lib/petugas-kartu-qr";
import { timKasukretanTipeLabel, normalizeTimKasukretanTipe } from "../../lib/tim-bantuan";

function errMsg(e: unknown): string {
  if (e instanceof ApiError && e.message.trim()) return e.message;
  if (e instanceof Error && e.message.trim()) return e.message;
  return "Terjadi kesalahan. Coba lagi.";
}

export function CekPetugasPage() {
  const { nomor } = useParams<{ nomor?: string }>();
  const navigate = useNavigate();
  const [desaNama, setDesaNama] = useState("Desa Adat");
  const [q, setQ] = useState(nomor ?? "");
  const [result, setResult] = useState<PublikCekPetugasResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState("");
  const [error, setError] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    fetchPublikCekPetugasStatus()
      .then((s) => setDesaNama(s.nama_desa_adat))
      .catch((e) => setBootError(errMsg(e)));
  }, []);

  const verify = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setError("Masukkan nomor anggota atau scan QR kartu.");
      setResult(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const parsed = parsePetugasKartuQrPayload(trimmed) ?? trimmed;
      const data = await fetchPublikCekPetugasVerifikasi(parsed);
      setResult(data);
      const pathNomor = data.petugas?.nomor_pengenal || parsed;
      navigate(`${CEK_PETUGAS_PATH}/${encodeURIComponent(pathNomor)}`, { replace: true });
    } catch (e) {
      setResult(null);
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!nomor?.trim()) return;
    setQ(nomor);
    void verify(nomor);
    // hanya saat mount / ganti param
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomor]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-[#4a0e0e] to-[#2e0808]">
      <Card className="w-full max-w-md space-y-4 bg-[#fffaf0] border-[#d4af37]/40">
        <div className="text-center space-y-2">
          <AppLogo size={56} alt="" className="mx-auto" />
          <h1 className="text-lg font-bold text-[#4a0e0e]">Verifikasi Kartu Petugas</h1>
          <p className="text-sm text-[#4a0e0e]/90">{desaNama}</p>
          <p className="text-xs text-muted leading-relaxed">
            Scan QR atau ketik nomor anggota Tim Kasukretan untuk memastikan kartu sah.
          </p>
        </div>

        {bootError ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {bootError}
          </p>
        ) : null}

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(q);
          }}
        >
          <div>
            <Label htmlFor="cek-petugas-q">Nomor anggota</Label>
            <Input
              id="cek-petugas-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Contoh: 9999-001"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" icon={Search} disabled={loading} className="flex-1">
              {loading ? "Memeriksa…" : "Periksa"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={QrCode}
              disabled={loading}
              onClick={() => setScanOpen(true)}
            >
              Scan QR
            </Button>
          </div>
        </form>

        {error ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        ) : null}

        {result ? (
          <div
            className={
              result.sah
                ? "rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-2"
                : "rounded-lg border border-red-300 bg-red-50 p-3 space-y-2"
            }
          >
            <div className="flex items-center gap-2">
              {result.sah ? (
                <CheckCircle2 className="text-emerald-700 shrink-0" size={22} aria-hidden />
              ) : (
                <XCircle className="text-red-700 shrink-0" size={22} aria-hidden />
              )}
              <p className="font-semibold text-sm">
                {result.sah ? "Kartu sah" : "Kartu tidak sah"}
              </p>
            </div>
            {result.sah && result.petugas ? (
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 text-sm">
                <dt className="text-muted">Nama</dt>
                <dd className="font-medium">{result.petugas.nama}</dd>
                <dt className="text-muted">Jabatan</dt>
                <dd>{result.petugas.jabatan}</dd>
                <dt className="text-muted">No. Anggota</dt>
                <dd className="tabular-nums">
                  {formatNomorPengenalDisplay(result.petugas.nomor_pengenal)}
                </dd>
                <dt className="text-muted">Banjar</dt>
                <dd>
                  {result.petugas.banjar_kode
                    ? `${result.petugas.banjar_kode} — ${result.petugas.banjar_nama}`
                    : result.petugas.banjar_nama}
                </dd>
                <dt className="text-muted">Tipe</dt>
                <dd>{timKasukretanTipeLabel(normalizeTimKasukretanTipe(result.petugas.tipe))}</dd>
                <dt className="text-muted">Desa Adat</dt>
                <dd>{result.desa_nama}</dd>
              </dl>
            ) : (
              <p className="text-sm text-red-800">
                Nomor tidak terdaftar sebagai anggota Tim Kasukretan di {result.desa_nama}.
              </p>
            )}
          </div>
        ) : null}
      </Card>

      {scanOpen ? (
        <KartuQrScanner
          title="Scan QR kartu petugas"
          hint="Arahkan kamera ke QR di belakang kartu Tim Kasukretan."
          onClose={() => setScanOpen(false)}
          onScan={(raw) => {
            setScanOpen(false);
            const parsed = parsePetugasKartuQrPayload(raw) ?? raw;
            setQ(parsed);
            void verify(parsed);
          }}
        />
      ) : null}
    </div>
  );
}
