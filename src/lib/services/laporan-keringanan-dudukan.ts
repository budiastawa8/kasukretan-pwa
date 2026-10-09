import { getDb } from "../db/client";
import { formatBulanIndonesia, hitungTagihanDudukanPeriode, parseBulan, parseTahun } from "../dudukan-hitung";
import type { KlasifikasiKode } from "../types";

export type LaporanKeringananDudukanFilter = {
  tahun?: number;
  bulan?: number;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  q?: string;
};

export type LaporanKeringananDudukanRow = {
  id: string;
  krama_id: string;
  tahun: number;
  bulan: number;
  periode_label: string;
  jumlah: number;
  tanggal: string;
  keterangan: string | null;
  petugas_nama: string | null;
  petugas_jabatan: string | null;
  nomor_kartu: string;
  kepala_nama: string;
  klasifikasi_kode: KlasifikasiKode;
  klasifikasi_nama: string;
  jenis_nama: string;
  banjar_nama: string;
  tagihan: number;
  dibayar: number;
};

export type LaporanKeringananDudukanRingkasan = {
  total_record: number;
  total_keringanan: number;
  total_krama: number;
};

export async function getLaporanKeringananDudukan(
  filter: LaporanKeringananDudukanFilter
): Promise<{
  ringkasan: LaporanKeringananDudukanRingkasan;
  rows: LaporanKeringananDudukanRow[];
}> {
  const db = await getDb();
  let sql = `
    SELECT dk.id, dk.krama_id, dk.tahun, dk.bulan, dk.jumlah, dk.tanggal, dk.keterangan,
           t.nama as petugas_nama, t.jabatan as petugas_jabatan,
           k.nomor_kartu, k.tanggal_terdaftar,
           p.nama_lengkap as kepala_nama,
           kk.kode as klasifikasi_kode, kk.nama_tampilan as klasifikasi_nama,
           COALESCE(jkt.nama, jt.nama, '') as jenis_nama,
           COALESCE(jkt.dudukan_nominal, jt.dudukan_nominal, 0) as tarif_nominal,
           b.nama as banjar_nama,
           COALESCE((
             SELECT SUM(dp.jumlah) FROM dudukan_pembayaran dp
             WHERE dp.krama_id = dk.krama_id AND dp.tahun = dk.tahun AND dp.bulan = dk.bulan
           ), 0) as dibayar
    FROM dudukan_keringanan dk
    JOIN krama k ON k.id = dk.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
    JOIN penduduk p ON p.id = k.kepala_penduduk_id
    LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
    LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tim_kasukretan t ON t.id = dk.petugas_id
    WHERE k.status_krama = 'aktif'
  `;
  const args: unknown[] = [];
  let n = 1;

  if (filter.tahun != null) {
    sql += ` AND dk.tahun = $${n++}`;
    args.push(parseTahun(filter.tahun));
  }
  if (filter.bulan != null) {
    sql += ` AND dk.bulan = $${n++}`;
    args.push(parseBulan(filter.bulan));
  }
  if (filter.banjarId) {
    sql += ` AND k.banjar_id = $${n++}`;
    args.push(filter.banjarId);
  }
  if (filter.klasifikasi) {
    sql += ` AND kk.kode = $${n++}`;
    args.push(filter.klasifikasi);
  }
  if (filter.q) {
    const q = `%${filter.q}%`;
    sql += ` AND (k.nomor_kartu LIKE $${n} OR p.nama_lengkap LIKE $${n + 1})`;
    args.push(q, q);
  }

  sql += ` ORDER BY dk.tahun DESC, dk.bulan DESC, k.nomor_kartu`;

  type Raw = {
    id: string;
    krama_id: string;
    tahun: number;
    bulan: number;
    jumlah: number;
    tanggal: string;
    keterangan: string | null;
    petugas_nama: string | null;
    petugas_jabatan: string | null;
    nomor_kartu: string;
    tanggal_terdaftar: string;
    kepala_nama: string;
    klasifikasi_kode: KlasifikasiKode;
    klasifikasi_nama: string;
    jenis_nama: string;
    tarif_nominal: number;
    banjar_nama: string;
    dibayar: number;
  };

  const raw = await db.select<Raw[]>(sql, args);
  const kramaIds = new Set<string>();

  const rows: LaporanKeringananDudukanRow[] = raw.map((r) => {
    kramaIds.add(r.krama_id);
    const tahun = parseTahun(r.tahun);
    const bulan = parseBulan(r.bulan);
    const tagihan = hitungTagihanDudukanPeriode(
      Number(r.tarif_nominal) || 0,
      r.tanggal_terdaftar,
      tahun,
      bulan
    );
    return {
      id: r.id,
      krama_id: r.krama_id,
      tahun,
      bulan,
      periode_label: formatBulanIndonesia(bulan, tahun),
      jumlah: Math.round(Number(r.jumlah) || 0),
      tanggal: r.tanggal,
      keterangan: r.keterangan,
      petugas_nama: r.petugas_nama,
      petugas_jabatan: r.petugas_jabatan,
      nomor_kartu: r.nomor_kartu,
      kepala_nama: r.kepala_nama,
      klasifikasi_kode: r.klasifikasi_kode,
      klasifikasi_nama: r.klasifikasi_nama,
      jenis_nama: r.jenis_nama?.trim() || "—",
      banjar_nama: r.banjar_nama,
      tagihan,
      dibayar: Math.round(Number(r.dibayar) || 0),
    };
  });

  return {
    ringkasan: {
      total_record: rows.length,
      total_keringanan: rows.reduce((s, r) => s + r.jumlah, 0),
      total_krama: kramaIds.size,
    },
    rows,
  };
}
