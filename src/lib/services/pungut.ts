import { getDb } from "../db/client";
import { normalizeNomorKartuKey } from "../kartu-qr";
import { hitungSisaPaturunan } from "../paturunan-hitung";
import { isJabatanPenerimaSemuaBanjar } from "../petugas-jabatan";
import type { PetugasStrukPreviewState } from "../petugas-struk-preview";
import type {
  StrukDudukanPdfPayload,
  StrukDudukanPeriodeLine,
} from "../struk-pembayaran-dudukan-pdf";
import type { StrukPaturunanPdfPayload } from "../struk-pembayaran-paturunan-pdf";
import type { IuranPaturunanRow } from "../types";
import type { PembayaranSetoranItem } from "./setoran";
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
  jenis_nama: string | null;
  alamat: string | null;
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

export type ModePungut = "paturunan" | "dudukan";

const KLASIFIKASI_MODE: Record<ModePungut, string[]> = {
  paturunan: ["MIPIL"],
  dudukan: ["KRAMA_TAMIU", "TAMIU"],
};

export function isKramaMipil(k: KramaPungut): boolean {
  return KLASIFIKASI_MODE.paturunan.includes(k.klasifikasi_kode);
}

export function isKramaPemasih(k: KramaPungut): boolean {
  return KLASIFIKASI_MODE.dudukan.includes(k.klasifikasi_kode);
}

/** Mode pengumpulan yang cocok untuk krama ini (null = tidak punya iuran). */
export function modeUntukKrama(k: KramaPungut): ModePungut | null {
  if (isKramaMipil(k)) return "paturunan";
  if (isKramaPemasih(k)) return "dudukan";
  return null;
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
         t.nama as tempek_nama, ar.nama as arahan_nama, kk.kode as klasifikasi_kode, k.status_krama,
         COALESCE(NULLIF(TRIM(jm.nama), ''), jkt.nama, jt.nama) as jenis_nama, k.alamat
  FROM krama k
  JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
  JOIN banjar b ON b.id = k.banjar_id
  JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
  LEFT JOIN tempek t ON t.id = k.tempek_id
  LEFT JOIN arahan ar ON ar.id = k.arahan_id
  LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
  LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
  LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id`;

async function getKramaPungutById(kramaId: string): Promise<KramaPungut | null> {
  const db = await getDb();
  const rows = await db.select<KramaPungut[]>(`${KRAMA_PUNGUT_SELECT} WHERE k.id = ? LIMIT 1`, [
    kramaId,
  ]);
  return rows[0] ?? null;
}

function strukFilename(jenis: "paturunan" | "dudukan", krama: KramaPungut, tanggal: string) {
  return `struk-${jenis}-${krama.nomor_kartu.replace(/\W/g, "")}-${tanggal}`;
}

export function buildStrukPaturunanPungut(params: {
  krama: KramaPungut;
  iuranNama: string;
  petugasNama: string;
  wajib: number;
  punia: number;
  tanggal: string;
}): StrukPaturunanPdfPayload {
  const { krama } = params;
  return {
    filename: strukFilename("paturunan", krama, params.tanggal),
    iuranNama: params.iuranNama,
    krama: {
      nomor_kartu: krama.nomor_kartu,
      kepala_nama: krama.kepala_nama,
      banjar_nama: krama.banjar_nama,
      jenis_nama: krama.jenis_nama,
      tempek_nama: krama.tempek_nama,
      arahan_nama: krama.arahan_nama,
    },
    wajib: params.wajib,
    punia: params.punia,
    total: params.wajib + params.punia,
    tanggal: params.tanggal,
    petugasNama: params.petugasNama,
  };
}

export function buildStrukDudukanPungut(params: {
  krama: KramaPungut;
  petugasNama: string;
  items: StrukDudukanPeriodeLine[];
  tanggal: string;
}): StrukDudukanPdfPayload {
  const { krama } = params;
  return {
    filename: strukFilename("dudukan", krama, params.tanggal),
    krama: {
      pengajeg_nama: krama.kepala_nama,
      nomor_pemasih: krama.nomor_kartu,
      jenis_krama: krama.jenis_nama?.trim() || "—",
      alamat_pemasih: krama.alamat?.trim() || "—",
    },
    items: params.items,
    total: params.items.reduce((s, i) => s + i.jumlah, 0),
    tanggal: params.tanggal,
    petugasNama: params.petugasNama,
  };
}

/**
 * Struk cetak ulang: menggabungkan semua pembayaran petugas ini untuk krama (dan iuran)
 * yang sama pada tanggal yang sama, karena satu transaksi bisa tersimpan sebagai beberapa baris.
 */
export async function getStrukCetakUlang(
  petugas: PetugasLapangan,
  item: PembayaranSetoranItem
): Promise<PetugasStrukPreviewState | null> {
  const db = await getDb();
  const back = { backTo: "/pungut", backLabel: "Pengumpulan" };

  if (item.sumber === "paturunan") {
    const [ref] = await db.select<{ krama_id: string; iuran_id: string; iuran_nama: string }[]>(
      `SELECT p.krama_id, p.iuran_id, i.nama as iuran_nama
       FROM paturunan_pembayaran p JOIN iuran_paturunan i ON i.id = p.iuran_id
       WHERE p.id = ?`,
      [item.id]
    );
    if (!ref) return null;
    const krama = await getKramaPungutById(ref.krama_id);
    if (!krama) return null;
    const rows = await db.select<{ jenis: string; jumlah: number }[]>(
      `SELECT COALESCE(jenis, 'wajib') as jenis, jumlah FROM paturunan_pembayaran
       WHERE krama_id = ? AND iuran_id = ? AND tanggal = ? AND petugas_id = ?`,
      [ref.krama_id, ref.iuran_id, item.tanggal, petugas.id]
    );
    const sum = (jenis: string) =>
      rows.filter((r) => r.jenis === jenis).reduce((s, r) => s + Math.round(Number(r.jumlah) || 0), 0);
    return {
      kind: "paturunan",
      payload: buildStrukPaturunanPungut({
        krama,
        iuranNama: ref.iuran_nama,
        petugasNama: petugas.nama,
        wajib: sum("wajib"),
        punia: sum("punia"),
        tanggal: item.tanggal,
      }),
      ...back,
    };
  }

  const [ref] = await db.select<{ krama_id: string }[]>(
    `SELECT krama_id FROM dudukan_pembayaran WHERE id = ?`,
    [item.id]
  );
  if (!ref) return null;
  const krama = await getKramaPungutById(ref.krama_id);
  if (!krama) return null;
  const rows = await db.select<StrukDudukanPeriodeLine[]>(
    `SELECT tahun, bulan, jumlah FROM dudukan_pembayaran
     WHERE krama_id = ? AND tanggal = ? AND petugas_id = ?
     ORDER BY tahun, bulan`,
    [ref.krama_id, item.tanggal, petugas.id]
  );
  return {
    kind: "dudukan",
    payload: buildStrukDudukanPungut({
      krama,
      petugasNama: petugas.nama,
      items: rows.map((r) => ({
        tahun: Number(r.tahun),
        bulan: Number(r.bulan),
        jumlah: Math.round(Number(r.jumlah) || 0),
      })),
      tanggal: item.tanggal,
    }),
    ...back,
  };
}

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
  mode: ModePungut,
  limit = 20
): Promise<KramaPungut[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const db = await getDb();
  const klasifikasi = KLASIFIKASI_MODE[mode];
  const args: unknown[] = [`%${needle}%`, `%${needle.replace(/-/g, "")}%`, ...klasifikasi];
  let sql = `${KRAMA_PUNGUT_SELECT}
     WHERE k.status_krama = 'aktif'
       AND (lower(pd.nama_lengkap) LIKE ? OR lower(REPLACE(k.nomor_kartu, '-', '')) LIKE ?)
       AND kk.kode IN (${klasifikasi.map(() => "?").join(", ")})`;
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
