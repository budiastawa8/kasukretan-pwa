import { API_BASE } from "../api/client";
import { getLanToken, isLanClientMode } from "../lan-client";
import { normalizeStatusKawinKode } from "../status-kawin";
import { recognizeKkImage, type KkOcrProgress } from "./ocr";
import { looksLikeKartuKeluarga, parseKkOcrText, sanitizePersonName } from "./parse-kk";
import { prepareKkImageForUpload } from "./prepare-image";
import type { KkOcrMember } from "./types";

export type KkScanEngine = "gemini" | "tesseract";

export type KkScanPipelineResult = {
  members: KkOcrMember[];
  engine: KkScanEngine;
  /** Pesan singkat untuk UI (opsional). */
  note?: string;
};

export type KkScanPipelineProgress = {
  message: string;
  /** 0–100 */
  percent: number;
};

type ApiMember = {
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
  selected?: boolean;
};

function mapApiMembers(list: ApiMember[]): KkOcrMember[] {
  const out: KkOcrMember[] = [];
  for (const m of list) {
    const nama = sanitizePersonName(m.nama_lengkap ?? "");
    if (!nama) continue;
    out.push({
      nama_lengkap: nama,
      nik: m.nik,
      jenis_kelamin: m.jenis_kelamin,
      tempat_lahir: m.tempat_lahir,
      tanggal_lahir: m.tanggal_lahir,
      agama: m.agama,
      status_kawin: normalizeStatusKawinKode(m.status_kawin) ?? m.status_kawin,
      pekerjaan: m.pekerjaan,
      status_hubungan_kk: m.status_hubungan_kk,
      nama_ayah: m.nama_ayah ? sanitizePersonName(m.nama_ayah) : undefined,
      nama_ibu: m.nama_ibu ? sanitizePersonName(m.nama_ibu) : undefined,
      selected: m.selected !== false,
    });
  }
  return out;
}

async function tryGeminiScan(
  imageDataUrl: string,
  onProgress?: (p: KkScanPipelineProgress) => void
): Promise<KkOcrMember[] | null> {
  if (!isLanClientMode()) return null;
  const token = getLanToken();
  if (!token) return null;

  onProgress?.({ percent: 15, message: "Mengirim foto ke scan cepat…" });
  const res = await fetch(`${API_BASE}/kk-scan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ imageBase64: imageDataUrl }),
  });

  if (res.status === 503) return null;
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail || "Scan cepat gagal.");
  }

  onProgress?.({ percent: 85, message: "Menyusun daftar anggota…" });
  const data = (await res.json()) as { members?: ApiMember[] };
  return mapApiMembers(Array.isArray(data.members) ? data.members : []);
}

async function tesseractScan(
  file: Blob,
  onProgress?: (p: KkScanPipelineProgress) => void
): Promise<KkOcrMember[]> {
  const text = await recognizeKkImage(file, (p: KkOcrProgress) => {
    onProgress?.({
      percent: Math.round(p.progress * 100),
      message: p.message,
    });
  });
  const parsed = parseKkOcrText(text);
  if (parsed.length === 0) {
    throw new Error(
      looksLikeKartuKeluarga(text)
        ? "Anggota KK tidak terbaca dengan jelas. Foto ulang bagian tabel anggota (bukan hanya nomor KK di header), cahaya cukup, dan tulisan tidak buram."
        : "Foto tidak tampak seperti Kartu Keluarga. Gunakan foto KK (bukan KTP), pastikan judul «Kartu Keluarga» atau daftar anggota terlihat."
    );
  }
  return parsed;
}

/**
 * Scan KK: coba Vision (Gemini) bila API + kunci tersedia, lalu fallback Tesseract di HP.
 */
export async function scanKartuKeluarga(
  file: Blob,
  onProgress?: (p: KkScanPipelineProgress) => void
): Promise<KkScanPipelineResult> {
  onProgress?.({ percent: 5, message: "Menyiapkan foto…" });
  const prepared = await prepareKkImageForUpload(file);

  try {
    const visionMembers = await tryGeminiScan(prepared, onProgress);
    if (visionMembers && visionMembers.length > 0) {
      onProgress?.({ percent: 100, message: "Selesai (scan cepat)." });
      return {
        members: visionMembers,
        engine: "gemini",
        note: "Dibaca dengan scan cepat (Vision).",
      };
    }
    if (visionMembers && visionMembers.length === 0) {
      // Vision menjawab kosong — coba OCR lokal
      onProgress?.({ percent: 20, message: "Scan cepat kosong; mencoba OCR di HP…" });
    } else {
      onProgress?.({ percent: 20, message: "Scan cepat tidak tersedia; OCR di HP…" });
    }
  } catch (err) {
    // Jaringan/API gagal → fallback, kecuali pesan validasi foto
    const msg = err instanceof Error ? err.message : String(err);
    if (/foto terlalu besar|berkas harus|gambar kosong/i.test(msg)) throw err;
    onProgress?.({ percent: 20, message: "Scan cepat gagal; OCR di HP…" });
  }

  const members = await tesseractScan(file, onProgress);
  onProgress?.({ percent: 100, message: "Selesai (OCR di HP)." });
  return {
    members,
    engine: "tesseract",
    note: "Dibaca dengan OCR di HP (lebih lambat).",
  };
}
