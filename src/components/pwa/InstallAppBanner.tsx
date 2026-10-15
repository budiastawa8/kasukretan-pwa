import { Download, Share, X } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { isDesktopApp } from "../../lib/runtime";
import {
  dismissInstall,
  isInstallDismissed,
  isIos,
  isStandalone,
  promptInstall,
  usePwaInstall,
  visitCount,
} from "./pwa-install";

const TUNDA_HARI = 14;
/** Kunjungan pertama dibiarkan bebas ajakan — user sempat mencoba aplikasinya dulu. */
const MIN_KUNJUNGAN = 2;

export function InstallAppBanner({ isPhone }: { isPhone: boolean }) {
  const { canPrompt } = usePwaInstall();

  if (isDesktopApp() || isStandalone() || isInstallDismissed()) return null;
  if (visitCount() < MIN_KUNJUNGAN) return null;
  const ios = !canPrompt && isIos();
  if (!canPrompt && !ios) return null;

  const tunda = () => dismissInstall(TUNDA_HARI);

  return (
    <div
      role="dialog"
      aria-label="Pasang aplikasi"
      className={cn(
        "mb-3 rounded-lg border border-copper-200 bg-card px-3 py-2.5 text-copper-950 shadow-md shadow-copper-950/10 print:hidden",
        !isPhone && "max-w-xl"
      )}
    >
      <div className="flex items-start gap-2.5">
        <img src="/pwa-192x192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">Pasang Kasukretan di perangkat ini</p>
          {ios ? (
            <p className="mt-0.5 text-xs leading-snug text-muted">
              Di Safari, ketuk tombol Bagikan{" "}
              <Share size={12} className="inline -mt-0.5" aria-label="Bagikan" />, lalu pilih
              “Tambah ke Layar Utama”.
            </p>
          ) : (
            <p className="mt-0.5 text-xs leading-snug text-muted">
              Buka langsung dari layar utama, tampil layar penuh tanpa bilah browser.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            {canPrompt && (
              <Button
                type="button"
                icon={Download}
                className="h-9 text-xs"
                onClick={() => {
                  void promptInstall().then((hasil) => {
                    if (hasil === "dismissed") tunda();
                  });
                }}
              >
                Pasang
              </Button>
            )}
            <Button type="button" variant="secondary" className="h-9 text-xs" onClick={tunda}>
              {ios ? "Mengerti" : "Nanti"}
            </Button>
          </div>
        </div>
        <button
          type="button"
          className="-mr-1 -mt-1 rounded-md p-1.5 text-muted hover:bg-copper-50 hover:text-copper-900"
          aria-label="Tutup"
          onClick={tunda}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
