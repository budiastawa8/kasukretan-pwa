import { HttpError } from "./auth.js";

export type KkScanMemberDto = {
  nik?: string;
  nama_lengkap: string;
  jenis_kelamin?: "L" | "P";
  tempat_lahir?: string;
  tanggal_lahir?: string;
  agama?: string;
  status_kawin?: string;
  pekerjaan?: string;
  status_hubungan_kk?: string;
  nama_ayah?: string;
  nama_ibu?: string;
  selected: boolean;
};

const DEFAULT_MODEL = "gemini-2.0-flash";
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;

const PROMPT = `Anda membaca foto Kartu Keluarga (KK) Indonesia.
Tugas: ekstrak HANYA baris anggota dari TABEL anggota keluarga.
ABAIKAN header: No. KK, Nama Kepala Keluarga, Alamat, RT/RW, Desa/Kelurahan, Kecamatan, Kabupaten, Provinsi, Kode Pos.
Jangan gabungkan nama desa/kelurahan ke nama orang.
Urutan members = urutan baris tabel (baris pertama biasanya Kepala Keluarga).
Untuk setiap anggota isi field yang terbaca; kosongkan string jika tidak yakin.
jenis_kelamin: "L" atau "P" saja.
tanggal_lahir: YYYY-MM-DD bila bisa diurai, selain itu "".
status_kawin: teks dari KK (Kawin, Belum Kawin, Cerai Hidup, Cerai Mati, …).
status_hubungan_kk: Kepala Keluarga, Istri, Anak, dll.
selected: false hanya untuk Pembantu / Famili Lain yang tidak relevan; selain itu true.
Jangan buat anggota dari nomor KK di header.
Balas HANYA JSON valid tanpa markdown:
{"members":[{"nama_lengkap":"","nik":"","jenis_kelamin":"L","tempat_lahir":"","tanggal_lahir":"","agama":"","status_kawin":"","pekerjaan":"","status_hubungan_kk":"","nama_ayah":"","nama_ibu":"","selected":true}]}`;

export function isKkScanConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export function kkScanModel(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
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
    .replace(/\s+(desa(\s*\/\s*kelurahan)?|kelurahan|kecamatan|kabupaten|kota|provinsi|kode\s*pos|alamat|rt\s*\/?\s*rw)\b.*$/i, "")
    .replace(/\s*Desa\s*\/\s*Kelurahan\b.*$/i, "")
    .trim();
}

function defaultSelected(hubungan: string): boolean {
  const h = hubungan.toLowerCase();
  if (h.includes("pembantu") || h.includes("lainnya") || h.includes("famili lain")) return false;
  return true;
}

/** Normalisasi respons model → daftar anggota aman. */
export function normalizeKkScanMembers(raw: unknown): KkScanMemberDto[] {
  if (!raw || typeof raw !== "object") return [];
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { members?: unknown }).members)
      ? (raw as { members: unknown[] }).members
      : [];

  const out: KkScanMemberDto[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const nama = sanitizeNama(cleanStr(o.nama_lengkap ?? o.nama));
    if (!nama || /^\d{10,}$/.test(nama.replace(/\D/g, ""))) continue;
    if (/^nik\s*\d/i.test(nama)) continue;

    const nikDigits = cleanStr(o.nik).replace(/\D/g, "").slice(0, 16);
    const hubungan = cleanStr(o.status_hubungan_kk ?? o.hubungan);
    const selectedRaw = o.selected;
    const selected =
      typeof selectedRaw === "boolean" ? selectedRaw : defaultSelected(hubungan);

    out.push({
      nama_lengkap: nama,
      nik: nikDigits.length === 16 ? nikDigits : undefined,
      jenis_kelamin: parseJenisKelamin(cleanStr(o.jenis_kelamin)),
      tempat_lahir: cleanStr(o.tempat_lahir) || undefined,
      tanggal_lahir: normalizeTanggal(cleanStr(o.tanggal_lahir)) || undefined,
      agama: cleanStr(o.agama) || undefined,
      status_kawin: cleanStr(o.status_kawin) || undefined,
      pekerjaan: cleanStr(o.pekerjaan) || undefined,
      status_hubungan_kk: hubungan || undefined,
      nama_ayah: sanitizeNama(cleanStr(o.nama_ayah)) || undefined,
      nama_ibu: sanitizeNama(cleanStr(o.nama_ibu)) || undefined,
      selected,
    });
  }
  return out;
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
};

/**
 * Baca tabel anggota KK lewat Gemini Vision.
 * Membutuhkan env GEMINI_API_KEY.
 */
export async function scanKkWithGemini(imageBase64: string): Promise<KkScanMemberDto[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new HttpError(503, "Scan KK cepat belum dikonfigurasi (GEMINI_API_KEY).");
  }

  const { mime, data } = stripDataUrl(imageBase64);
  if (!data) throw new HttpError(400, "Gambar kosong.");
  if (approxBytesFromBase64(data) > MAX_IMAGE_BYTES) {
    throw new HttpError(400, "Foto terlalu besar. Kompres atau potret ulang lebih dekat ke tabel.");
  }
  if (!mime.startsWith("image/")) {
    throw new HttpError(400, "Berkas harus berupa gambar.");
  }

  const model = kkScanModel();
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
              { inline_data: { mime_type: mime, data } },
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
      throw new HttpError(504, "Scan KK Vision timeout. Coba lagi atau gunakan foto lebih kecil.");
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

  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new HttpError(502, "Vision tidak mengembalikan teks. Coba foto ulang tabel anggota.");
  }

  let parsed: unknown;
  try {
    parsed = extractJsonObject(text);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, "Respons Vision tidak dapat diurai.");
  }

  return normalizeKkScanMembers(parsed);
}
