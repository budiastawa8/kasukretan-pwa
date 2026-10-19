/**
 * Notifikasi sistem (Web Notification / PWA) untuk pengingat setoran.
 * Di arsitektur lokal/desktop, notifikasi dikirim saat app memeriksa data telat
 * (bukan cron cloud). Service worker menampilkan notifikasi agar tetap tampil
 * meski tab di background.
 */

const VAPID_PUBLIC =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
    : undefined;

export function notificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Daftar Web Push bila VITE_VAPID_PUBLIC_KEY tersedia (siap untuk server push nanti). */
export async function ensurePushSubscription(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    });
  } catch {
    return null;
  }
}

export type ShowAppNotificationOpts = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

export async function showAppNotification(opts: ShowAppNotificationOpts): Promise<boolean> {
  const perm = await requestNotificationPermission();
  if (perm !== "granted") return false;

  const payload = {
    body: opts.body,
    tag: opts.tag ?? "kasukretan",
    renotify: true,
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    data: { url: opts.url ?? "/" },
  } as NotificationOptions;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(opts.title, payload);
        void ensurePushSubscription();
        return true;
      }
    }
  } catch {
    /* fallback ke Notification API */
  }

  try {
    const n = new Notification(opts.title, payload);
    n.onclick = () => {
      window.focus();
      n.close();
      if (opts.url) window.location.assign(opts.url);
    };
    return true;
  } catch {
    return false;
  }
}
