/**
 * Form factor klien: phone / tablet / desktop.
 * Dipakai untuk shell & daftar yang beda di HP vs laptop (bukan sekadar LAN).
 *
 * Catatan Chrome Android: untuk host IP/LAN sering menyalakan "Situs desktop"
 * sehingga layout viewport ~980px meski layar HP. Deteksi menggabungkan
 * media query CSS + ukuran screen + pointer/UA.
 */

export type ClientFormFactor = "phone" | "tablet" | "desktop";

const PHONE_MAX = 767;
const TABLET_MAX = 1023;

const PHONE_MQ = `(max-width: ${PHONE_MAX}px)`;
const TABLET_MQ = `(min-width: ${PHONE_MAX + 1}px) and (max-width: ${TABLET_MAX}px)`;

function shortScreenSide(): number {
  return Math.min(window.screen.width || 0, window.screen.height || 0);
}

function uaSaysMobile(): boolean {
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (typeof uaData?.mobile === "boolean") return uaData.mobile;
  return /Android.+Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/** HP fisik meski Chrome memaksa viewport desktop. */
function hardwareSuggestsPhone(): boolean {
  const shortSide = shortScreenSide();
  if (shortSide <= 0 || shortSide > PHONE_MAX) return false;

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (uaSaysMobile()) return true;
  if (coarse) return true;
  return false;
}

function hardwareSuggestsTablet(): boolean {
  const shortSide = shortScreenSide();
  if (shortSide <= PHONE_MAX || shortSide > TABLET_MAX) return false;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  return coarse || uaSaysMobile();
}

export function readClientFormFactor(): ClientFormFactor {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia(PHONE_MQ).matches || hardwareSuggestsPhone()) return "phone";
  if (window.matchMedia(TABLET_MQ).matches || hardwareSuggestsTablet()) return "tablet";
  return "desktop";
}

export function isPhoneFormFactor(f: ClientFormFactor = readClientFormFactor()): boolean {
  return f === "phone";
}

export function isCompactFormFactor(f: ClientFormFactor = readClientFormFactor()): boolean {
  return f === "phone" || f === "tablet";
}

/** Tulis `data-client` di <html> agar CSS/utilitas bisa menarget form factor. */
export function applyClientFormFactorAttr(factor: ClientFormFactor = readClientFormFactor()): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.client = factor;
}

export function subscribeClientFormFactor(onChange: (factor: ClientFormFactor) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const phoneMq = window.matchMedia(PHONE_MQ);
  const tabletMq = window.matchMedia(TABLET_MQ);
  const coarseMq = window.matchMedia("(pointer: coarse)");

  const emit = () => {
    const next = readClientFormFactor();
    applyClientFormFactorAttr(next);
    onChange(next);
  };

  emit();
  phoneMq.addEventListener("change", emit);
  tabletMq.addEventListener("change", emit);
  coarseMq.addEventListener("change", emit);
  window.addEventListener("orientationchange", emit);
  window.addEventListener("resize", emit);
  return () => {
    phoneMq.removeEventListener("change", emit);
    tabletMq.removeEventListener("change", emit);
    coarseMq.removeEventListener("change", emit);
    window.removeEventListener("orientationchange", emit);
    window.removeEventListener("resize", emit);
  };
}
