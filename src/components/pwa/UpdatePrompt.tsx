import { RefreshCw } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../ui/Button";

/** Cek versi baru tiap jam selama aplikasi terbuka. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });

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
