import { apiFetch } from "./client";

export type PublikCekTunggakanStatus = {
  aktif: boolean;
  nama_desa_adat: string;
};

export type PublikCekTunggakanSearchItem = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  banjar_nama: string;
  tempek_nama: string | null;
  jenis_nama: string | null;
};

export type PublikCekTunggakanIuran = {
  iuran_id: string;
  iuran_nama: string;
  tagihan: number;
  dibayar_wajib: number;
  punia: number;
  sisa: number;
  status: string;
};

export type PublikCekTunggakanDetail = {
  krama: {
    id: string;
    nomor_kartu: string;
    kepala_nama: string;
    banjar_nama: string;
    tempek_nama: string | null;
    jenis_nama: string | null;
  };
  total_sisa: number;
  total_punia: number;
  iuran: PublikCekTunggakanIuran[];
};

export async function fetchPublikCekTunggakanStatus(): Promise<PublikCekTunggakanStatus> {
  const res = await apiFetch<{ ok: boolean; aktif: boolean; nama_desa_adat: string }>(
    "/publik/cek-tunggakan/status"
  );
  return { aktif: !!res.aktif, nama_desa_adat: res.nama_desa_adat };
}

export async function fetchPublikCekTunggakanCari(
  q: string
): Promise<PublikCekTunggakanSearchItem[]> {
  const sp = new URLSearchParams({ q });
  const res = await apiFetch<{ ok: boolean; results: PublikCekTunggakanSearchItem[] }>(
    `/publik/cek-tunggakan/cari?${sp}`
  );
  return res.results ?? [];
}

export async function fetchPublikCekTunggakanDetail(
  kramaId: string
): Promise<PublikCekTunggakanDetail> {
  const res = await apiFetch<{ ok: boolean; data: PublikCekTunggakanDetail }>(
    `/publik/cek-tunggakan/${encodeURIComponent(kramaId)}`
  );
  return res.data;
}
