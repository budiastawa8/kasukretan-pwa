import { openUrl } from "./desktop/opener";
import { buildDudukanWhatsAppMessageFromTemplate } from "./whatsapp-template";
import type { DudukanTunggakanBulan } from "./services/dudukan";
import { isDesktopApp } from "./runtime";

export {
  getDudukanTunggakanTemplate,
  getDudukanUmumTemplate,
  saveDudukanTunggakanTemplate,
  saveDudukanUmumTemplate,
  resetDudukanWhatsAppTemplates,
  getPaturunanTunggakanTemplate,
  getPaturunanUmumTemplate,
  savePaturunanTunggakanTemplate,
  savePaturunanUmumTemplate,
  resetPaturunanWhatsAppTemplates,
  resetMipilWhatsAppTemplates,
  resetAllWhatsAppTemplates,
  getMipilUmumTemplate,
  saveMipilUmumTemplate,
  getSetoranTelatTemplate,
  saveSetoranTelatTemplate,
  resetSetoranTelatWhatsAppTemplate,
  applyWhatsAppTemplate,
  buildDudukanWhatsAppMessageFromTemplate,
  buildPaturunanWhatsAppMessageFromTemplate,
  buildMipilWhatsAppMessageFromTemplate,
  buildSetoranTelatWhatsAppMessageFromTemplate,
  DEFAULT_DUDUKAN_TUNGGAKAN_TEMPLATE,
  DEFAULT_DUDUKAN_UMUM_TEMPLATE,
  DEFAULT_PATURUNAN_TUNGGAKAN_TEMPLATE,
  DEFAULT_PATURUNAN_UMUM_TEMPLATE,
  DEFAULT_MIPIL_UMUM_TEMPLATE,
  DEFAULT_SETORAN_TELAT_TEMPLATE,
  WHATSAPP_TEMPLATE_PLACEHOLDERS,
  PATURUNAN_WHATSAPP_TEMPLATE_PLACEHOLDERS,
  MIPIL_WHATSAPP_TEMPLATE_PLACEHOLDERS,
  SETORAN_TELAT_WHATSAPP_TEMPLATE_PLACEHOLDERS,
} from "./whatsapp-template";

/** Normalisasi nomor ke format internasional untuk WhatsApp (Indonesia: 62...). */
export function normalizeWhatsAppPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.length >= 9 && digits.length <= 15) return digits;
  return null;
}

/** URL kirim — web.whatsapp.com lebih cocok untuk pengguna WhatsApp Web. */
export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone);
  if (!normalized) return null;
  const text = encodeURIComponent(message);
  return `https://web.whatsapp.com/send?phone=${normalized}&text=${text}`;
}

export function hasWhatsAppContact(nomorKontak?: string | null): boolean {
  if (!nomorKontak?.trim()) return false;
  return normalizeWhatsAppPhone(nomorKontak) != null;
}

/** @deprecated Gunakan buildDudukanWhatsAppMessageFromTemplate */
export function buildDudukanTunggakanMessage(params: {
  nama: string;
  tunggakanBulan: number;
  totalSisa: number;
  bulanTunggakan?: DudukanTunggakanBulan[];
}): string {
  return buildDudukanWhatsAppMessageFromTemplate(params);
}

const WA_WINDOW_NAME = "kasukretan_whatsapp";
let waPopup: Window | null = null;

export async function copyWhatsAppMessage(message: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch {
    return false;
  }
}

export async function openWhatsAppChat(phone: string, message: string): Promise<boolean> {
  const url = buildWhatsAppUrl(phone, message);
  if (!url) return false;

  if (isDesktopApp()) {
    // Desktop membuka browser sistem — tab baru tidak bisa dihindari (batasan browser).
    await openUrl(url);
  } else {
    waPopup = window.open(url, WA_WINDOW_NAME) ?? waPopup;
    if (waPopup) {
      try {
        waPopup.location.href = url;
        waPopup.focus();
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
  return true;
}
