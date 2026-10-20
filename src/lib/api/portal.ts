import { API_BASE, apiFetch } from "./client";
import { fetchWithRetry } from "../fetch-retry";

const TOKEN_KEY = "kasukretan_portal_token";
const USER_KEY = "kasukretan_portal_user";

export type PortalSessionUser = {
  kramaId: string;
  nomorKartu: string;
  kepalaNama: string;
  klasifikasiKode: string;
};

export function getPortalToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getPortalUser(): PortalSessionUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as PortalSessionUser) : null;
}

export function clearPortalSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function savePortalSession(token: string, user: PortalSessionUser): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function portalAuthFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getPortalToken();
  if (!token) throw new Error("Belum login portal");
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("Server cloud sedang menyala — tunggu sebentar lalu coba lagi.");
  }
  if (res.status === 401) {
    clearPortalSession();
    throw new Error("Sesi habis — login ulang");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = (await res.json()) as { error?: string };
      if (err.error) detail = err.error;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function portalLogin(nomorKartu: string, pin: string): Promise<PortalSessionUser> {
  const res = await apiFetch<{ ok: boolean; token: string; user: PortalSessionUser }>(
    "/portal/login",
    {
      method: "POST",
      body: JSON.stringify({ nomor_kartu: nomorKartu, pin }),
    }
  );
  savePortalSession(res.token, res.user);
  return res.user;
}

export type PortalProfil = {
  krama_id: string;
  nomor_kartu: string;
  kepala_nama: string;
  klasifikasi_kode: string;
  klasifikasi_nama: string;
  banjar_nama: string;
  jenis_nama: string | null;
};

export type PortalPaturunanData = {
  iuran: {
    iuran_id: string;
    iuran_nama: string;
    tagihan: number;
    dibayar_wajib: number;
    punia: number;
    sisa: number;
    status: string;
  }[];
  riwayat: {
    id: string;
    iuran_nama: string;
    jenis: string;
    jumlah: number;
    tanggal: string;
  }[];
};

export type PortalDudukanData = {
  tarif_bulanan: number;
  bulan: {
    tahun: number;
    bulan: number;
    label: string;
    tagihan: number;
    dibayar: number;
    keringanan: number;
    sisa: number;
    status: string;
  }[];
  riwayat: {
    id: string;
    tahun: number;
    bulan: number;
    label: string;
    jumlah: number;
    tanggal: string;
  }[];
};

export type PortalKartuAnggota = {
  anggota_id: string;
  penduduk_id: string;
  status_keluarga: string;
  nika: string | null;
  nrkt: string | null;
  nrt: string | null;
  tanggal_pencatatan: string | null;
  masuk_pada: string | null;
  nama_lengkap: string;
  jenis_kelamin: string;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  status_kawin: string | null;
  pekerjaan: string | null;
  nama_ibu: string | null;
  nama_ayah: string | null;
  agama: string | null;
  nik_kependudukan: string | null;
  nik_atau_nika: string | null;
  foto_url: string | null;
};

export type PortalKartuData = {
  kind: "mipil" | "krama_tamiu" | "tamiu";
  title: string;
  desa: {
    nama_desa_adat: string;
    nama_kecamatan: string | null;
    nama_kabupaten: string | null;
    logo_url: string | null;
    logo_mda_url: string | null;
    bandesa_nama: string | null;
    bandesa_jabatan: string | null;
    bandesa_ttd_url: string | null;
    enforce_masa_berlaku_pipil: number;
  } | null;
  krama: {
    id: string;
    nomor_kartu: string;
    klasifikasi_kode: string;
    klasifikasi_nama: string;
    jenis_nama: string | null;
    alamat: string | null;
    keterangan: string | null;
    tempek_nama: string | null;
    arahan_nama: string | null;
    banjar_nama: string;
    asal_desa_adat: string | null;
    asal_kecamatan: string | null;
    asal_kabupaten: string | null;
    asal_provinsi: string | null;
    tanggal_terdaftar: string;
    masa_berlaku_tahun: number | null;
    tanggal_berlaku_mulai_pemasih: string | null;
    kepala_penduduk_id: string;
  };
  anggota: PortalKartuAnggota[];
};

export async function fetchPortalProfil(): Promise<PortalProfil> {
  const res = await portalAuthFetch<{ ok: boolean; data: PortalProfil }>("/portal/me");
  return res.data;
}

export async function fetchPortalPaturunan(): Promise<PortalPaturunanData> {
  const res = await portalAuthFetch<{ ok: boolean; data: PortalPaturunanData }>("/portal/paturunan");
  return res.data;
}

export async function fetchPortalDudukan(): Promise<PortalDudukanData> {
  const res = await portalAuthFetch<{ ok: boolean; data: PortalDudukanData }>("/portal/dudukan");
  return res.data;
}

export async function fetchPortalKartu(): Promise<PortalKartuData> {
  const res = await portalAuthFetch<{ ok: boolean; data: PortalKartuData }>("/portal/kartu");
  return res.data;
}
