import { API_BASE } from "../api/client";
import { getLanToken } from "../lan-client";
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
  /** Detail bila Vision gagal lalu OCR berhasil / dipakai. */
  visionWarning?: string;
};

export type KkScanPipelineProgress = {
  message: string;
  /** 0–100 */
  percent: number;
};

export type KkScanStatus = {
  configured: boolean;
  engine: "gemini" | null;
  model?: string | null;
  reachable: boolean;
  detail?: string;
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

class VisionScanError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "auth" | "empty" | "api" | "network"
  ) {
    super(message);
    this.name = "VisionScanError";
  }
}

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

/** Cek apakah server mengaktifkan scan cepat (Gemini). */
export async function fetchKkScanStatus(): Promise<KkScanStatus> {
  const token = getLanToken();
  if (!token) {
    return {
      configured: false,
      engine: null,
      reachable: false,
      detail: "Belum login ke API cloud.",
    };
  }
  try {
    const res = await fetch(`${API_BASE}/kk-scan/status`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401) {
      return {
        configured: false,
        engine: null,
        reachable: true,
        detail: "Sesi berakhir. Masuk ulang.",
      };
    }
    if (!res.ok) {
      return {
        configured: false,
        engine: null,
        reachable: true,
        detail: `Status scan: HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      configured?: boolean;
      engine?: "gemini" | null;
      model?: string | null;
    };
    return {
      configured: Boolean(data.configured),
      engine: data.configured ? "gemini" : null,
      model: data.model ?? null,
      reachable: true,
      detail: data.configured
        ? `Scan cepat aktif${data.model ? ` (${data.model})` : ""}.`
        : "GEMINI_API_KEY belum diset di server — memakai OCR di HP.",
    };
  } catch {
    return {
      configured: false,
      engine: null,
      reachable: false,
      detail: "Tidak dapat menghubungi API (cek jaringan).",
    };
  }
}

async function tryGeminiScan(
  imageDataUrl: string,
  onProgress?: (p: KkScanPipelineProgress) => void
): Promise<KkOcrMember[]> {
  const token = getLanToken();
  if (!token) {
    throw new VisionScanError("Belum login ke API cloud.", "auth");
  }

  onProgress?.({ percent: 15, message: "Mengirim foto ke scan cepat (Vision)…" });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/kk-scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ imageBase64: imageDataUrl }),
    });
  } catch {
    throw new VisionScanError("Tidak dapat menghubungi server Vision.", "network");
  }

  if (res.status === 503) {
    let detail = "Scan cepat belum dikonfigurasi (GEMINI_API_KEY).";
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new VisionScanError(detail, "not_configured");
  }

  if (res.status === 401) {
    throw new VisionScanError("Sesi berakhir. Masuk ulang lalu coba scan lagi.", "auth");
  }

  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new VisionScanError(detail, "api");
  }

  onProgress?.({ percent: 85, message: "Menyusun daftar anggota dari Vision…" });
  const data = (await res.json()) as { members?: ApiMember[] };
  const members = mapApiMembers(Array.isArray(data.members) ? data.members : []);
  if (members.length === 0) {
    throw new VisionScanError(
      "Vision tidak menemukan anggota di tabel KK. Foto ulang lebih dekat ke tabel anggota.",
      "empty"
    );
  }
  return members;
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
        ? "OCR di HP tidak membaca anggota dengan jelas. Foto ulang bagian tabel anggota, cahaya cukup, tulisan tidak buram."
        : "Foto tidak tampak seperti Kartu Keluarga. Gunakan foto KK (bukan KTP)."
    );
  }
  return parsed;
}

export type ScanKartuKeluargaOptions = {
  /** Paksa OCR di HP (setelah Vision gagal / pilihan pengguna). */
  forceTesseract?: boolean;
  /** true = jangan fallback diam-diam; lempar error Vision ke UI. Default true bila status configured. */
  preferVisionOnly?: boolean;
};

/**
 * Scan KK: Vision (Gemini) bila memungkinkan; OCR di HP sebagai cadangan eksplisit.
 */
export async function scanKartuKeluarga(
  file: Blob,
  onProgress?: (p: KkScanPipelineProgress) => void,
  opts?: ScanKartuKeluargaOptions
): Promise<KkScanPipelineResult> {
  onProgress?.({ percent: 5, message: "Menyiapkan foto…" });

  if (opts?.forceTesseract) {
    onProgress?.({ percent: 10, message: "OCR di HP…" });
    const members = await tesseractScan(file, onProgress);
    onProgress?.({ percent: 100, message: "Selesai (OCR di HP)." });
    return {
      members,
      engine: "tesseract",
      note: "Dibaca dengan OCR di HP.",
    };
  }

  const prepared = await prepareKkImageForUpload(file);
  const status = await fetchKkScanStatus();
  const visionOnly = opts?.preferVisionOnly ?? status.configured;

  if (!status.configured && !getLanToken()) {
    onProgress?.({ percent: 15, message: "OCR di HP (scan cepat tidak tersedia)…" });
    const members = await tesseractScan(file, onProgress);
    return {
      members,
      engine: "tesseract",
      note: "Dibaca dengan OCR di HP — login cloud / GEMINI_API_KEY belum siap.",
      visionWarning: status.detail,
    };
  }

  if (!status.configured) {
    onProgress?.({ percent: 15, message: "OCR di HP (GEMINI_API_KEY belum diset)…" });
    const members = await tesseractScan(file, onProgress);
    return {
      members,
      engine: "tesseract",
      note: "Dibaca dengan OCR di HP.",
      visionWarning: status.detail,
    };
  }

  try {
    const visionMembers = await tryGeminiScan(prepared, onProgress);
    onProgress?.({ percent: 100, message: "Selesai (scan cepat)." });
    return {
      members: visionMembers,
      engine: "gemini",
      note: "Dibaca dengan scan cepat (Vision).",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/foto terlalu besar|berkas harus|gambar kosong/i.test(msg)) throw err;

    if (visionOnly) {
      // Jangan fallback diam-diam — UI menampilkan error + tombol "Coba OCR di HP"
      throw err instanceof VisionScanError
        ? err
        : new VisionScanError(msg, "api");
    }

    onProgress?.({
      percent: 25,
      message: `Vision gagal (${msg.slice(0, 80)}); OCR di HP…`,
    });
    const members = await tesseractScan(file, onProgress);
    return {
      members,
      engine: "tesseract",
      note: "Dibaca dengan OCR di HP (cadangan).",
      visionWarning: msg,
    };
  }
}

export function isVisionScanError(err: unknown): err is VisionScanError {
  return err instanceof VisionScanError;
}
