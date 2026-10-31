/**
 * Pengirim WhatsApp lewat Fonnte (https://api.fonnte.com/send).
 * Token dari env FONNTE_TOKEN — jangan di-expose ke browser.
 */

const FONNTE_SEND_URL = "https://api.fonnte.com/send";

export function isFonnteConfigured(): boolean {
  return Boolean(process.env.FONNTE_TOKEN?.trim());
}

export type FonnteSendResult = {
  ok: true;
  target: string;
  detail?: string;
};

export type FonnteSendError = {
  ok: false;
  error: string;
};

/** Normalisasi nomor ke digit internasional Indonesia (62…). */
export function normalizeFonnteTarget(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("62") && digits.length >= 10) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `62${digits.slice(1)}`;
  if (digits.length >= 9 && digits.length <= 15) return digits;
  return null;
}

/**
 * Kirim satu pesan teks ke satu nomor.
 * Authorization: token mentah (bukan Bearer) sesuai dokumen Fonnte.
 */
export async function sendFonnteText(params: {
  target: string;
  message: string;
}): Promise<FonnteSendResult> {
  const token = process.env.FONNTE_TOKEN?.trim();
  if (!token) {
    throw new Error("FONNTE_TOKEN belum diisi di environment server.");
  }
  const target = normalizeFonnteTarget(params.target);
  if (!target) throw new Error("Nomor WhatsApp petugas tidak valid.");
  const message = params.message.trim();
  if (!message) throw new Error("Pesan kosong.");

  const body = new URLSearchParams();
  body.set("target", target);
  body.set("message", message);
  body.set("countryCode", "62");
  body.set("typing", "false");

  const res = await fetch(FONNTE_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: token,
    },
    body,
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`Fonnte merespons tidak valid (HTTP ${res.status}).`);
  }

  const status = data.status === true || data.Status === true;
  if (!res.ok || !status) {
    const reason =
      (typeof data.reason === "string" && data.reason) ||
      (typeof data.detail === "string" && data.detail) ||
      `Gagal kirim WhatsApp (HTTP ${res.status})`;
    throw new Error(reason);
  }

  return {
    ok: true,
    target,
    detail: typeof data.detail === "string" ? data.detail : undefined,
  };
}
