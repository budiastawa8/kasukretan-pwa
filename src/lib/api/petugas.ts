import { API_BASE, ApiError, apiFetch, parseJsonResponse } from "./client";
import { fetchWithRetry } from "../fetch-retry";
import type { StrukDudukanPdfPayload } from "../struk-pembayaran-dudukan-pdf";
import type { StrukPaturunanPdfPayload } from "../struk-pembayaran-paturunan-pdf";

const TOKEN_KEY = "kasukretan_api_token";
const USER_KEY = "kasukretan_api_user";

function readSessionItem(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

function removeSessionItem(key: string): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Pindahkan sesi lama dari sessionStorage ke localStorage (sekali). */
function migrateSessionFromTabStorage(): void {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const user = sessionStorage.getItem(USER_KEY);
    if (!token && !user) return;
    if (token && !localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    if (user && !localStorage.getItem(USER_KEY)) {
      localStorage.setItem(USER_KEY, user);
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

migrateSessionFromTabStorage();

export type ApiSessionUser = {
  id: string;
  username: string;
  peran: string;
  nama?: string | null;
  tim_kasukretan_id?: string | null;
};

export function getApiToken(): string | null {
  return readSessionItem(TOKEN_KEY);
}

export function getApiUser(): ApiSessionUser | null {
  const raw = readSessionItem(USER_KEY);
  return raw ? (JSON.parse(raw) as ApiSessionUser) : null;
}

export function clearApiSession(): void {
  removeSessionItem(TOKEN_KEY);
  removeSessionItem(USER_KEY);
}

export function saveApiSession(token: string, user: ApiSessionUser): void {
  writeSessionItem(TOKEN_KEY, token);
  writeSessionItem(USER_KEY, JSON.stringify(user));
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getApiToken();
  if (!token) throw new Error("Belum login API");
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
    clearApiSession();
    throw new Error("Sesi habis — login ulang");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const err = await parseJsonResponse<{ error?: string }>(res);
      if (err.error) detail = err.error;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      /* ignore */
    }
    throw new Error(detail);
  }
  return parseJsonResponse<T>(res);
}

export async function apiLogin(username: string, password: string): Promise<ApiSessionUser> {
  const res = await apiFetch<{ ok: boolean; token: string; user: ApiSessionUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  saveApiSession(res.token, res.user);
  return res.user;
}

export type BanjarApi = { id: string; nama: string; kode: string };
export type IuranApi = { id: string; nama: string; nominal: number; tanggal_target: string | null };
export type TimApi = { id: string; nama: string; jabatan: string; banjar_id: string };

export type AkunKeuanganApi = {
  id: string;
  nama: string;
  jenis: "kas_dudukan" | "kas_paturunan" | "bank" | "ewallet";
  keterangan: string | null;
  aktif: number;
  urutan: number;
};

export async function fetchAkunKeuangan(
  untuk: "paturunan" | "dudukan"
): Promise<AkunKeuanganApi[]> {
  const res = await authFetch<{ ok: boolean; data: AkunKeuanganApi[] }>(
    `/akun-keuangan?untuk=${encodeURIComponent(untuk)}`
  );
  return res.data;
}

export type PetugasKesiapanApi = {
  ok: boolean;
  siap: boolean;
  counts: Record<string, number>;
};

export async function fetchPetugasKesiapan(): Promise<PetugasKesiapanApi> {
  return authFetch<PetugasKesiapanApi>("/petugas/kesiapan");
}

export async function fetchBanjar(): Promise<BanjarApi[]> {
  const res = await authFetch<{ ok: boolean; data: BanjarApi[] }>("/banjar");
  return res.data;
}

export async function fetchIuran(): Promise<IuranApi[]> {
  const res = await authFetch<{ ok: boolean; data: IuranApi[] }>("/iuran-paturunan");
  return res.data;
}

export async function fetchTim(banjarId?: string): Promise<TimApi[]> {
  const path = banjarId
    ? `/tim-kasukretan?banjarId=${encodeURIComponent(banjarId)}`
    : "/tim-kasukretan";
  const res = await authFetch<{ ok: boolean; data: TimApi[] }>(path);
  return res.data;
}

export type TunggakanPaturunanApi = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  banjar_nama: string;
  tempek_nama: string | null;
  arahan_nama: string | null;
  jenis_nama: string | null;
  tagihan: number;
  dibayar: number;
  sisa: number;
};

export async function fetchTunggakanPaturunan(params: {
  banjarId?: string;
  iuranId: string;
  q?: string;
}): Promise<TunggakanPaturunanApi[]> {
  const sp = new URLSearchParams({ iuranId: params.iuranId });
  if (params.banjarId) sp.set("banjarId", params.banjarId);
  if (params.q) sp.set("q", params.q);
  const res = await authFetch<{ ok: boolean; data: TunggakanPaturunanApi[] }>(
    `/petugas/paturunan/tunggakan?${sp}`
  );
  return res.data;
}

export async function fetchTunggakanPaturunanLookup(params: {
  kartu: string;
  iuranId: string;
  banjarId?: string;
}): Promise<TunggakanPaturunanApi> {
  const sp = new URLSearchParams({
    kartu: params.kartu,
    iuranId: params.iuranId,
  });
  if (params.banjarId) sp.set("banjarId", params.banjarId);
  const res = await authFetch<{ ok: boolean; data: TunggakanPaturunanApi }>(
    `/petugas/paturunan/lookup?${sp}`
  );
  return res.data;
}

export type PembayaranPaturunanResult = {
  id: string | null;
  ids: string[];
  wajib: number;
  punia: number;
};

export async function postPembayaranPaturunan(body: {
  kramaId: string;
  iuranId: string;
  jumlah: number;
  tanggal: string;
  petugasId: string;
  akunKeuanganId?: string;
  keterangan?: string;
}): Promise<PembayaranPaturunanResult> {
  const res = await authFetch<{
    ok: boolean;
    id: string | null;
    ids: string[];
    wajib: number;
    punia: number;
  }>("/petugas/paturunan/pembayaran", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    id: res.id,
    ids: res.ids ?? (res.id ? [res.id] : []),
    wajib: res.wajib ?? 0,
    punia: res.punia ?? 0,
  };
}

export type TunggakanDudukanApi = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  banjar_nama: string;
  tarif: number;
  dibayar: number;
  sisa: number;
};

export type KramaDudukanPetugasApi = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  alamat: string;
  klasifikasi_kode: string;
  klasifikasi_nama: string;
  jenis_nama: string;
  banjar_nama: string;
  tempek_nama: string | null;
  arahan_nama: string | null;
  tarif_bulanan: number;
  tunggakan_bulan: number;
  total_sisa: number;
  total_sisa_dimuka: number;
};

export type BulanTunggakanDudukanApi = {
  tahun: number;
  bulan: number;
  tagihan: number;
  dibayar: number;
  keringanan: number;
  sisa: number;
  lunas: boolean;
  telat: boolean;
  di_muka?: boolean;
};

export async function fetchKramaDudukanPetugas(params: {
  banjarId?: string;
  q?: string;
  punyaTunggakan?: boolean;
}): Promise<KramaDudukanPetugasApi[]> {
  const sp = new URLSearchParams();
  if (params.banjarId) sp.set("banjarId", params.banjarId);
  if (params.q) sp.set("q", params.q);
  if (params.punyaTunggakan) sp.set("punyaTunggakan", "1");
  const res = await authFetch<{ ok: boolean; data: KramaDudukanPetugasApi[] }>(
    `/petugas/dudukan/krama?${sp}`
  );
  return res.data;
}

export async function fetchKramaDudukanLookup(params: {
  kartu: string;
  banjarId?: string;
}): Promise<KramaDudukanPetugasApi> {
  const sp = new URLSearchParams({ kartu: params.kartu });
  if (params.banjarId) sp.set("banjarId", params.banjarId);
  const res = await authFetch<{ ok: boolean; data: KramaDudukanPetugasApi }>(
    `/petugas/dudukan/lookup?${sp}`
  );
  return res.data;
}

export async function fetchBulanTunggakanDudukan(
  kramaId: string
): Promise<BulanTunggakanDudukanApi[]> {
  const res = await authFetch<{ ok: boolean; data: BulanTunggakanDudukanApi[] }>(
    `/petugas/dudukan/bulan-tunggakan?kramaId=${encodeURIComponent(kramaId)}`
  );
  return res.data;
}

export async function fetchTunggakanDudukan(params: {
  banjarId?: string;
  tahun: number;
  bulan: number;
  q?: string;
}): Promise<TunggakanDudukanApi[]> {
  const sp = new URLSearchParams({
    tahun: String(params.tahun),
    bulan: String(params.bulan),
  });
  if (params.banjarId) sp.set("banjarId", params.banjarId);
  if (params.q) sp.set("q", params.q);
  const res = await authFetch<{ ok: boolean; data: TunggakanDudukanApi[] }>(
    `/petugas/dudukan/tunggakan?${sp}`
  );
  return res.data;
}

export async function postPembayaranDudukan(body: {
  kramaId: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  tanggal: string;
  petugasId: string;
  akunKeuanganId?: string;
  keterangan?: string;
}): Promise<string> {
  const res = await authFetch<{ ok: boolean; id: string }>("/petugas/dudukan/pembayaran", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.id;
}

export async function postPembayaranDudukanMulti(body: {
  kramaId: string;
  tanggal: string;
  petugasId: string;
  akunKeuanganId?: string;
  keterangan?: string;
  items: { tahun: number; bulan: number; jumlah: number }[];
}): Promise<string[]> {
  const res = await authFetch<{ ok: boolean; ids: string[] }>("/petugas/dudukan/pembayaran", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.ids ?? [];
}

export type PetugasDesaApi = {
  id: string;
  nama_desa_adat: string;
  nama_kecamatan: string;
  nama_kabupaten: string;
  logo_url: string | null;
  logo_mda_url: string | null;
  panyarikan_nama: string | null;
  panyarikan_jabatan: string | null;
  patengen_nama: string | null;
  patengen_jabatan: string | null;
  bandesa_nama: string | null;
  bandesa_jabatan: string | null;
};

export async function fetchPetugasDesa(): Promise<PetugasDesaApi | null> {
  const res = await authFetch<{ ok: boolean; data: PetugasDesaApi | null }>("/petugas/desa");
  return res.data ?? null;
}

export type PetugasRekapHariIniBaris = {
  id: string;
  jenis: "paturunan" | "dudukan";
  jenis_label: string;
  waktu: string;
  nomor_kartu: string;
  nama: string;
  alamat: string;
  jumlah: number;
  item_count: number;
  /** Disediakan API baru — fallback parse dari id bila kosong. */
  krama_id?: string;
  iuran_id?: string;
};

export type PetugasRekapHariIni = {
  tanggal: string;
  petugas: { id: string; nama: string } | null;
  ringkasan: {
    total_paturunan: number;
    total_dudukan: number;
    total: number;
    jumlah_penerimaan: number;
  };
  rows: PetugasRekapHariIniBaris[];
};

export async function fetchPetugasRekapHariIni(
  tanggal?: string
): Promise<PetugasRekapHariIni> {
  const sp = new URLSearchParams();
  if (tanggal?.trim()) sp.set("tanggal", tanggal.trim());
  const qs = sp.toString();
  const res = await authFetch<{ ok: boolean; data: PetugasRekapHariIni }>(
    `/petugas/rekap-hari-ini${qs ? `?${qs}` : ""}`
  );
  return res.data;
}

export type PetugasStrukPreviewApi =
  | {
      kind: "dudukan";
      payload: StrukDudukanPdfPayload;
    }
  | {
      kind: "paturunan";
      payload: StrukPaturunanPdfPayload;
    };

export async function fetchPetugasStrukPreview(params: {
  jenis: "dudukan" | "paturunan";
  kramaId: string;
  tanggal: string;
  iuranId?: string;
}): Promise<PetugasStrukPreviewApi> {
  const sp = new URLSearchParams({
    jenis: params.jenis,
    kramaId: params.kramaId,
    tanggal: params.tanggal,
  });
  if (params.iuranId?.trim()) sp.set("iuranId", params.iuranId.trim());
  const res = await authFetch<{ ok: boolean; data: PetugasStrukPreviewApi }>(
    `/petugas/struk-preview?${sp}`
  );
  return res.data;
}
