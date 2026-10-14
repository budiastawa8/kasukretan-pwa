import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../ui/Button";

/** Cek versi baru tiap jam selama aplikasi terbuka, dan tiap kali aplikasi kembali dibuka. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** Halaman tanpa isian yang bisa hilang — versi baru langsung dipasang tanpa bertanya. */
const AUTO_UPDATE_PATHS = ["/login"];

export function UpdatePrompt() {
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
    if (needRefresh && AUTO_UPDATE_PATHS.includes(window.location.pathname)) {
      void updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[10000] mx-auto flex max-w-md items-center gap-3 rounded-lg border border-copper-300 bg-card px-3 py-2.5 text-sm shadow-lg"
    >
      <span className="flex-1 text-copper-900">Versi baru aplikasi tersedia.</span>
      <Button type="button" size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        Nanti
      </Button>
      <Button type="button" size="sm" icon={RefreshCw} onClick={() => void updateServiceWorker(true)}>
        Muat ulang
      </Button>
    </div>
  );
}
