import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => l());
}

const VISIT_COUNT_KEY = "kasukretan.pwa-install.visits";
const VISIT_SESSION_KEY = "kasukretan.pwa-install.visit-counted";
const DISMISSED_UNTIL_KEY = "kasukretan.pwa-install.dismissed-until";

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });

  try {
    if (!sessionStorage.getItem(VISIT_SESSION_KEY)) {
      sessionStorage.setItem(VISIT_SESSION_KEY, "1");
      localStorage.setItem(VISIT_COUNT_KEY, String(readNumber(VISIT_COUNT_KEY) + 1));
    }
  } catch {
    /* storage diblokir (mode privat) — ajakan tetap jalan tanpa hitungan kunjungan */
  }
}

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function visitCount(): number {
  return readNumber(VISIT_COUNT_KEY);
}

export function isInstallDismissed(): boolean {
  return Date.now() < readNumber(DISMISSED_UNTIL_KEY);
}

export function dismissInstall(days: number): void {
  try {
    localStorage.setItem(DISMISSED_UNTIL_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
  } catch {
    /* abaikan */
  }
  notify();
}

/** Tampilkan dialog instal bawaan browser; `null` jika browser belum menawarkan instal. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  const p = deferredPrompt;
  if (!p) return null;
  try {
    await p.prompt();
    const { outcome } = await p.userChoice;
    return outcome;
  } finally {
    deferredPrompt = null;
    notify();
  }
}

export function usePwaInstall(): { canPrompt: boolean } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { canPrompt: deferredPrompt != null };
}
