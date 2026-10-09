import { getDb } from "../db/client";
import {
  buildPemasihPerhatianItem,
  kategoriPemasihPerhatian,
  type PemasihPerhatianFilter,
  type PemasihPerhatianItem,
} from "../pemasih-perhatian";
import { previewStatusIlikita } from "../status-ilikita";
import type { KlasifikasiKode, KramaDetail } from "../types";
import { getDesaAdat } from "./desa";

export { kategoriPemasihPerhatian };

type PemasihPerhatianRow = {
  id: string;
  nomor_kartu: string;
  jenis_kartu: string;
  klasifikasi_kode: string;
  klasifikasi_nama: string;
  kepala_nama: string;
  jenis_nama?: string | null;
  banjar_nama: string;
  tanggal_terdaftar: string;
  tanggal_berlaku_mulai_pemasih?: string | null;
  masa_berlaku_tahun?: number | null;
  status_pemasih?: string | null;
};

async function fetchPemasihUntukPerhatian(): Promise<PemasihPerhatianItem[]> {
  const db = await getDb();
  const rows = await db.select<PemasihPerhatianRow[]>(
    `SELECT k.id, k.nomor_kartu, k.jenis_kartu, k.tanggal_terdaftar, k.tanggal_berlaku_mulai_pemasih, k.status_pemasih,
            kk.kode as klasifikasi_kode, kk.nama_tampilan as klasifikasi_nama,
            p.nama_lengkap as kepala_nama,
            COALESCE(jkt.nama, jt.nama) as jenis_nama,
            COALESCE(jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun,
            b.nama as banjar_nama
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.status_krama = 'aktif' AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     ORDER BY k.nomor_kartu`
  );

  const desa = await getDesaAdat();
  const items: PemasihPerhatianItem[] = [];
  for (const row of rows) {
    const kode = row.klasifikasi_kode as KlasifikasiKode;
    const stub: KramaDetail = {
      id: row.id,
      nomor_kartu: row.nomor_kartu,
      jenis_kartu: row.jenis_kartu as KramaDetail["jenis_kartu"],
      klasifikasi_kode: kode,
      klasifikasi_nama: row.klasifikasi_nama,
      gelar_kepala: "",
      banjar_id: "",
      banjar_nama: row.banjar_nama,
      banjar_kode: "",
      masa_berlaku_tahun: row.masa_berlaku_tahun,
      tanggal_terdaftar: row.tanggal_terdaftar,
      tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
      status_krama: "aktif",
      status_pemasih: row.status_pemasih,
      kepala: { id: "", nama_lengkap: row.kepala_nama, jenis_kelamin: "" },
      jenis_nama: row.jenis_nama,
      anggota_aktif: [],
    };
    previewStatusIlikita(stub, desa);
    const detail = { ...stub, status_pemasih: stub.status_pemasih } as KramaDetail;
    const item = buildPemasihPerhatianItem(detail);
    if (item) items.push(item);
  }
  return items;
}

export async function getPemasihPerhatianRingkasan(): Promise<{
  tidakAktif: number;
  akanHabis: number;
}> {
  const items = await fetchPemasihUntukPerhatian();
  return {
    tidakAktif: items.filter((i) => i.alasan === "tidak_aktif").length,
    akanHabis: items.filter((i) => i.alasan === "akan_habis").length,
  };
}

export async function listPemasihPerhatian(
  filter?: PemasihPerhatianFilter
): Promise<PemasihPerhatianItem[]> {
  const items = await fetchPemasihUntukPerhatian();
  if (!filter) return items;
  return items.filter((i) => i.alasan === filter);
}
