import { normalizeStatusKawinKode } from "../status-kawin";
import type { KtpOcrPerson } from "./types";

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeAgama(raw: string): string | undefined {
  const t = clean(raw);
  if (!t) return undefined;
  const upper = t.toUpperCase();
  if (upper === "HINDU") return "Hindu";
  if (upper === "ISLAM") return "Islam";
  if (upper === "KRISTEN" || upper === "PROTESTAN") return "Kristen";
  if (upper === "KATHOLIK" || upper === "KATOLIK") return "Katholik";
  if (upper === "BUDHA" || upper === "BUDDHA") return "Budha";
  if (upper === "KONGHUCU" || upper.includes("KONG")) return "Konghucu";
  return t;
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

function fieldAfterLabel(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:：]?\\s*([^\\n]+)`,
      "i"
    );
    const m = text.match(re);
    if (m?.[1]) {
      const v = clean(m[1]);
      if (v && v !== "-" && !/^gol\.?\s*darah/i.test(v)) return v;
    }
  }
  return undefined;
}

/** Deteksi kasar: teks tampak e-KTP (bukan KK). */
export function looksLikeKtp(text: string): boolean {
  const t = text.toUpperCase();
  const digitsOnly = t.replace(/\s/g, "");
  const hasNik = /\bNIK\b/.test(t) && /\d{16}/.test(digitsOnly);
  const hasHeader =
    /PROVINSI/.test(t) ||
    /KABUPATEN|KOTA\s+ADM|KOTA\b/.test(t) ||
    /KARTU\s*TANDA\s*PENDUDUK/.test(t);
  /** KK punya "No. KK" + kolom status hubungan — jangan anggap KTP. */
  const looksLikeKk = /NO\.?\s*KK\b/.test(t) && /STATUS\s+HUBUNGAN/.test(t);
  return hasNik && (hasHeader || /NAMA\b/.test(t)) && !looksLikeKk;
}

/**
 * Urai teks OCR KTP menjadi satu orang.
 * Dirancang untuk foto miring/kilap seperti yang sering diambil di lapangan.
 */
export function parseKtpOcrText(text: string): KtpOcrPerson | null {
  const normalized = text.replace(/\r/g, "\n");
  const flat = normalized.replace(/\n+/g, "\n");

  const nikMatch =
    flat.match(/\bNIK\b\s*[:：]?\s*(\d[\d\s]{14,22}\d)/i) ||
    flat.match(/\b(51\d{14})\b/) ||
    flat.match(/\b(\d{16})\b/);
  const nik = nikMatch?.[1]?.replace(/\D/g, "").slice(0, 16);
  if (nik && nik.length !== 16) {
    /* lanjut; NIK opsional jika nama jelas */
  }

  let nama = fieldAfterLabel(flat, ["Nama", "Nama Lengkap"]);
  if (nama) {
    nama = nama
      .replace(/\b(Tempat|Tgl|Jenis|Gol\.?|Alamat|NIK)\b.*$/i, "")
      .trim();
  }

  const tempatTglRaw = fieldAfterLabel(flat, [
    "Tempat/Tgl Lahir",
    "Tempat / Tgl Lahir",
    "Tempat/Tgl\\. Lahir",
    "Tempat, Tgl Lahir",
  ]);
  let tempat_lahir: string | undefined;
  let tanggal_lahir: string | undefined;
  if (tempatTglRaw) {
    const parts = tempatTglRaw.split(",");
    if (parts.length >= 2) {
      tempat_lahir = clean(parts.slice(0, -1).join(","));
      tanggal_lahir = normalizeTanggal(clean(parts[parts.length - 1]!));
    } else {
      const dm = tempatTglRaw.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);
      if (dm) {
        tanggal_lahir = normalizeTanggal(dm[1]!);
        tempat_lahir = clean(tempatTglRaw.replace(dm[1]!, "")).replace(/,\s*$/, "");
      } else {
        tempat_lahir = tempatTglRaw;
      }
    }
  }

  const jkRaw = fieldAfterLabel(flat, ["Jenis kelamin", "Jenis Kelamin"]);
  const agama = normalizeAgama(fieldAfterLabel(flat, ["Agama"]) ?? "");
  const statusRaw = fieldAfterLabel(flat, ["Status Perkawinan", "Status perkawinan"]);
  const pekerjaan = fieldAfterLabel(flat, ["Pekerjaan"])?.replace(
    /\b(Kewarganegaraan|Berlaku|WNI|WNA)\b.*$/i,
    ""
  );

  if (!nama && !nik) return null;
  if (!nama) return null;

  return {
    nama_lengkap: nama,
    nik: nik && nik.length === 16 ? nik : undefined,
    jenis_kelamin: jkRaw ? parseJenisKelamin(jkRaw) : undefined,
    tempat_lahir: tempat_lahir || undefined,
    tanggal_lahir,
    agama,
    status_kawin: normalizeStatusKawinKode(statusRaw) ?? statusRaw,
    pekerjaan: pekerjaan ? clean(pekerjaan) : undefined,
  };
}
