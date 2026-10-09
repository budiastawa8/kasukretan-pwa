import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l());
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function InstallAppButton({ className }: { className?: string }) {
  const [, setTick] = useState(0);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (isStandalone()) return null;

  if (deferredPrompt) {
    return (
      <Button
        type="button"
        variant="secondary"
        icon={Download}
        className={cn("h-11 w-full text-sm", className)}
        onClick={() => {
          const p = deferredPrompt;
          if (!p) return;
          void p.prompt().then(() => p.userChoice).finally(() => {
            deferredPrompt = null;
            setTick((n) => n + 1);
          });
        }}
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
