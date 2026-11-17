import { HttpError } from "./auth.js";
import { isKkScanConfigured, kkScanModel } from "./kk-scan.js";

export type KtpScanDto = {
  nik?: string;
  nama_lengkap: string;
  jenis_kelamin?: "L" | "P";
  tempat_lahir?: string;
  /** ISO YYYY-MM-DD */
  tanggal_lahir?: string;
  agama?: string;
  status_kawin?: string;
  pekerjaan?: string;
  alamat?: string;
};

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

const PROMPT = `Anda membaca foto Kartu Tanda Penduduk (KTP / e-KTP) Indonesia — SATU orang.
Tugas: ekstrak data pemilik KTP dari field berlabel di kartu.
ABAIKAN: watermark berulang "KARTU TANDA PENDUDUK" / "REPUBLIK INDONESIA", foto wajah, tanda tangan, hologram, jari yang memegang kartu, latar belakang di luar kartu.
Field penting: NIK (16 digit), Nama, Tempat/Tgl Lahir, Jenis kelamin, Agama, Status Perkawinan, Pekerjaan.
Alamat (Banjar/jalan, RT/RW, Kel/Desa, Kecamatan) opsional — gabungkan singkat jika terbaca.
jenis_kelamin hasil: "L" atau "P" saja (LAKI-LAKI→L, PEREMPUAN→P).
tanggal_lahir: YYYY-MM-DD bila bisa diurai dari format DD-MM-YYYY di KTP.
agama: teks dari KTP (Hindu, Islam, Kristen, …) — jangan ubah ke kode lain.
status_kawin: teks dari KTP (Kawin, Belum Kawin, Cerai Hidup, Cerai Mati, …).
Kosongkan string jika tidak yakin.
Balas HANYA JSON valid tanpa markdown:
{"nik":"","nama_lengkap":"","jenis_kelamin":"L","tempat_lahir":"","tanggal_lahir":"","agama":"","status_kawin":"","pekerjaan":"","alamat":""}`;

export function isKtpScanConfigured(): boolean {
  return isKkScanConfigured();
}

export function ktpScanModel(): string {
  return kkScanModel();
}

function stripDataUrl(imageBase64: string): { mime: string; data: string } {
  const m = imageBase64.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (m) {
    return { mime: m[1]!, data: m[2]!.replace(/\s/g, "") };
  }
  return { mime: "image/jpeg", data: imageBase64.replace(/\s/g, "") };
}

function approxBytesFromBase64(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}

function cleanStr(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

function parseJenisKelamin(raw: string): "L" | "P" | undefined {
  const s = raw.toLowerCase().replace(/[\s-]+/g, "");
  if (!s) return undefined;
  if (s.startsWith("l") || s.includes("laki")) return "L";
  if (s.startsWith("p") || s.includes("perempuan") || s.includes("wanita")) return "P";
  return undefined;
}

function normalizeTanggal(raw: string): string | undefined {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) return undefined;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += y >= 50 ? 1900 : 2000;
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return undefined;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function sanitizeNama(raw: string): string {
  return raw
    .replace(/\s+(desa(\s*\/\s*kelurahan)?|kelurahan|kecamatan|kabupaten|kota|provinsi|nik|alamat)\b.*$/i, "")
    .trim();
}

function normalizeAgama(raw: string): string | undefined {
  const t = cleanStr(raw);
  if (!t) return undefined;
  const upper = t.toUpperCase();
  if (upper === "HINDU") return "Hindu";
  if (upper === "ISLAM") return "Islam";
  if (upper === "KRISTEN" || upper === "PROTESTAN") return "Kristen";
  if (upper === "KATHOLIK" || upper === "KATOLIK") return "Katholik";
  if (upper === "BUDHA" || upper === "BUDDHA") return "Budha";
  if (upper === "KONGHUCU" || upper === "KONG HU CU") return "Konghucu";
  return t;
}

/** Normalisasi respons model → satu orang. */
export function normalizeKtpScan(raw: unknown): KtpScanDto | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // Beberapa model membungkus { person: {...} } atau { data: {...} }
  const src =
    o.person && typeof o.person === "object"
      ? (o.person as Record<string, unknown>)
      : o.data && typeof o.data === "object"
        ? (o.data as Record<string, unknown>)
        : o;

  const nama = sanitizeNama(cleanStr(src.nama_lengkap ?? src.nama));
  if (!nama || /^\d{10,}$/.test(nama.replace(/\D/g, ""))) return null;

  const nikDigits = cleanStr(src.nik).replace(/\D/g, "").slice(0, 16);
  const tempatTgl = cleanStr(src.tempat_tgl_lahir ?? src["tempat/tgl_lahir"]);
  let tempat = cleanStr(src.tempat_lahir);
  let tanggal = normalizeTanggal(cleanStr(src.tanggal_lahir));
  if ((!tempat || !tanggal) && tempatTgl) {
    const parts = tempatTgl.split(",");
    if (parts.length >= 2) {
      if (!tempat) tempat = parts.slice(0, -1).join(",").trim();
      if (!tanggal) tanggal = normalizeTanggal(parts[parts.length - 1]!.trim());
    }
  }

  return {
    nama_lengkap: nama,
    nik: nikDigits.length === 16 ? nikDigits : undefined,
    jenis_kelamin: parseJenisKelamin(cleanStr(src.jenis_kelamin)),
    tempat_lahir: tempat || undefined,
    tanggal_lahir: tanggal,
    agama: normalizeAgama(cleanStr(src.agama)),
    status_kawin: cleanStr(src.status_kawin ?? src.status_perkawinan) || undefined,
    pekerjaan: cleanStr(src.pekerjaan) || undefined,
    alamat: cleanStr(src.alamat) || undefined,
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new HttpError(502, "Respons Vision tidak berisi JSON.");
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
  promptFeedback?: { blockReason?: string };
};

/**
 * Baca satu KTP lewat Gemini Vision.
 * Membutuhkan env GEMINI_API_KEY (sama dengan scan KK).
 */
export async function scanKtpWithGemini(imageBase64: string): Promise<KtpScanDto> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(503, "Scan KTP cepat belum dikonfigurasi (GEMINI_API_KEY).");
  }

  const { mime, data } = stripDataUrl(imageBase64);
  if (!data) throw new HttpError(400, "Gambar kosong.");
  if (approxBytesFromBase64(data) > MAX_IMAGE_BYTES) {
    throw new HttpError(400, "Foto terlalu besar. Kompres atau potret ulang lebih dekat ke KTP.");
  }
  if (!mime.startsWith("image/")) {
    throw new HttpError(400, "Berkas harus berupa gambar.");
  }

  const model = ktpScanModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inlineData: { mimeType: mime, data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpError(504, "Scan KTP Vision timeout. Coba lagi atau gunakan foto lebih kecil.");
    }
    throw new HttpError(502, "Gagal menghubungi layanan Vision.");
  } finally {
    clearTimeout(timer);
  }

  const payload = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    const msg = payload.error?.message || `Vision HTTP ${res.status}`;
    throw new HttpError(502, msg.replace(/key=[^&\s]+/gi, "key=***"));
  }

  const block = payload.promptFeedback?.blockReason;
  if (block) {
    throw new HttpError(502, `Vision menolak gambar (block: ${block}). Coba foto lebih jelas.`);
  }

  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    const reason = candidate?.finishReason ?? "unknown";
    throw new HttpError(
      502,
      `Vision tidak mengembalikan teks (finish: ${reason}). Coba foto ulang KTP lebih dekat dan terang.`
    );
  }

  let parsed: unknown;
  try {
    parsed = extractJsonObject(text);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, "Respons Vision tidak dapat diurai.");
  }

  const person = normalizeKtpScan(parsed);
  if (!person) {
    throw new HttpError(
      502,
      "Vision tidak membaca data KTP. Pastikan NIK dan Nama terlihat jelas."
    );
  }
  return person;
}
