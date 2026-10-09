import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Globe, KeyRound, Monitor } from "lucide-react";
import { isDesktopApp } from "../../lib/runtime";
import {
  getKramaPortalStatus,
  setKramaPortalAktif,
  setKramaPortalPin,
  validatePortalPin,
} from "../../lib/services/krama-portal";
import { getCloudApiToken } from "../../lib/sync/cloud-config";
import { tryAutoPushPortal } from "../../lib/sync/auto-push-portal";
import { Link } from "react-router-dom";
import { settingsPath } from "../../lib/settings-routes";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";

type Props = {
  kramaId: string;
  nomorKartu: string;
  statusKrama: string;
};

export function KramaPortalCard({ kramaId, nomorKartu, statusKrama }: Props) {
  const desktop = isDesktopApp();
  const kramaAktif = statusKrama === "aktif";
  const canManage = desktop && kramaAktif;

  const [aktif, setAktif] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState<ReactNode>("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!canManage) return;
    getKramaPortalStatus(kramaId)
      .then((s) => {
        setAktif(s.aktif);
        setUpdatedAt(s.updated_at);
      })
      .catch((e) => setError(String(e)));
  }, [kramaId, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSavePin() {
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
    setBusy(true);
    try {
      await setKramaPortalPin(kramaId, pin, true);
      setPin("");
      setPin2("");
      setMessage("PIN portal disimpan di komputer ini.");
      load();

      if (!getCloudApiToken()) {
        setWarning(
          <>
            Kirim ke server lewat{" "}
            <Link to={settingsPath("online")} className="underline font-medium">
              Pengaturan → Modul Online
            </Link>{" "}
            (login API dulu).
          </>
        );
      } else {
        const push = await tryAutoPushPortal();
        if (push.ok) {
          setMessage(`PIN disimpan & dikirim ke cloud (${push.upserted ?? 0} akun).`);
        } else if (push.upserted != null && (push.errors?.length ?? 0) > 0) {
          setMessage(`PIN disimpan. Cloud: ${push.upserted} akun, ${push.errors!.length} gagal.`);
          setWarning(push.errors!.slice(0, 3).join(" · "));
        } else {
          setWarning(
            push.message ?? (
              <>
                Gagal kirim otomatis ke server — coba Kirim portal di{" "}
                <Link to={settingsPath("online")} className="underline font-medium">
                  Pengaturan → Modul Online
                </Link>
                .
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

  async function handleToggleAktif(next: boolean) {
    setBusy(true);
    setError("");
    setMessage("");
    setWarning("");
    try {
      await setKramaPortalAktif(kramaId, next);
      setMessage(next ? "Portal diaktifkan" : "Portal dinonaktifkan");
      load();
      if (getCloudApiToken()) {
        const push = await tryAutoPushPortal();
        if (!push.ok && push.message) {
          setWarning(
            <>
              {push.message} — coba Kirim portal di{" "}
              <Link to={settingsPath("online")} className="underline font-medium">
                Pengaturan → Modul Online
              </Link>
              .
            </>
          );
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="group rounded-lg border border-copper-200 bg-card text-sm overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium text-copper-900 hover:bg-copper-50/60 select-none [&::-webkit-details-marker]:hidden">
        <Globe size={16} className="text-copper-700 shrink-0" aria-hidden />
        <span className="flex-1">Portal Krama (opsional)</span>
        <span className="text-[11px] font-normal text-muted hidden sm:inline">Hanya baca tagihan</span>
        <ChevronDown
          size={16}
          className="text-muted shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-copper-200 px-4 py-3 space-y-3">
      <p className="text-xs text-muted leading-relaxed">
        Krama dapat login di <code className="text-[10px]">/portal/login</code> dengan nomor kartu{" "}
        <strong>{nomorKartu}</strong> dan PIN yang Anda atur di sini. Perlu sinkronisasi server jika
        portal dipakai.
      </p>

      {!desktop && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 mb-3 flex gap-2">
          <Monitor size={16} className="shrink-0 mt-0.5" aria-hidden />
          <p>
            Pengaturan PIN hanya tersedia di <strong>aplikasi desktop</strong> (
            <code className="text-[10px]">npm run electron:dev</code> atau instalasi Electron), bukan di
            browser biasa (<code className="text-[10px]">npm run dev</code>).
          </p>
        </div>
      )}

      {desktop && !kramaAktif && (
        <p className="text-xs text-muted mb-3 rounded-lg border border-copper-200 bg-copper-50 px-3 py-2">
          Portal hanya bisa diatur untuk krama berstatus <strong>aktif</strong>.
        </p>
      )}

      {canManage && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className={
                aktif
                  ? "text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5"
                  : "text-xs font-medium text-muted bg-copper-50 border border-copper-200 rounded px-2 py-0.5"
              }
            >
              {aktif ? "Aktif" : updatedAt ? "Nonaktif" : "Belum diatur"}
            </span>
            {updatedAt && (
              <span className="text-[11px] text-muted">
                Diperbarui {new Date(updatedAt).toLocaleString("id-ID")}
              </span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 mb-3">
            <div>
              <Label>PIN baru (4–8 digit)</Label>
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

          <div className="flex flex-wrap gap-2">
            <Button type="button" icon={KeyRound} onClick={() => void handleSavePin()} disabled={busy}>
              Simpan PIN
            </Button>
            {updatedAt && (
              <Button
                type="button"
                variant="secondary"
                icon={Globe}
                onClick={() => void handleToggleAktif(!aktif)}
                disabled={busy}
              >
                {aktif ? "Nonaktifkan" : "Aktifkan"}
              </Button>
            )}
          </div>
        </>
      )}

      {message && <p className="text-xs text-emerald-800 mt-2">{message}</p>}
      {warning && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-2">
          {warning}
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </details>
  );
}
