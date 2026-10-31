import { parseIsoDateString } from "../date-iso";
import { getDb } from "../db/client";
import type { PenerimaanDanaLainJenis, PenerimaanDanaLainSumberTipe } from "../types";
import {
  SUMBER_TIPE_OPTIONS,
  isPenerimaanDanaLainJenis,
  labelJenisPenerimaanDanaLain,
} from "./penerimaan-dana-lain";

export type LaporanPenerimaanDanaLainFilter = {
  jenis?: PenerimaanDanaLainJenis | "";
  dari?: string;
  sampai?: string;
  q?: string;
  statusSetor?: "semua" | "belum" | "sudah";
};

export type LaporanPenerimaanDanaLainRow = {
  id: string;
  tanggal: string;
  jenis: PenerimaanDanaLainJenis;
  jenis_label: string;
  sumber_tipe: PenerimaanDanaLainSumberTipe;
  sumber_tipe_label: string;
  sumber_nama: string;
  nomor_kartu: string | null;
  kegiatan: string | null;
  mitra_jenis: string | null;
  jumlah: number;
  petugas_nama: string | null;
  akun_nama: string | null;
  tanggal_setor: string | null;
  setoran_id: string | null;
  keterangan: string | null;
};

export type LaporanPenerimaanDanaLainRingkasan = {
  jumlah_transaksi: number;
  total: number;
  total_punia: number;
  total_kerjasama: number;
  belum_setor: number;
  sudah_setor: number;
};

function sumberTipeLabel(tipe: string): string {
  return SUMBER_TIPE_OPTIONS.find((o) => o.value === tipe)?.label ?? tipe;
}

export async function getLaporanPenerimaanDanaLain(
  filter: LaporanPenerimaanDanaLainFilter
): Promise<{
  ringkasan: LaporanPenerimaanDanaLainRingkasan;
  rows: LaporanPenerimaanDanaLainRow[];
}> {
  const db = await getDb();
  const parts: string[] = ["1=1"];
  const args: unknown[] = [];

  if (filter.jenis && isPenerimaanDanaLainJenis(filter.jenis)) {
    parts.push("p.jenis = ?");
    args.push(filter.jenis);
  }
  const dari = filter.dari ? parseIsoDateString(filter.dari) : null;
  if (dari) {
    parts.push("p.tanggal >= ?");
    args.push(dari);
  }
  const sampai = filter.sampai ? parseIsoDateString(filter.sampai) : null;
  if (sampai) {
    parts.push("p.tanggal <= ?");
    args.push(sampai);
  }
  if (filter.statusSetor === "belum") {
    parts.push("p.tanggal_setor IS NULL");
  } else if (filter.statusSetor === "sudah") {
    parts.push("p.tanggal_setor IS NOT NULL");
  }
  const q = filter.q?.trim();
  if (q) {
    parts.push(
      `(p.sumber_nama LIKE ? OR COALESCE(k.nomor_kartu, '') LIKE ? OR COALESCE(p.kegiatan, '') LIKE ? OR COALESCE(p.keterangan, '') LIKE ? OR COALESCE(t.nama, '') LIKE ?)`
    );
    const like = `%${q}%`;
    args.push(like, like, like, like, like);
  }

  const where = parts.join(" AND ");
  const raw = await db.select<
    {
      id: string;
      tanggal: string;
      jenis: string;
      sumber_tipe: string;
      sumber_nama: string | null;
      nomor_kartu: string | null;
      kegiatan: string | null;
      mitra_jenis: string | null;
      jumlah: number;
      petugas_nama: string | null;
      akun_nama: string | null;
      tanggal_setor: string | null;
      setoran_id: string | null;
      keterangan: string | null;
    }[]
  >(
    `SELECT p.id, p.tanggal, p.jenis, p.sumber_tipe,
            COALESCE(NULLIF(TRIM(p.sumber_nama), ''), pd.nama_lengkap, lb.nama, '—') as sumber_nama,
            k.nomor_kartu, p.kegiatan, p.mitra_jenis, p.jumlah,
            t.nama as petugas_nama, a.nama as akun_nama, p.tanggal_setor, p.setoran_id, p.keterangan
     FROM penerimaan_dana_lain p
     LEFT JOIN krama k ON k.id = p.krama_id
     LEFT JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
     LEFT JOIN lembaga_badan lb ON lb.id = p.lembaga_badan_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
     WHERE ${where}
     ORDER BY p.tanggal DESC, p.created_at DESC`,
    args
  );

  const rows: LaporanPenerimaanDanaLainRow[] = raw.map((r) => {
    const jenis = isPenerimaanDanaLainJenis(r.jenis) ? r.jenis : "punia_kasukretan";
    return {
      id: r.id,
      tanggal: r.tanggal,
      jenis,
      jenis_label: labelJenisPenerimaanDanaLain(jenis),
      sumber_tipe: r.sumber_tipe as PenerimaanDanaLainSumberTipe,
      sumber_tipe_label: sumberTipeLabel(r.sumber_tipe),
      sumber_nama: r.sumber_nama?.trim() || "—",
      nomor_kartu: r.nomor_kartu,
      kegiatan: r.kegiatan,
      mitra_jenis: r.mitra_jenis,
      jumlah: Math.round(Number(r.jumlah) || 0),
      petugas_nama: r.petugas_nama,
      akun_nama: r.akun_nama,
      tanggal_setor: r.tanggal_setor,
      setoran_id: r.setoran_id,
      keterangan: r.keterangan,
    };
  });

  let total_punia = 0;
  let total_kerjasama = 0;
  let belum_setor = 0;
  let sudah_setor = 0;
  for (const r of rows) {
    if (r.jenis === "punia_kasukretan") total_punia += r.jumlah;
    else total_kerjasama += r.jumlah;
    if (r.tanggal_setor) sudah_setor += r.jumlah;
    else belum_setor += r.jumlah;
  }

  return {
    ringkasan: {
      jumlah_transaksi: rows.length,
      total: total_punia + total_kerjasama,
      total_punia,
      total_kerjasama,
      belum_setor,
      sudah_setor,
    },
    rows,
  };
}
