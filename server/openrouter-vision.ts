import { HttpError } from "./auth.js";

/** Model Vision default di OpenRouter — bisa diganti lewat OPENROUTER_MODEL. */
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 55_000;

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

export function openRouterVisionModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

export function stripDataUrl(imageBase64: string): { mime: string; data: string } {
  const m = imageBase64.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (m) {
    return { mime: m[1]!, data: m[2]!.replace(/\s/g, "") };
  }
  return { mime: "image/jpeg", data: imageBase64.replace(/\s/g, "") };
}

export function approxBytesFromBase64(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

type OpenRouterResponse = {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> };
    finish_reason?: string;
  }>;
  error?: { message?: string; code?: number | string };
};

function contentToText(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
}

/**
 * Kirim prompt + gambar ke OpenRouter (chat completions, vision).
 * Mengembalikan teks respons model (diharapkan JSON).
 */
export async function openRouterVisionText(opts: {
  prompt: string;
  mime: string;
  data: string;
  /** Label untuk pesan timeout, mis. "Scan KK" / "Scan KTP". */
  label: string;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(503, `Scan ${opts.label} cepat belum dikonfigurasi (OPENROUTER_API_KEY).`);
  }

  const model = openRouterVisionModel();
  const dataUrl = `data:${opts.mime};base64,${opts.data}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://kasukretan.local",
        "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "Kasukretan PWA",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: opts.prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpError(
        504,
        `${opts.label} Vision timeout. Coba lagi atau gunakan foto lebih kecil.`
      );
    }
    throw new HttpError(502, "Gagal menghubungi layanan Vision (OpenRouter).");
  } finally {
    clearTimeout(timer);
  }

  const payload = (await res.json()) as OpenRouterResponse;
  if (!res.ok) {
    const msg = payload.error?.message || `Vision HTTP ${res.status}`;
    throw new HttpError(502, msg.replace(/Bearer\s+\S+/gi, "Bearer ***").replace(/sk-or-\S+/gi, "sk-or-***"));
  }

  const choice = payload.choices?.[0];
  const text = contentToText(choice?.message?.content);
  if (!text.trim()) {
    const reason = choice?.finish_reason ?? "unknown";
    throw new HttpError(
      502,
      `Vision tidak mengembalikan teks (finish: ${reason}). Coba foto ulang lebih dekat dan terang.`
    );
  }
  return text;
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new HttpError(502, "Respons Vision tidak berisi JSON.");
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}
