import { parseBatasUmurNyada } from "../nyada-ketentuan";
import { formatStatusKawin, isStatusKawinBelumKawin, isStatusKawinCerai } from "../status-kawin";
import { getDb } from "../db/client";
import { formatJenisKelamin, hitungUmur } from "../utils";

export type StatistikJiwaMipil = {
  yowana: number;
  wredha: number;
  /** Cerai hidup/mati · laki-laki */
  balu_lanang: number;
  /** Cerai hidup/mati · perempuan */
  balu_istri: number;
  yowanaConfigured: boolean;
  wredhaConfigured: boolean;
};

export type JiwaMipilBaris = {
  krama_id: string;
  nomor_kartu: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  umur: number;
  status_kawin_label: string;
  banjar_kode: string;
  banjar_nama: string;
  tempek_nama: string;
};

export type LaporanStatistikJiwaMipil = StatistikJiwaMipil & {
  total_jiwa: number;
  yowana_umur_min: number | null;
  yowana_umur_max: number | null;
  batas_umur_nyada: number | null;
  daftar_yowana: JiwaMipilBaris[];
  daftar_wredha: JiwaMipilBaris[];
  daftar_balu_lanang: JiwaMipilBaris[];
  daftar_balu_istri: JiwaMipilBaris[];
};

export type StatistikJiwaMipilFilter = {
  banjarId?: string;
  tempekId?: string;
  /** "L" atau "P" */
  jenisKelamin?: string;
};

export type StatistikJiwaJenis = "yowana" | "wredha" | "balu_lanang" | "balu_istri";

export function daftarStatistikJiwaMipil(
  data: LaporanStatistikJiwaMipil,
  jenis: StatistikJiwaJenis
): JiwaMipilBaris[] {
  switch (jenis) {
    case "yowana":
      return data.daftar_yowana;
    case "wredha":
      return data.daftar_wredha;
    case "balu_lanang":
      return data.daftar_balu_lanang;
    case "balu_istri":
      return data.daftar_balu_istri;
  }
}

export function labelStatistikJiwaJenis(jenis: StatistikJiwaJenis): string {
  switch (jenis) {
    case "yowana":
      return "Yowana";
    case "wredha":
      return "Wredha";
    case "balu_lanang":
      return "Balu Lanang";
    case "balu_istri":
      return "Balu Istri";
  }
}

export function kriteriaStatistikJiwaJenis(
  data: LaporanStatistikJiwaMipil,
  jenis: StatistikJiwaJenis
): string {
  switch (jenis) {
    case "yowana":
      return data.yowanaConfigured
        ? `Belum kawin · usia ${data.yowana_umur_min}–${data.yowana_umur_max} tahun`
        : "Rentang usia belum diatur di Profil Desa";
    case "wredha":
      return data.wredhaConfigured
        ? `Usia ≥ ${data.batas_umur_nyada} tahun · semua status kawin`
        : "Batas umur Nyada belum diatur di Profil Desa";
    case "balu_lanang":
      return "Cerai hidup/mati · laki-laki";
    case "balu_istri":
      return "Cerai hidup/mati · perempuan";
  }
}

export function jumlahStatistikJiwaJenis(data: LaporanStatistikJiwaMipil, jenis: StatistikJiwaJenis): number {
  switch (jenis) {
    case "yowana":
      return data.yowana;
    case "wredha":
      return data.wredha;
    case "balu_lanang":
      return data.balu_lanang;
    case "balu_istri":
      return data.balu_istri;
  }
}

type RawRow = {
  krama_id: string;
  nomor_kartu: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  tanggal_lahir: string | null;
  status_kawin: string | null;
  banjar_kode: string;
  banjar_nama: string;
  tempek_nama: string | null;
};

function parseYowanaUmur(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isYowanaRentangConfigured(min: unknown, max: unknown): boolean {
  const lo = parseYowanaUmur(min);
  const hi = parseYowanaUmur(max);
  return lo != null && hi != null && lo <= hi;
}

function toBaris(r: RawRow, umur: number): JiwaMipilBaris {
  return {
    krama_id: r.krama_id,
    nomor_kartu: r.nomor_kartu,
    nama_lengkap: r.nama_lengkap,
    jenis_kelamin: formatJenisKelamin(r.jenis_kelamin) || r.jenis_kelamin,
    umur,
    status_kawin_label: formatStatusKawin(r.status_kawin) || "—",
    banjar_kode: r.banjar_kode,
    banjar_nama: r.banjar_nama,
    tempek_nama: r.tempek_nama?.trim() || "—",
  };
}

function normalizeJenisKelamin(value?: string | null): "L" | "P" | null {
  const v = value?.trim().toUpperCase();
  if (v === "L" || v === "P") return v;
  return null;
}

function isBaluLanang(statusKawin: string | null | undefined, jenisKelamin: string | null | undefined): boolean {
  return isStatusKawinCerai(statusKawin) && normalizeJenisKelamin(jenisKelamin) === "L";
}

function isBaluIstri(statusKawin: string | null | undefined, jenisKelamin: string | null | undefined): boolean {
  return isStatusKawinCerai(statusKawin) && normalizeJenisKelamin(jenisKelamin) === "P";
}

function sortByNamaAsc(rows: JiwaMipilBaris[]): JiwaMipilBaris[] {
  return [...rows].sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap) || a.nomor_kartu.localeCompare(b.nomor_kartu));
}

function sortByUmurAsc(rows: JiwaMipilBaris[]): JiwaMipilBaris[] {
  return [...rows].sort((a, b) => a.umur - b.umur || a.nama_lengkap.localeCompare(b.nama_lengkap));
}

async function loadActiveMipilJiwa(filter: StatistikJiwaMipilFilter = {}): Promise<RawRow[]> {
  const db = await getDb();
  const params: string[] = [];
  const clauses: string[] = [];

  if (filter.banjarId?.trim()) {
    clauses.push(" AND k.banjar_id = ?");
    params.push(filter.banjarId.trim());
  }
  if (filter.tempekId?.trim()) {
    clauses.push(" AND k.tempek_id = ?");
    params.push(filter.tempekId.trim());
  }
  const jk = normalizeJenisKelamin(filter.jenisKelamin);
  if (jk) {
    clauses.push(" AND upper(trim(p.jenis_kelamin)) = ?");
    params.push(jk);
  }

  return db.select<RawRow[]>(
    `SELECT k.id as krama_id,
            k.nomor_kartu,
            p.nama_lengkap,
            p.jenis_kelamin,
            p.tanggal_lahir,
            p.status_kawin,
            b.kode as banjar_kode,
            b.nama as banjar_nama,
            t.nama as tempek_nama
     FROM anggota_keluarga ak
     JOIN penduduk p ON p.id = ak.penduduk_id
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tempek t ON t.id = k.tempek_id
     WHERE ak.status = 'aktif' AND k.status_krama = 'aktif'${clauses.join("")}
     ORDER BY b.kode ASC, k.nomor_kartu ASC, p.nama_lengkap ASC`,
    params
  );
}

type KetentuanJiwa = {
  yowanaUmurMin?: number | null;
  yowanaUmurMax?: number | null;
  batasUmurNyada?: number | null;
};

type KriteriaJiwa = {
  yowanaMin: number | null;
  yowanaMax: number | null;
  batasNyada: number | null;
  yowanaConfigured: boolean;
  wredhaConfigured: boolean;
};

type JiwaAtribut = Pick<RawRow, "jenis_kelamin" | "tanggal_lahir" | "status_kawin">;

type KelompokJiwa = {
  umur: number | null;
  yowana: boolean;
  wredha: boolean;
  baluLanang: boolean;
  baluIstri: boolean;
};

function resolveKriteria(ketentuan: KetentuanJiwa): KriteriaJiwa {
  const yowanaMin = parseYowanaUmur(ketentuan.yowanaUmurMin);
  const yowanaMax = parseYowanaUmur(ketentuan.yowanaUmurMax);
  const batasNyada = parseBatasUmurNyada(ketentuan.batasUmurNyada);
  return {
    yowanaMin,
    yowanaMax,
    batasNyada,
    yowanaConfigured: yowanaMin != null && yowanaMax != null && yowanaMin <= yowanaMax,
    wredhaConfigured: batasNyada != null,
  };
}

function kelompokJiwa(r: JiwaAtribut, k: KriteriaJiwa): KelompokJiwa {
  const umur = hitungUmur(r.tanggal_lahir);
  return {
    umur,
    baluLanang: isBaluLanang(r.status_kawin, r.jenis_kelamin),
    baluIstri: isBaluIstri(r.status_kawin, r.jenis_kelamin),
    wredha: umur != null && k.wredhaConfigured && umur >= k.batasNyada!,
    yowana:
      umur != null &&
      k.yowanaConfigured &&
      isStatusKawinBelumKawin(r.status_kawin) &&
      umur >= k.yowanaMin! &&
      umur <= k.yowanaMax!,
  };
}

function classifyJiwa(rows: RawRow[], ketentuan: KetentuanJiwa): LaporanStatistikJiwaMipil {
  const kriteria = resolveKriteria(ketentuan);

  const daftar_yowana: JiwaMipilBaris[] = [];
  const daftar_wredha: JiwaMipilBaris[] = [];
  const daftar_balu_lanang: JiwaMipilBaris[] = [];
  const daftar_balu_istri: JiwaMipilBaris[] = [];

  for (const r of rows) {
    const g = kelompokJiwa(r, kriteria);
    if (g.baluLanang) daftar_balu_lanang.push(toBaris(r, g.umur ?? 0));
    if (g.baluIstri) daftar_balu_istri.push(toBaris(r, g.umur ?? 0));
    if (g.wredha) daftar_wredha.push(toBaris(r, g.umur!));
    if (g.yowana) daftar_yowana.push(toBaris(r, g.umur!));
  }

  return {
    total_jiwa: rows.length,
    yowana: daftar_yowana.length,
    wredha: daftar_wredha.length,
    balu_lanang: daftar_balu_lanang.length,
    balu_istri: daftar_balu_istri.length,
    yowanaConfigured: kriteria.yowanaConfigured,
    wredhaConfigured: kriteria.wredhaConfigured,
    yowana_umur_min: kriteria.yowanaMin,
    yowana_umur_max: kriteria.yowanaMax,
    batas_umur_nyada: kriteria.batasNyada,
    daftar_yowana: sortByUmurAsc(daftar_yowana),
    daftar_wredha: sortByUmurAsc(daftar_wredha),
    daftar_balu_lanang: sortByNamaAsc(daftar_balu_lanang),
    daftar_balu_istri: sortByNamaAsc(daftar_balu_istri),
  };
}

async function loadActiveMipilJiwaAtribut(): Promise<JiwaAtribut[]> {
  const db = await getDb();
  return db.select<JiwaAtribut[]>(
    `SELECT p.jenis_kelamin, p.tanggal_lahir, p.status_kawin
     FROM anggota_keluarga ak
     JOIN penduduk p ON p.id = ak.penduduk_id
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     JOIN banjar b ON b.id = k.banjar_id
     WHERE ak.status = 'aktif' AND k.status_krama = 'aktif'`
  );
}

/** Hanya jumlah per kelompok (tanpa daftar nama) — untuk ringkasan eksekutif. */
export async function getStatistikJiwaMipil(ketentuan: KetentuanJiwa): Promise<StatistikJiwaMipil> {
  const kriteria = resolveKriteria(ketentuan);
  const rows = await loadActiveMipilJiwaAtribut();
  const result: StatistikJiwaMipil = {
    yowana: 0,
    wredha: 0,
    balu_lanang: 0,
    balu_istri: 0,
    yowanaConfigured: kriteria.yowanaConfigured,
    wredhaConfigured: kriteria.wredhaConfigured,
  };
  for (const r of rows) {
    const g = kelompokJiwa(r, kriteria);
    if (g.yowana) result.yowana += 1;
    if (g.wredha) result.wredha += 1;
    if (g.baluLanang) result.balu_lanang += 1;
    if (g.baluIstri) result.balu_istri += 1;
  }
  return result;
}

export async function getLaporanStatistikJiwaMipil(
  ketentuan: {
    yowanaUmurMin?: number | null;
    yowanaUmurMax?: number | null;
    batasUmurNyada?: number | null;
  },
  filter: StatistikJiwaMipilFilter = {}
): Promise<LaporanStatistikJiwaMipil> {
  const rows = await loadActiveMipilJiwa(filter);
  return classifyJiwa(rows, ketentuan);
}
