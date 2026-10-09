import { getDb } from "../db/client";
import {
  hitungSisaPaturunan,
  hitungTagihanPaturunan,
  isLunasPaturunan,
  isPastTanggalTarget,
  isPeringatanTelat,
  resolvePersenPaturunanIuran,
} from "../paturunan-hitung";
import { listBanjar } from "./master";
import { getIuranPaturunan, listIuranPaturunan } from "./iuran-paturunan";
import { getPembayaranTotalsMap } from "./paturunan-pembayaran";
import type { KramaDetail } from "../types";
import { previewStatusIlikita } from "./krama";
import { getDesaAdat } from "./desa";

export type PaturunanKramaRow = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  jenis_id?: string | null;
  jenis_nama: string;
  paturunan_persen: number | null;
  nyada_sejak?: string | null;
  paturunan_persen_sebelum_nyada?: number | null;
  nyada_sampai?: string | null;
  paturunan_persen_nyada?: number | null;
  tagihan?: number;
  /** Total pembayaran wajib (bukan punia). */
  dibayar?: number;
  punia?: number;
  sisa?: number;
  lunas?: boolean;
  peringatan_telat?: boolean;
  masa_berlaku_tahun?: number | null;
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  tempek_nama?: string | null;
  tempek_created_at?: string | null;
  arahan_nama?: string | null;
  arahan_created_at?: string | null;
  nomor_kontak?: string | null;
  status_pipil: string;
  tanggal_terdaftar: string;
};

export type PaturunanJenisRingkasan = {
  jenis_id: string;
  jenis_nama: string;
  paturunan_persen: number;
  jumlah_krama: number;
};

export type PaturunanRingkasan = {
  totalMipilAktif: number;
  perJenis: PaturunanJenisRingkasan[];
};

export type RingkasanIuranPerJenis = {
  jenis_id: string;
  jenis_nama: string;
  paturunan_persen: number;
  jumlah_krama: number;
  total_tagihan: number;
};

export type RingkasanIuran = {
  iuran_id: string;
  iuran_nama: string;
  nominal: number;
  tanggal_target?: string | null;
  lewat_target: boolean;
  jumlah_belum_lunas_telat: number;
  total_krama: number;
  total_tagihan: number;
  total_dibayar_wajib: number;
  total_punia: number;
  total_sisa: number;
  perJenis: RingkasanIuranPerJenis[];
};

export type PeringatanIuranItem = {
  iuran_id: string;
  iuran_nama: string;
  tanggal_target: string;
  jumlah_belum_lunas: number;
};

export async function countBelumLunasTelat(iuranId: string): Promise<number> {
  const iuran = await getIuranPaturunan(iuranId);
  if (!iuran || !isPastTanggalTarget(iuran.tanggal_target)) return 0;

  const rows = await listKramaPaturunan({ iuranId });
  return rows.filter((r) => r.peringatan_telat).length;
}

export async function listPeringatanIuranAktif(): Promise<PeringatanIuranItem[]> {
  const iuranList = await listIuranPaturunan();
  const items: PeringatanIuranItem[] = [];

  for (const iuran of iuranList) {
    const target = iuran.tanggal_target?.trim();
    if (!target || !isPastTanggalTarget(target)) continue;
    const jumlah = await countBelumLunasTelat(iuran.id);
    if (jumlah > 0) {
      items.push({
        iuran_id: iuran.id,
        iuran_nama: iuran.nama,
        tanggal_target: target,
        jumlah_belum_lunas: jumlah,
      });
    }
  }

  return items;
}

export async function getPaturunanRingkasan(): Promise<PaturunanRingkasan> {
  const db = await getDb();
  const perJenis = await db.select<PaturunanJenisRingkasan[]>(
    `SELECT jm.id as jenis_id, jm.nama as jenis_nama, jm.paturunan_persen,
            (SELECT COUNT(*) FROM krama k
             INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
             WHERE k.jenis_krama_mipil_id = jm.id AND k.status_krama = 'aktif') as jumlah_krama
     FROM jenis_krama_mipil jm
     WHERE jm.aktif = 1
     ORDER BY jm.nama ASC`
  );

  const totalRow = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     WHERE kk.kode = 'MIPIL' AND k.status_krama = 'aktif'`
  );

  return {
    totalMipilAktif: totalRow[0]?.c ?? 0,
    perJenis: perJenis.map((j) => ({
      ...j,
      jumlah_krama: Number(j.jumlah_krama) || 0,
      paturunan_persen: Number(j.paturunan_persen) || 0,
    })),
  };
}

export async function getRingkasanIuran(iuranId: string): Promise<RingkasanIuran | null> {
  const iuran = await getIuranPaturunan(iuranId);
  if (!iuran) return null;

  const nominal = Number(iuran.nominal) || 0;
  const ringkasan = await getPaturunanRingkasan();
  const rows = await listKramaPaturunan({ iuranId });
  const tagihanPerJenis = new Map<string, number>();
  for (const r of rows) {
    if (!r.jenis_id) continue;
    tagihanPerJenis.set(r.jenis_id, (tagihanPerJenis.get(r.jenis_id) ?? 0) + (r.tagihan ?? 0));
  }
  const perJenis: RingkasanIuranPerJenis[] = ringkasan.perJenis.map((j) => ({
    jenis_id: j.jenis_id,
    jenis_nama: j.jenis_nama,
    paturunan_persen: j.paturunan_persen,
    jumlah_krama: j.jumlah_krama,
    total_tagihan: tagihanPerJenis.get(j.jenis_id) ?? 0,
  }));

  const total_tagihan = rows.reduce((sum, r) => sum + (r.tagihan ?? 0), 0);
  const total_dibayar_wajib = rows.reduce((sum, r) => sum + (r.dibayar ?? 0), 0);
  const total_punia = rows.reduce((sum, r) => sum + (r.punia ?? 0), 0);
  const total_sisa = rows.reduce((sum, r) => sum + (r.sisa ?? 0), 0);
  const jumlah_belum_lunas_telat = rows.filter((r) => r.peringatan_telat).length;

  return {
    iuran_id: iuran.id,
    iuran_nama: iuran.nama,
    nominal,
    tanggal_target: iuran.tanggal_target,
    lewat_target: isPastTanggalTarget(iuran.tanggal_target),
    jumlah_belum_lunas_telat,
    total_krama: ringkasan.totalMipilAktif,
    total_tagihan,
    total_dibayar_wajib,
    total_punia,
    total_sisa,
    perJenis,
  };
}

export async function listKramaPaturunan(params?: {
  banjarId?: string;
  tempekId?: string;
  jenisMipilId?: string;
  q?: string;
  iuranId?: string;
}): Promise<PaturunanKramaRow[]> {
  const db = await getDb();
  let sql = `
    SELECT k.id, k.nomor_kartu, k.nomor_kontak, k.status_pipil, k.tanggal_terdaftar,
           p.nama_lengkap as kepala_nama,
           k.jenis_krama_mipil_id as jenis_id,
           jm.nama as jenis_nama, jm.paturunan_persen, jm.masa_berlaku_tahun,
           k.nyada_sejak, jprev.paturunan_persen as paturunan_persen_sebelum_nyada,
           k.nyada_sampai, jny.paturunan_persen as paturunan_persen_nyada,
           k.banjar_id, b.nama as banjar_nama, b.kode as banjar_kode,
           tp.nama as tempek_nama, tp.created_at as tempek_created_at,
           ar.nama as arahan_nama, ar.created_at as arahan_created_at
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
    JOIN penduduk p ON p.id = k.kepala_penduduk_id
    LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
    LEFT JOIN jenis_krama_mipil jprev ON jprev.id = k.jenis_sebelum_nyada_id
    LEFT JOIN desa_adat d ON d.id = k.desa_adat_id
    LEFT JOIN jenis_krama_mipil jny ON jny.id = d.jenis_krama_mipil_id
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tempek tp ON tp.id = k.tempek_id
    LEFT JOIN arahan ar ON ar.id = k.arahan_id
    WHERE kk.kode = 'MIPIL' AND k.status_krama = 'aktif'
  `;
  const args: unknown[] = [];
  let n = 1;
  if (params?.banjarId) {
    sql += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId);
  }
  if (params?.tempekId) {
    sql += ` AND k.tempek_id = $${n++}`;
    args.push(params.tempekId);
  }
  if (params?.jenisMipilId) {
    sql += ` AND k.jenis_krama_mipil_id = $${n++}`;
    args.push(params.jenisMipilId);
  }
  if (params?.q) {
    const q = `%${params.q}%`;
    sql += ` AND (
      k.nomor_kartu LIKE $${n}
      OR p.nama_lengkap LIKE $${n + 1}
      OR EXISTS (
        SELECT 1
        FROM anggota_keluarga ak
        JOIN penduduk pm ON pm.id = ak.penduduk_id
        WHERE ak.krama_id = k.id
          AND ak.status = 'aktif'
          AND pm.nama_lengkap LIKE $${n + 2}
      )
    )`;
    args.push(q, q, q);
  }
  sql += ` ORDER BY b.kode ASC, COALESCE(tp.created_at, '') ASC, COALESCE(ar.created_at, '') ASC, k.nomor_kartu ASC`;

  const rows = await db.select<PaturunanKramaRow[]>(sql, args);

  let nominalIuran: number | null = null;
  let tanggalTarget: string | null = null;
  let totalsMap = new Map<string, { wajib: number; punia: number }>();
  if (params?.iuranId) {
    const iuran = await getIuranPaturunan(params.iuranId);
    nominalIuran = iuran ? Number(iuran.nominal) || 0 : null;
    tanggalTarget = iuran?.tanggal_target ?? null;
    totalsMap = await getPembayaranTotalsMap(params.iuranId);
  }

  const desa = await getDesaAdat();

  for (const row of rows) {
    row.nomor_kontak = row.nomor_kontak?.trim() || null;
    const stub: KramaDetail = {
      id: row.id,
      nomor_kartu: row.nomor_kartu,
      jenis_kartu: "NPK",
      klasifikasi_kode: "MIPIL",
      klasifikasi_nama: "Krama Mipil",
      gelar_kepala: "Pengarep",
      banjar_id: "",
      banjar_nama: row.banjar_nama,
      banjar_kode: "",
      masa_berlaku_tahun: row.masa_berlaku_tahun,
      tanggal_terdaftar: row.tanggal_terdaftar,
      status_krama: "aktif",
      status_pipil: row.status_pipil,
      status_pemasih: "aktif",
      kepala: { id: "", nama_lengkap: row.kepala_nama, jenis_kelamin: "" },
      anggota_aktif: [],
    };
    previewStatusIlikita(stub, desa);
    row.status_pipil = stub.status_pipil ?? row.status_pipil;

    if (nominalIuran != null) {
      const persen = resolvePersenPaturunanIuran({
        persen: row.paturunan_persen,
        persenSebelumNyada: row.paturunan_persen_sebelum_nyada,
        nyadaSejak: row.nyada_sejak,
        persenNyada: row.paturunan_persen_nyada,
        nyadaSampai: row.nyada_sampai,
        tanggalTarget,
      });
      const tagihan = hitungTagihanPaturunan(nominalIuran, persen);
      const totals = totalsMap.get(row.id) ?? { wajib: 0, punia: 0 };
      row.tagihan = tagihan;
      row.dibayar = totals.wajib;
      row.punia = totals.punia;
      row.sisa = hitungSisaPaturunan(tagihan, totals.wajib);
      row.lunas = isLunasPaturunan(tagihan, totals.wajib);
      row.peringatan_telat = isPeringatanTelat(tanggalTarget, tagihan, totals.wajib);
    }
  }

  return rows;
}

export { listBanjar };
