import { useCallback, useEffect, useState } from "react";
import { Cloud, KeyRound } from "lucide-react";
import {
  activateCloudSubscription,
  formatCloudExpiry,
  getLicenseStatus,
  type LicenseStatus,
} from "../../lib/license";
import { refreshOnlineModuleLicense } from "../../lib/online-module";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { LicenseCodeInput } from "../license/LicenseCodeInput";

type Props = {
  onActivated?: () => void;
};

export function CloudSubscriptionPanel({ onActivated }: Props) {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getLicenseStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await activateCloudSubscription(code);
      setStatus(next);
      if (next.cloud_enabled) {
        await refreshOnlineModuleLicense();
        setCode("");
        onActivated?.();
      } else {
        setError(next.message ?? "Aktivasi langganan cloud gagal.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const expiryLabel = formatCloudExpiry(status?.cloud_expires_at ?? null);

  return (
    <Card className="space-y-3 border-copper-200">
      <div className="flex items-center gap-2">
        <Cloud className="text-copper-700 shrink-0" size={20} />
        <h2 className="font-semibold text-copper-900">Langganan Modul Cloud</h2>
      </div>

      {status?.cloud_enabled ? (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded px-3 py-2 leading-relaxed">
          Modul cloud aktif
          {expiryLabel ? (
            <>
              {" "}
              hingga <strong>{expiryLabel}</strong>.
            </>
          ) : (
            "."
          )}{" "}
          Sinkronisasi, petugas lapangan, dan portal krama tersedia.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted leading-relaxed">
            Modul cloud (sinkronisasi API, petugas HP, portal krama) berlangganan bulanan
            terpisah dari lisensi desktop. Hubungi vendor untuk kode langganan{" "}
            <code className="text-xs">KSC-…</code>.
          </p>
          {status?.message && !status.cloud_enabled && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
              {status.message}
            </p>
          )}
          <form onSubmit={(e) => void handleActivate(e)} className="space-y-3">
            <LicenseCodeInput
              label="Kode langganan cloud"
              value={code}
              onChange={setCode}
              placeholder="KSC-XXXXX-XXXXX-…"
              disabled={busy}
            />
            {error && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">
                {error}
              </p>
            )}
            <Button
              type="submit"
              icon={KeyRound}
              disabled={busy || !code.trim()}
              className="w-full sm:w-auto"
            >
              {busy ? "Mengaktivasi…" : "Aktifkan langganan cloud"}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}
