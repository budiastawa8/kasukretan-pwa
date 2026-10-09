import { useCallback, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { LogIn, QrCode } from "lucide-react";
import { usePortalAuth } from "../../context/PortalAuthContext";
import { KartuQrScanner } from "../../components/KartuQrScanner";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { AppLogo } from "../../components/ui/AppLogo";
import { parseKartuQrPayload } from "../../lib/kartu-qr";
import { isDesktopApp } from "../../lib/runtime";

export function PortalLoginPage() {
  const { user, login } = usePortalAuth();
  const navigate = useNavigate();
  const pinRef = useRef<HTMLInputElement>(null);
  const [nomorKartu, setNomorKartu] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const handleQrScan = useCallback((raw: string) => {
    setScanOpen(false);
    setError("");
    const kartu = parseKartuQrPayload(raw);
    if (!kartu) {
      setError("QR tidak dikenali — pastikan kartu Kasukretan.");
      return;
    }
    setNomorKartu(kartu);
    window.setTimeout(() => pinRef.current?.focus(), 100);
  }, []);

  if (user) return <Navigate to="/portal" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(nomorKartu.trim(), pin);
      navigate("/portal");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-copper-100 to-copper-50">
      <Card className="w-full max-w-sm space-y-4">
        <div className="text-center flex flex-col items-center gap-2">
          <AppLogo size={72} alt="" />
          <div>
            <h1 className="text-lg font-bold text-copper-900">Portal Krama</h1>
            <p className="text-xs text-muted mt-1">Lihat tagihan dan riwayat pembayaran Anda</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Nomor kartu</Label>
            <div className="flex gap-2">
              <Input
                value={nomorKartu}
                onChange={(e) => setNomorKartu(e.target.value)}
                placeholder="Contoh: 01.02.03.0001"
                autoComplete="username"
                className="flex-1 min-w-0"
              />
              <Button
                type="button"
                variant="secondary"
                icon={QrCode}
                onClick={() => setScanOpen(true)}
                title="Scan QR kartu"
                aria-label="Scan QR kartu"
                className="shrink-0 px-3"
              />
            </div>
          </div>
          <div>
            <Label>PIN</Label>
            <Input
              ref={pinRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="4–8 digit"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" className="w-full" icon={LogIn} disabled={loading}>
            {loading ? "Memproses…" : "Masuk"}
          </Button>
          <p className="text-[11px] text-center text-muted">
            Scan QR di kartu untuk mengisi nomor kartu, lalu masukkan PIN portal Anda. PIN diatur
            pengurus di aplikasi kantor.
          </p>
        </form>
        {isDesktopApp() ? (
          <Link to="/" className="block text-center text-xs text-copper-700 hover:underline">
            ← Kembali ke admin
          </Link>
        ) : (
          <Link to="/petugas/login" className="block text-center text-xs text-copper-700 hover:underline">
            Login petugas →
          </Link>
        )}
      </Card>
      {scanOpen && (
        <KartuQrScanner
          onScan={handleQrScan}
          onClose={() => setScanOpen(false)}
          hint="Arahkan kamera ke QR di kartu krama Anda, lalu masukkan PIN."
        />
      )}
    </div>
  );
}
