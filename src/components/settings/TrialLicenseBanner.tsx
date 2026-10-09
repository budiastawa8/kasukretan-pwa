import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { DesktopActivateForm } from "../license/DesktopActivateForm";
import {
  desktopTrialDaysRemaining,
  formatLicenseExpiry,
  getLicenseStatus,
  isDesktopTrial,
  type LicenseStatus,
} from "../../lib/license";
import { refreshOnlineModuleLicense } from "../../lib/online-module";
import { isDesktopApp } from "../../lib/runtime";

export function TrialLicenseBanner() {
  const { user } = useAuth();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return;
    void getLicenseStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!isDesktopApp() || !user || !isDesktopTrial(status)) return null;

  const daysLeft = desktopTrialDaysRemaining(status);
  const expiryLabel = formatLicenseExpiry(status?.desktop_expires_at ?? null);
  const urgent = daysLeft != null && daysLeft <= 7;
  const localTrial = Boolean(status?.local_trial);

  return (
    <div
      role="status"
      className={`mb-3 rounded-md border px-3 py-2 text-xs ${
        urgent
          ? "bg-amber-50 border-amber-200 text-amber-950"
          : "bg-sky-50 border-sky-200 text-sky-950"
      }`}
    >
      <div className="flex items-start gap-2">
        <Clock size={16} className="shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {localTrial ? "Mode trial gratis (30 hari)" : "Mode trial desktop"}
          </p>
          <p className="mt-0.5 leading-relaxed opacity-90">
            {daysLeft != null && daysLeft > 0
              ? `Sisa ${daysLeft} hari`
              : "Berakhir hari ini"}
            {expiryLabel ? ` — hingga ${expiryLabel}` : ""}.{" "}
            {localTrial
              ? "Aktivasi kapan saja dengan kode dari vendor. Data tetap aman."
              : "Hubungi vendor untuk lisensi permanen setelah evaluasi selesai."}
          </p>
          {!showForm && (
            <button
              type="button"
              className="mt-1.5 font-medium underline underline-offset-2"
              onClick={() => setShowForm(true)}
            >
              Aktivasi sekarang
            </button>
          )}
        </div>
      </div>
      {showForm && (
        <div className="mt-3 pt-2 border-t border-current/10">
          <DesktopActivateForm
            submitLabel="Aktifkan lisensi"
            onActivated={async (next) => {
              setStatus(next);
              setShowForm(false);
              await refreshOnlineModuleLicense();
            }}
          />
        </div>
      )}
    </div>
  );
}
