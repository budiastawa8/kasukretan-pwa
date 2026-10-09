import { useEffect, useState, type ReactNode } from "react";
import { ExternalLink, Info } from "lucide-react";
import {
  APP_CREDITS,
  appCopyrightLine,
  appCopyrightNoticeParagraphs,
  appVersionLabel,
} from "../../lib/app-credits";
import {
  desktopTrialDaysRemaining,
  formatCloudExpiry,
  formatLicenseExpiry,
  getLicenseStatus,
  isDesktopTrial,
  type LicenseStatus,
} from "../../lib/license";
import { refreshOnlineModuleLicense } from "../../lib/online-module";
import { isDesktopApp } from "../../lib/runtime";
import { CollapsibleSettingsSection } from "./CollapsibleSettingsSection";
import { DesktopActivateForm } from "../license/DesktopActivateForm";
import { AppLogo } from "../ui/AppLogo";

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[7.5rem_1fr] gap-0.5 sm:gap-2 text-sm">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-copper-950 min-w-0">{value}</dd>
    </div>
  );
}

function LicenseSummary({ status }: { status: LicenseStatus }) {
  if (!status.enforced) {
    return <span className="text-muted">Mode pengembangan — lisensi tidak diterapkan.</span>;
  }

  if (!status.activated) {
    return <span className="text-amber-900">Belum diaktivasi.</span>;
  }

  const parts: string[] = [];
  if (isDesktopTrial(status)) {
    const days = desktopTrialDaysRemaining(status);
    const trialExpiry = formatLicenseExpiry(status.desktop_expires_at);
    if (status.local_trial) {
      parts.push(days != null && days > 0 ? `Trial gratis (${days} hari lagi)` : "Trial gratis");
    } else if (days != null && days > 0) {
      parts.push(`Trial (${days} hari lagi)`);
    } else {
      parts.push("Trial");
    }
    if (trialExpiry) parts.push(`hingga ${trialExpiry}`);
  } else {
    parts.push("Aktif");
  }
  if (status.desa_kode?.trim()) {
    parts.push(`desa ${status.desa_kode.trim()}`);
  }
  if (!status.local_trial) {
    parts.push(`mesin ${status.machine_count}/${status.max_machines}`);
  }

  const cloudExpiry = formatCloudExpiry(status.cloud_expires_at);
  if (status.cloud_enabled) {
    parts.push(cloudExpiry ? `cloud hingga ${cloudExpiry}` : "modul cloud aktif");
  }

  return <span>{parts.join(" · ")}</span>;
}

export function AppAboutPanel() {
  const desktop = isDesktopApp();
  const [license, setLicense] = useState<LicenseStatus | null>(null);

  useEffect(() => {
    if (!desktop) return;
    void getLicenseStatus().then(setLicense).catch(() => setLicense(null));
  }, [desktop]);

  return (
    <CollapsibleSettingsSection
      title="Tentang Aplikasi"
      subtitle="Versi, hak cipta, kontak"
      icon={Info}
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
        <AppLogo size={72} className="shrink-0" alt="" />
        <div className="space-y-3 min-w-0 flex-1">
          <div>
            <p className="text-base font-semibold text-copper-950">{APP_CREDITS.productName}</p>
            <p className="text-sm text-muted">{APP_CREDITS.tagline}</p>
            <p className="text-sm text-copper-900 leading-relaxed mt-2">{APP_CREDITS.description}</p>
          </div>

          <dl className="space-y-2">
            <InfoRow label="Versi" value={appVersionLabel()} />
            <InfoRow label="Pemilik" value={APP_CREDITS.legalName || APP_CREDITS.owner} />
            <InfoRow label="Hak cipta" value={appCopyrightLine()} />
            {desktop && license && (
              <InfoRow label="Lisensi" value={<LicenseSummary status={license} />} />
            )}
            {!desktop && (
              <InfoRow
                label="Lingkungan"
                value="Pratinjau browser — aplikasi utama berjalan di desktop."
              />
            )}
            <InfoRow
              label="Kontak"
              value={
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a
                    href={APP_CREDITS.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-copper-800 underline underline-offset-2 hover:text-copper-950"
                  >
                    {APP_CREDITS.website.replace(/^https?:\/\//, "")}
                    <ExternalLink size={12} aria-hidden />
                  </a>
                  {APP_CREDITS.supportEmail && (
                    <a
                      href={`mailto:${APP_CREDITS.supportEmail}`}
                      className="text-copper-800 underline underline-offset-2 hover:text-copper-950"
                    >
                      {APP_CREDITS.supportEmail}
                    </a>
                  )}
                </span>
              }
            />
          </dl>

          {desktop && license && isDesktopTrial(license) && (
            <div className="rounded-md border border-copper-200 bg-white px-3 py-3 space-y-2">
              <p className="text-xs text-muted leading-relaxed">
                Tempel kode <code className="font-mono">KSK2...</code> dari vendor. Satu kode
                berlaku untuk desa ini (maks. 2 mesin).
              </p>
              <DesktopActivateForm
                submitLabel="Aktifkan lisensi"
                onActivated={async (next) => {
                  setLicense(next);
                  await refreshOnlineModuleLicense();
                }}
              />
            </div>
          )}

          <div
            className="rounded-md border border-copper-200 bg-copper-50/60 px-3 py-2.5 space-y-2"
            aria-label="Pernyataan hak cipta dan lisensi"
          >
            <p className="text-xs font-semibold text-copper-950">Pernyataan hak cipta &amp; lisensi</p>
            {appCopyrightNoticeParagraphs().map((paragraph) => (
              <p key={paragraph.slice(0, 48)} className="text-xs text-copper-900 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Surat, kartu, dan dokumen resmi yang dicetak dari aplikasi merupakan identitas desa adat
            masing-masing, bukan materi promosi vendor. Salinan lengkap kontrak lisensi dapat
            diminta melalui kontak di atas.
          </p>
        </div>
      </div>
    </CollapsibleSettingsSection>
  );
}
