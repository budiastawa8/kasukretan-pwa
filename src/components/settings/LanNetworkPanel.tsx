import { useEffect, useMemo, useState } from "react";
import { Network, Wifi } from "lucide-react";
import QRCode from "qrcode";
import {
  getElectronApi,
  isElectronShell,
  type ElectronLanServerState,
} from "../../lib/electron-bridge";
const STORAGE_KEY = "kasukretan.electron.mode";
const CLIENT_URL_KEY = "kasukretan.electron.clientUrl";
const PORT_KEY = "kasukretan.electron.lanPort";

function compactUrl(ip: string, port: number) {
  return `http://${ip}:${port}`;
}

/**
 * Pengaturan LAN: jadikan PC ini server WiFi, atau hubungkan sebagai klien.
 * Hanya tampil di shell Electron.
 */
export function LanNetworkPanel() {
  const electron = isElectronShell();
  const api = getElectronApi();

  const [port, setPort] = useState(() => {
    const saved = Number(localStorage.getItem(PORT_KEY));
    return saved >= 1024 && saved <= 65535 ? saved : 8080;
  });
  const [clientUrl, setClientUrl] = useState(
    () => localStorage.getItem(CLIENT_URL_KEY) || "http://192.168."
  );
  const [ips, setIps] = useState<string[]>([]);
  const [serverState, setServerState] = useState<ElectronLanServerState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [section, setSection] = useState<"server" | "client">("server");

  useEffect(() => {
    if (!electron || !api) return;
    let cancelled = false;
    void (async () => {
      try {
        const env = await api.getEnv();
        const localIps = await api.getLocalIps();
        const existing = await api.getServerState();
        if (cancelled) return;
        if (!localStorage.getItem(PORT_KEY)) setPort(env.defaultPort);
        setIps(localIps);
        if (existing.running) {
          setServerState(existing);
          setSection("server");
        }
        const savedMode = localStorage.getItem(STORAGE_KEY);
        if (savedMode === "client") setSection("client");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electron, api]);

  const lanUrls = useMemo(() => {
    const p = serverState?.port ?? port;
    return ips.map((ip) => compactUrl(ip, p));
  }, [ips, port, serverState?.port]);

  const primaryLanUrl = lanUrls[0] ?? null;

  useEffect(() => {
    if (!primaryLanUrl || !serverState?.running) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(primaryLanUrl, {
      width: 140,
      margin: 1,
      color: { dark: "#5c3518", light: "#fffcf8" },
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [primaryLanUrl, serverState?.running]);

  if (!electron || !api) return null;

  async function startAsServer() {
    setBusy(true);
    setError(null);
    try {
      localStorage.setItem(PORT_KEY, String(port));
      const state = await api!.startServer({ port, spawnApi: true });
      setServerState(state);
      if (state.lanUrls?.length) {
        setIps(
          state.lanUrls
            .map((u) => u.replace(/^https?:\/\//i, "").split(":")[0]!)
            .filter(Boolean)
        );
      } else {
        setIps(await api!.getLocalIps());
      }
      localStorage.setItem(STORAGE_KEY, "server");
      await api!.setSession({ mode: "server", entered: true });
      if (state.lastError) setError(state.lastError);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function stopAsServer() {
    setBusy(true);
    setError(null);
    try {
      const state = await api!.stopServer();
      setServerState(state);
      setQrDataUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function connectAsClient() {
    const url = clientUrl.trim().replace(/\/$/, "");
    if (!/^https?:\/\/.+/i.test(url)) {
      setError("URL harus diawali http:// atau https://");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const health = await fetch(`${url}/lan/health`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!health.ok) throw new Error("Server merespons tetapi /lan/health tidak OK");
      localStorage.setItem(STORAGE_KEY, "client");
      localStorage.setItem(CLIENT_URL_KEY, url);
      await api!.setSession({ mode: "client", clientUrl: url, entered: true });
      await api!.loadUrl(url);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message.includes("Failed to fetch") || e.name === "TimeoutError"
            ? "Tidak bisa menjangkau server. Pastikan PC server aktif di WiFi yang sama dan firewall mengizinkan port."
            : e.message
          : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Gagal menyalin ke clipboard");
    }
  }

  return (
    <details
      open
      className="group rounded-lg border border-copper-200 bg-copper-50/30 overflow-hidden"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-copper-900 hover:bg-copper-50/80 select-none [&::-webkit-details-marker]:hidden">
        <Network size={16} className="text-copper-700 shrink-0" aria-hidden />
        <span className="flex-1">Jaringan LAN</span>
        <span className="text-[11px] font-normal text-muted hidden sm:inline">
          Server / klien WiFi lokal
        </span>
      </summary>

      <div className="border-t border-copper-200 px-4 py-4 space-y-3 bg-card">
        <p className="text-xs text-muted leading-relaxed">
          Jadikan PC ini <strong className="text-copper-900 font-medium">server</strong> agar HP
          dan laptop di WiFi yang sama bisa membuka aplikasi lewat browser — tanpa internet.
        </p>

        <div className="flex gap-1 p-0.5 rounded-md bg-copper-100/80 border border-copper-200 w-fit">
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
              section === "server"
                ? "bg-copper-800 text-white shadow-sm"
                : "text-copper-800 hover:bg-copper-200/80"
            }`}
            onClick={() => setSection("server")}
          >
            Server
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
              section === "client"
                ? "bg-copper-800 text-white shadow-sm"
                : "text-copper-800 hover:bg-copper-200/80"
            }`}
            onClick={() => setSection("client")}
          >
            Klien
          </button>
        </div>

        {section === "server" && (
          <div className="space-y-3">
            <label className="block max-w-[10rem]">
              <span className="text-[11px] font-medium text-muted">Port LAN</span>
              <input
                type="number"
                min={1024}
                max={65535}
                value={port}
                disabled={Boolean(serverState?.running)}
                onChange={(e) => setPort(Number(e.target.value) || 8080)}
                className="mt-1 w-full rounded-md border border-copper-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-copper-500 disabled:opacity-60"
              />
            </label>

            {!serverState?.running && ips.length > 0 && (
              <div className="rounded-md border border-copper-100 bg-copper-50/50 px-2.5 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted mb-1">
                  IP LAN terdeteksi
                </p>
                <ul className="space-y-0.5 text-[11px] font-mono text-copper-900">
                  {ips.map((ip) => (
                    <li key={ip}>{ip}</li>
                  ))}
                </ul>
              </div>
            )}

            {serverState?.running && (
              <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-teal-800 font-semibold flex items-center gap-1">
                      <Wifi size={12} aria-hidden /> Server aktif
                    </p>
                    <p className="text-[11px] font-mono text-teal-900 mt-0.5">
                      0.0.0.0:{serverState.port}
                      {serverState.apiSpawned ? " · API lokal" : ""}
                    </p>
                  </div>
                  {qrDataUrl && (
                    <img
                      src={qrDataUrl}
                      alt="QR URL LAN"
                      className="h-[70px] w-[70px] rounded border border-copper-200 bg-white"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted">URL untuk HP / laptop klien</p>
                  {lanUrls.map((url) => (
                    <div
                      key={url}
                      className="flex items-center gap-1.5 rounded-md border border-copper-200 bg-white px-2 py-1"
                    >
                      <code className="flex-1 truncate text-[11px] text-copper-900">{url}</code>
                      <button
                        type="button"
                        onClick={() => void copyText(url)}
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-copper-800 hover:bg-copper-100"
                      >
                        {copied === url ? "Tersalin" : "Salin"}
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted leading-snug">
                  Scan QR dari HP atau buka URL di Chrome/Edge pada WiFi yang sama.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!serverState?.running ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startAsServer()}
                  className="rounded-md bg-copper-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-copper-700 disabled:opacity-50"
                >
                  {busy ? "Menyalakan…" : "Mulai server LAN"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void stopAsServer()}
                  className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-50 disabled:opacity-50"
                >
                  {busy ? "Menghentikan…" : "Stop server"}
                </button>
              )}
            </div>
          </div>
        )}

        {section === "client" && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-medium text-muted">URL server</span>
              <input
                type="url"
                value={clientUrl}
                onChange={(e) => setClientUrl(e.target.value)}
                placeholder="http://192.168.1.10:8080"
                className="mt-1 w-full rounded-md border border-copper-200 bg-white px-2.5 py-1.5 text-sm font-mono outline-none focus:border-copper-500"
              />
            </label>
            <p className="text-[10px] text-muted leading-snug">
              Isi URL dari PC server (atau hasil scan QR). Jendela Electron akan memuat UI remote.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void connectAsClient()}
              className="rounded-md bg-copper-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-copper-700 disabled:opacity-50"
            >
              {busy ? "Menghubungkan…" : "Hubungkan ke server"}
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-800 leading-snug">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
