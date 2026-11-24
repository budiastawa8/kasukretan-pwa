import { API_BASE } from "../api/client";
import { getLanToken } from "../lan-client";
import { recognizeKkImage, type KkOcrProgress } from "../kk-scan/ocr";
import { prepareKkImageForUpload } from "../kk-scan/prepare-image";
import { normalizeStatusKawinKode } from "../status-kawin";
import { looksLikeKtp, parseKtpOcrText } from "./parse-ktp";
import type { KtpOcrPerson } from "./types";

export type KtpScanEngine = "openrouter" | "tesseract";

export type KtpScanPipelineResult = {
  person: KtpOcrPerson;
  engine: KtpScanEngine;
  note?: string;
  visionWarning?: string;
};

export type KtpScanPipelineProgress = {
  message: string;
  percent: number;
};

export type KtpScanStatus = {
  configured: boolean;
  engine: "openrouter" | null;
  model?: string | null;
  reachable: boolean;
  detail?: string;
};

type ApiPerson = {
  nik?: string;
  nama_lengkap: string;
  jenis_kelamin?: "L" | "P";
  tempat_lahir?: string;
  tanggal_lahir?: string;
  agama?: string;
  status_kawin?: string;
  pekerjaan?: string;
  alamat?: string;
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

function mapApiPerson(p: ApiPerson): KtpOcrPerson | null {
  const nama = (p.nama_lengkap ?? "").replace(/\s+/g, " ").trim();
  if (!nama) return null;
  return {
    nama_lengkap: nama,
    nik: p.nik,
    jenis_kelamin: p.jenis_kelamin,
    tempat_lahir: p.tempat_lahir,
    tanggal_lahir: p.tanggal_lahir,
    agama: p.agama,
    status_kawin: normalizeStatusKawinKode(p.status_kawin) ?? p.status_kawin,
    pekerjaan: p.pekerjaan,
    alamat: p.alamat,
  };
}

/** Status scan cepat memakai endpoint yang sama dengan KK (OPENROUTER_API_KEY). */
export async function fetchKtpScanStatus(): Promise<KtpScanStatus> {
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
    const res = await fetch(`${API_BASE}/ktp-scan/status`, {
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
      engine?: "openrouter" | null;
      model?: string | null;
    };
    return {
      configured: Boolean(data.configured),
      engine: data.configured ? "openrouter" : null,
      model: data.model ?? null,
      reachable: true,
      detail: data.configured
        ? `Scan cepat aktif${data.model ? ` (${data.model})` : ""}.`
        : "OPENROUTER_API_KEY belum diset di server — memakai OCR di HP.",
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

async function tryOpenRouterScan(
  imageDataUrl: string,
  onProgress?: (p: KtpScanPipelineProgress) => void
): Promise<KtpOcrPerson> {
  const token = getLanToken();
  if (!token) {
    throw new VisionScanError("Belum login ke API cloud.", "auth");
  }

  onProgress?.({ percent: 15, message: "Mengirim foto ke scan cepat (Vision)…" });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/ktp-scan`, {
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
    let detail = "Scan cepat belum dikonfigurasi (OPENROUTER_API_KEY).";
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

  onProgress?.({ percent: 85, message: "Menyusun data dari Vision…" });
  const data = (await res.json()) as { person?: ApiPerson };
  const person = data.person ? mapApiPerson(data.person) : null;
  if (!person) {
    throw new VisionScanError(
      "Vision tidak membaca data KTP. Foto ulang lebih dekat, cahaya cukup, NIK dan Nama terlihat.",
      "empty"
    );
  }
  return person;
}

async function tesseractScan(
  file: Blob,
  onProgress?: (p: KtpScanPipelineProgress) => void
): Promise<KtpOcrPerson> {
  const text = await recognizeKkImage(file, (p: KkOcrProgress) => {
    onProgress?.({
      percent: Math.round(p.progress * 100),
      message: p.message.replace(/\bKK\b/g, "KTP"),
    });
  });
  const parsed = parseKtpOcrText(text);
  if (!parsed) {
    throw new Error(
      looksLikeKtp(text)
        ? "OCR di HP tidak membaca KTP dengan jelas. Foto ulang, cahaya cukup, hindari kilap."
        : "Foto tidak tampak seperti KTP. Gunakan foto Kartu Tanda Penduduk (bukan KK)."
    );
  }
  return parsed;
}

export type ScanKtpOptions = {
  forceTesseract?: boolean;
  preferVisionOnly?: boolean;
};

/**
 * Scan KTP: Vision (OpenRouter) bila memungkinkan; OCR di HP sebagai cadangan.
 */
export async function scanKartuTandaPenduduk(
  file: Blob,
  onProgress?: (p: KtpScanPipelineProgress) => void,
  opts?: ScanKtpOptions
): Promise<KtpScanPipelineResult> {
  onProgress?.({ percent: 5, message: "Menyiapkan foto…" });

  if (opts?.forceTesseract) {
    onProgress?.({ percent: 10, message: "OCR di HP…" });
    const person = await tesseractScan(file, onProgress);
    onProgress?.({ percent: 100, message: "Selesai (OCR di HP)." });
    return {
      person,
      engine: "tesseract",
      note: "Dibaca dengan OCR di HP.",
    };
  }

  const prepared = await prepareKkImageForUpload(file, "ktp");
  const status = await fetchKtpScanStatus();
  const visionOnly = opts?.preferVisionOnly ?? status.configured;

  if (!status.configured) {
    onProgress?.({ percent: 15, message: "OCR di HP…" });
    const person = await tesseractScan(file, onProgress);
    return {
      person,
      engine: "tesseract",
      note: "Dibaca dengan OCR di HP.",
      visionWarning: status.detail,
    };
  }

  try {
    const person = await tryOpenRouterScan(prepared, onProgress);
    onProgress?.({ percent: 100, message: "Selesai (scan cepat)." });
    return {
      person,
      engine: "openrouter",
      note: "Dibaca dengan scan cepat (Vision).",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/foto terlalu besar|berkas harus|gambar kosong/i.test(msg)) throw err;

    if (visionOnly) {
      throw err instanceof VisionScanError ? err : new VisionScanError(msg, "api");
    }

    onProgress?.({
      percent: 25,
      message: `Vision gagal (${msg.slice(0, 80)}); OCR di HP…`,
    });
    const person = await tesseractScan(file, onProgress);
    return {
      person,
      engine: "tesseract",
      note: "Dibaca dengan OCR di HP (cadangan).",
      visionWarning: msg,
    };
  }
}

export function isKtpVisionScanError(err: unknown): err is VisionScanError {
  return err instanceof VisionScanError;
}
