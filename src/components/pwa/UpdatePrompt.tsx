import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../ui/Button";

/** Cek versi baru tiap jam selama aplikasi terbuka, dan tiap kali aplikasi kembali dibuka. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Halaman tanpa isian yang bisa hilang — versi baru langsung dipasang tanpa bertanya. */
const AUTO_UPDATE_PATHS = ["/login", "/portal/login"];

/**
 * Alur pengumpulan petugas: jangan ganggu dengan banner di bawah layar.
 * Update ditawarkan setelah keluar dari halaman ini (kecuali sedang di-snooze).
 */
function isPengumpulanPath(pathname: string): boolean {
  return pathname === "/pengumpulan" || pathname.startsWith("/pengumpulan/");
}

const SNOOZE_STORAGE_KEY = "kasukretan.pwa_update_snooze_until.v1";
/** Setelah "Nanti", banner tidak muncul lagi selama jam kerja lapangan. */
const SNOOZE_MS = 8 * 60 * 60 * 1000;

function readSnoozeUntil(): number {
  try {
    const n = Number(localStorage.getItem(SNOOZE_STORAGE_KEY) ?? "");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeSnoozeUntil(untilMs: number): void {
  try {
    localStorage.setItem(SNOOZE_STORAGE_KEY, String(untilMs));
  } catch {
    /* ignore quota / private mode */
  }
}

function isSnoozed(now = Date.now()): boolean {
  return now < readSnoozeUntil();
}

export function UpdatePrompt() {
  const { pathname } = useLocation();
  /** Epoch agar snooze di localStorage dievaluasi ulang setelah "Nanti" / tab terlihat. */
  const [snoozeEpoch, setSnoozeEpoch] = useState(0);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update();
      setInterval(check, UPDATE_CHECK_MS);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });

  useEffect(() => {
    if (needRefresh && AUTO_UPDATE_PATHS.includes(pathname)) {
      void updateServiceWorker(true);
    }
  }, [needRefresh, pathname, updateServiceWorker]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") setSnoozeEpoch((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  function dismissForLater() {
    writeSnoozeUntil(Date.now() + SNOOZE_MS);
    setNeedRefresh(false);
    setSnoozeEpoch((n) => n + 1);
  }

  const hideForSnooze = snoozeEpoch >= 0 && isSnoozed();
  if (!needRefresh) return null;
  if (isPengumpulanPath(pathname)) return null;
  if (hideForSnooze) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[10000] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-copper-300 bg-card px-3 py-2.5 text-sm shadow-lg"
    >
      <span className="flex-1 text-copper-900">Versi baru aplikasi tersedia.</span>
      <Button type="button" size="sm" variant="ghost" onClick={dismissForLater}>
        Nanti
      </Button>
      <Button type="button" size="sm" icon={RefreshCw} onClick={() => void updateServiceWorker(true)}>
        Muat ulang
      </Button>
    </div>
  );
}
