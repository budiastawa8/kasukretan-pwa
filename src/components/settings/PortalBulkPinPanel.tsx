import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Globe, KeyRound } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import {
  bulkSetPortalPinForActiveKrama,
  countActiveKramaForPortal,
  countKramaPortalConfigured,
  validatePortalPin,
} from "../../lib/services/krama-portal";
import { getCloudApiToken } from "../../lib/sync/cloud-config";
import { tryAutoPushPortal } from "../../lib/sync/auto-push-portal";
import { isDesktopApp } from "../../lib/runtime";
import { settingsPath } from "../../lib/settings-routes";
import { Link } from "react-router-dom";

export function PortalBulkPinPanel() {
  const desktop = isDesktopApp();
  const [activeCount, setActiveCount] = useState(0);
  const [configuredCount, setConfiguredCount] = useState(0);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState<ReactNode>("");
  const [error, setError] = useState("");

  const loadCounts = useCallback(() => {
    if (!desktop) return;
    void Promise.all([countActiveKramaForPortal(), countKramaPortalConfigured()]).then(
      ([active, configured]) => {
        setActiveCount(active);
        setConfiguredCount(configured);
      }
    );
  }, [desktop]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  async function handleApply() {
    setError("");
    setMessage("");
    setWarning("");
    if (pin !== pin2) {
      setError("Konfirmasi PIN tidak sama");
      return;
    }
    const pinErr = validatePortalPin(pin);
    if (pinErr) {
      setError(pinErr);
      return;
    }
    if (activeCount === 0) {
      setError("Tidak ada krama aktif — tidak ada yang diperbarui.");
      return;
    }
    const ok = window.confirm(
      `Terapkan PIN yang sama ke ${activeCount} krama aktif?\n\nPIN lama (jika ada) akan diganti. Setelah itu kirim portal ke cloud agar krama bisa login online.`
    );
    if (!ok) return;

    setBusy(true);
    try {
      const { updated } = await bulkSetPortalPinForActiveKrama(pin, { aktif: true });
      setPin("");
      setPin2("");
      setMessage(`PIN portal diterapkan ke ${updated} krama aktif.`);
      loadCounts();

      if (!getCloudApiToken()) {
        setWarning(
          <>
            Login API di bawah lalu klik <strong>Kirim portal ke cloud</strong> agar krama bisa
            login di browser.
          </>
        );
      } else {
        const push = await tryAutoPushPortal();
        if (push.ok) {
          setMessage(`PIN diterapkan ke ${updated} krama & dikirim ke cloud (${push.upserted ?? 0} akun).`);
        } else if (push.upserted != null && (push.errors?.length ?? 0) > 0) {
          setMessage(`PIN diterapkan. Cloud: ${push.upserted} akun, ${push.errors!.length} gagal.`);
          setWarning(push.errors!.slice(0, 3).join(" · "));
        } else {
          setWarning(
            push.message ?? (
              <>
                PIN tersimpan lokal — coba <strong>Kirim portal ke cloud</strong> di bawah.
              </>
            )
          );
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!desktop) return null;

  return (
    <Card title="Portal Krama — PIN seragam" className="space-y-3">
      <p className="text-xs text-muted leading-relaxed">
        Atur satu PIN untuk semua krama <strong>aktif</strong>. Krama login di{" "}
        <code className="text-[10px]">/portal/login</code> dengan nomor kartu (atau scan QR) + PIN
        ini. PIN per krama di detail krama tetap bisa dipakai untuk pengecualian.
      </p>
      <p className="text-[11px] text-muted">
        Krama aktif: <strong>{activeCount}</strong> · sudah punya PIN portal:{" "}
        <strong>{configuredCount}</strong>
      </p>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
        PIN seragam praktis untuk desa kecil, tetapi kurang aman jika PIN bocor — jangan bagikan ke
        pihak luar desa.
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label>PIN portal (4–8 digit)</Label>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            disabled={busy}
          />
        </div>
        <div>
          <Label>Ulangi PIN</Label>
          <Input
            type="password"
            inputMode="numeric"
            value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, 8))}
            disabled={busy}
          />
        </div>
      </div>
      <Button
        type="button"
        icon={KeyRound}
        onClick={() => void handleApply()}
        disabled={busy || activeCount === 0}
      >
        {busy ? "Menerapkan…" : "Terapkan ke semua krama aktif"}
      </Button>
      {message && <p className="text-xs text-emerald-800">{message}</p>}
      {warning && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          {warning}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-[11px] text-muted flex items-center gap-1.5">
        <Globe size={14} className="shrink-0" aria-hidden />
        Setelah menerapkan, pastikan krama sudah di-push ke cloud lalu{" "}
        <Link to={settingsPath("online")} className="underline">
          kirim portal
        </Link>
        .
      </p>
    </Card>
  );
}
