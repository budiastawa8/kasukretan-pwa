import { useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { isIos, isStandalone, promptInstall, usePwaInstall } from "./pwa-install";

export function InstallAppButton({ className }: { className?: string }) {
  const { canPrompt } = usePwaInstall();
  const [iosHint, setIosHint] = useState(false);

  if (isStandalone()) return null;

  if (canPrompt) {
    return (
      <Button
        type="button"
        variant="secondary"
        icon={Download}
        className={cn("h-11 w-full text-sm", className)}
        onClick={() => void promptInstall()}
      >
        Pasang aplikasi di perangkat ini
      </Button>
    );
  }

  if (isIos()) {
    return (
      <div className={cn("text-center", className)}>
        <button
          type="button"
          className="text-xs text-copper-800 underline"
          onClick={() => setIosHint((v) => !v)}
        >
          Pasang di iPhone/iPad
        </button>
        {iosHint && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-copper-200 bg-copper-50 px-2.5 py-2 text-left text-xs leading-snug text-copper-900">
            <Share size={14} className="mt-0.5 shrink-0" aria-hidden />
            Buka di Safari, ketuk tombol Bagikan, lalu pilih “Tambah ke Layar Utama”.
          </p>
        )}
      </div>
    );
  }

  return null;
}
