import { getDb } from "../db/client";
import { normalizeNomorKartuKey } from "../kartu-qr";
import { hitungSisaPaturunan } from "../paturunan-hitung";
import { isJabatanPenerimaSemuaBanjar } from "../petugas-jabatan";
import type { IuranPaturunanRow } from "../types";
import { getTunggakanDudukanKrama } from "./dudukan";
import { listIuranPaturunan } from "./iuran-paturunan";
import { getPembayaranTotals, getTagihanPaturunanKramaIuran } from "./paturunan-pembayaran";

export type PetugasLapangan = {
  id: string;
  nama: string;
  jabatan: string;
  banjar_id: string;
  banjar_nama: string;
  semua_banjar: boolean;
};

export type KramaPungut = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  banjar_id: string;
  banjar_nama: string;
  tempek_nama: string | null;
  arahan_nama: string | null;
  klasifikasi_kode: string;
  status_krama: string;
};

export type RingkasanPaturunanPungut = {
  iuran: IuranPaturunanRow;
  tagihan: number;
  dibayarWajib: number;
  sisa: number;
};

export type RingkasanPungut = {
  paturunan: RingkasanPaturunanPungut[];
  /** Total sisa dudukan bulan berjalan dan sebelumnya (tanpa bayar di muka). */
  tunggakanDudukan: number;
  bulanTunggakanDudukan: number;
};

export function isKramaMipil(k: KramaPungut): boolean {
  return k.klasifikasi_kode === "MIPIL";
}

export function isKramaPemasih(k: KramaPungut): boolean {
  return k.klasifikasi_kode === "KRAMA_TAMIU" || k.klasifikasi_kode === "TAMIU";
}

export function bolehPungutKrama(petugas: PetugasLapangan, krama: KramaPungut): boolean {
  return petugas.semua_banjar || krama.banjar_id === petugas.banjar_id;
}

/** Profil Tim Kasukretan untuk akun yang sedang login (null = belum dihubungkan admin). */
export async function getPetugasLapanganSaya(userId: string): Promise<PetugasLapangan | null> {
  const db = await getDb();
  const rows = await db.select<Omit<PetugasLapangan, "semua_banjar">[]>(
    `SELECT t.id, t.nama, t.jabatan, t.banjar_id, b.nama as banjar_nama
     FROM user u
     JOIN tim_kasukretan t ON t.id = u.tim_kasukretan_id
     JOIN banjar b ON b.id = t.banjar_id
     WHERE u.id = ?`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, semua_banjar: isJabatanPenerimaSemuaBanjar(row.jabatan) };
}

const KRAMA_PUNGUT_SELECT = `
  SELECT k.id, k.nomor_kartu, pd.nama_lengkap as kepala_nama, k.banjar_id, b.nama as banjar_nama,
         t.nama as tempek_nama, ar.nama as arahan_nama, kk.kode as klasifikasi_kode, k.status_krama
  FROM krama k
  JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
  JOIN banjar b ON b.id = k.banjar_id
  JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
  LEFT JOIN tempek t ON t.id = k.tempek_id
  LEFT JOIN arahan ar ON ar.id = k.arahan_id`;

export async function findKramaByNomorKartu(nomorKartu: string): Promise<KramaPungut | null> {
  const key = normalizeNomorKartuKey(nomorKartu);
  if (!key) return null;
  const db = await getDb();
  const rows = await db.select<KramaPungut[]>(
    `${KRAMA_PUNGUT_SELECT}
     WHERE lower(REPLACE(k.nomor_kartu, '-', '')) = ?
     LIMIT 1`,
    [key]
  );
  return rows[0] ?? null;
}

/** Cari krama aktif di wilayah petugas — cadangan bila QR kartu tidak bisa dipindai. */
export async function cariKramaPungut(
  petugas: PetugasLapangan,
  q: string,
  limit = 20
): Promise<KramaPungut[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const db = await getDb();
  const args: unknown[] = [`%${needle}%`, `%${needle.replace(/-/g, "")}%`];
  let sql = `${KRAMA_PUNGUT_SELECT}
     WHERE k.status_krama = 'aktif'
       AND (lower(pd.nama_lengkap) LIKE ? OR lower(REPLACE(k.nomor_kartu, '-', '')) LIKE ?)`;
  if (!petugas.semua_banjar) {
    sql += ` AND k.banjar_id = ?`;
    args.push(petugas.banjar_id);
  }
  sql += ` ORDER BY pd.nama_lengkap COLLATE NOCASE LIMIT ?`;
  args.push(limit);
  return db.select<KramaPungut[]>(sql, args);
}

export async function getRingkasanPungut(krama: KramaPungut): Promise<RingkasanPungut> {
  const paturunan: RingkasanPaturunanPungut[] = [];
  if (isKramaMipil(krama)) {
    const iuranList = await listIuranPaturunan();
    for (const iuran of iuranList) {
      const [tagihan, totals] = await Promise.all([
        getTagihanPaturunanKramaIuran(krama.id, iuran.id),
        getPembayaranTotals(krama.id, iuran.id),
      ]);
      paturunan.push({
        iuran,
        tagihan,
        dibayarWajib: totals.wajib,
        sisa: hitungSisaPaturunan(tagihan, totals.wajib),
      });
    }
  }

  let tunggakanDudukan = 0;
  let bulanTunggakanDudukan = 0;
  if (isKramaPemasih(krama)) {
    for (const b of await getTunggakanDudukanKrama(krama.id)) {
      if (b.di_muka || b.sisa <= 0) continue;
      tunggakanDudukan += b.sisa;
      bulanTunggakanDudukan += 1;
    }
  }
  return { paturunan, tunggakanDudukan, bulanTunggakanDudukan };
}
