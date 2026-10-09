import { useEffect, useState } from "react";
import App from "./App";
import { AppSplash } from "./components/layout/AppSplash";
import { initLanClientDatabase } from "./lib/db/init";
import { probeLanBridge } from "./lib/lan-client";

const MIN_SPLASH_MS = 900;
const FADE_MS = 320;

/** Hindari setState dari run Strict Mode yang sudah dibatalkan. */
let bootRunId = 0;

export function BootstrapApp() {
  const [ready, setReady] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const runId = ++bootRunId;
    let fadeTimer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      const started = Date.now();
      try {
        if (await probeLanBridge(true)) await initLanClientDatabase();
      } catch (e) {
        console.error("Koneksi server gagal:", e);
      }

      const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - started));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (runId !== bootRunId) return;

      document.getElementById("app-splash-static")?.remove();
      setFading(true);
      fadeTimer = setTimeout(() => {
        if (runId === bootRunId) setReady(true);
      }, FADE_MS);
    })();

    return () => {
      if (fadeTimer) clearTimeout(fadeTimer);
    };
  }, []);

  return ready ? <App /> : <AppSplash fading={fading} />;
}
