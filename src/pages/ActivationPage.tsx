import { ShieldCheck } from "lucide-react";
import { DesktopActivateForm } from "../components/license/DesktopActivateForm";
import type { LicenseStatus } from "../lib/license";
import { Card } from "../components/ui/Card";

type Props = {
  initialStatus: LicenseStatus;
  onActivated: () => void;
};

export function ActivationPage({ initialStatus, onActivated }: Props) {
  const trialExpired =
    !initialStatus.activated &&
    initialStatus.desktop_expires_at != null &&
    initialStatus.desktop_expires_at > 0 &&
    !initialStatus.desa_kode;

  return (
    <div className="min-h-screen bg-copper-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg border-copper-200">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="text-copper-700" size={24} />
          <h1 className="text-xl font-bold text-copper-900">Aktivasi Kasukretan</h1>
        </div>
        <p className="text-sm text-muted mb-4 leading-relaxed">
          {trialExpired
            ? "Masa trial 30 hari telah berakhir. Tempel kode lisensi dari vendor untuk melanjutkan."
            : "Tempel kode lisensi dari vendor. Satu kode berlaku untuk desa ini (maks. 2 mesin)."}
        </p>

        {initialStatus.message && !trialExpired && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 mb-4">
            {initialStatus.message}
          </p>
        )}

        <DesktopActivateForm onActivated={() => onActivated()} />

        <p className="text-[11px] text-muted mt-4 leading-relaxed">
          Mesin kedua memakai kode yang sama. Modul cloud (petugas & portal) diaktifkan terpisah di
          Pengaturan setelah lisensi desktop aktif.
        </p>
      </Card>
    </div>
  );
}
