import { apiFetch } from "./client";
import { parsePetugasKartuQrPayload } from "../petugas-kartu-qr";

export type PublikCekPetugasStatus = {
  nama_desa_adat: string;
};

export type PublikCekPetugasResult = {
  sah: boolean;
  desa_nama: string;
  petugas?: {
    id: string;
    nama: string;
    jabatan: string;
    nomor_pengenal: string;
    tipe: string;
    banjar_nama: string;
    banjar_kode: string;
  };
};

export async function fetchPublikCekPetugasStatus(): Promise<PublikCekPetugasStatus> {
  const res = await apiFetch<{ ok: boolean; nama_desa_adat: string }>("/publik/cek-petugas/status");
  return { nama_desa_adat: res.nama_desa_adat };
}

/** q boleh nomor anggota atau payload QR mentah. */
export async function fetchPublikCekPetugasVerifikasi(
  q: string
): Promise<PublikCekPetugasResult> {
  const raw = q.trim();
  const fromQr = parsePetugasKartuQrPayload(raw);
  const nomor = fromQr ?? raw;
  const sp = new URLSearchParams({ q: nomor });
  const res = await apiFetch<{ ok: boolean } & PublikCekPetugasResult>(
    `/publik/cek-petugas/verifikasi?${sp}`
  );
  return {
    sah: !!res.sah,
    desa_nama: res.desa_nama,
    petugas: res.petugas,
  };
}
