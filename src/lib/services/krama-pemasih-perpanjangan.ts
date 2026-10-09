import { getDb } from "../db/client";
import {
  isKramaNonaktifTotal,
  tanggalBerlakuAkhirIso,
} from "../status-ilikita";
import type { KlasifikasiKode, KramaDetail } from "../types";
import { today } from "../utils";
import {
  insertPemasihPerpanjanganRiwayat,
  type PemasihPerpanjanganJenis,
} from "./pemasih-perpanjangan";
import { catatBiayaAdministrasiIlikita } from "./tarif-administrasi-ilikita";

export type PemasihPerpanjanganKrama = Pick<
  KramaDetail,
  | "id"
  | "nomor_kartu"
  | "klasifikasi_kode"
  | "masa_berlaku_tahun"
  | "tanggal_terdaftar"
  | "tanggal_berlaku_mulai_pemasih"
  | "anggota_aktif"
  | "kepala"
  | "status_krama"
> & { status_pemasih?: string | null };

/** Perpanjang Pemasih: masa berlaku baru dihitung dari tanggal perpanjangan. */
export async function applyPerpanjangPemasih(
  krama: PemasihPerpanjanganKrama,
  tanggalPerpanjangan: string,
  jenis: PemasihPerpanjanganJenis
): Promise<void> {
  const akhirSebelum = tanggalBerlakuAkhirIso(krama);
  const tgl = tanggalPerpanjangan.trim().slice(0, 10);

  let tarifNominal: number | null = null;
  let transaksiPemasukanId: string | null = null;
  if (jenis === "manual") {
    const biaya = await catatBiayaAdministrasiIlikita({
      jenis: "pemasih_perpanjangan",
      tanggal: tgl,
      keterangan: `Perpanjang Pemasih — ${krama.nomor_kartu}`,
    });
    if (biaya) {
      tarifNominal = biaya.nominal;
      transaksiPemasukanId = biaya.transaksiId;
    }
  }

  const db = await getDb();
  await db.execute(
    `UPDATE krama SET tanggal_berlaku_mulai_pemasih = $1, status_pemasih = 'aktif', updated_at = datetime('now') WHERE id = $2`,
    [tgl, krama.id]
  );
  await insertPemasihPerpanjanganRiwayat({
    kramaId: krama.id,
    nomorKartu: krama.nomor_kartu,
    tanggalPerpanjangan: tgl,
    tanggalBerlakuAkhirSebelum: akhirSebelum,
    jenis,
    tarifNominal,
    transaksiPemasukanId,
  });
  krama.tanggal_berlaku_mulai_pemasih = tgl;
  krama.status_pemasih = "aktif";

  const { tryAutoPushKrama } = await import("../sync/auto-push-krama");
  void tryAutoPushKrama(krama.id);
}

async function loadKramaUntukPerpanjangan(
  kramaId: string
): Promise<PemasihPerpanjanganKrama | null> {
  const db = await getDb();
  const rows = await db.select<
    (PemasihPerpanjanganKrama & { kepala_nama: string; jenis_kelamin: string })[]
  >(
    `SELECT k.id, k.nomor_kartu, k.tanggal_terdaftar, k.tanggal_berlaku_mulai_pemasih,
            k.status_krama, k.status_pemasih,
            kk.kode as klasifikasi_kode,
            COALESCE(jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun,
            p.nama_lengkap as kepala_nama, p.jenis_kelamin
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.id = $1`,
    [kramaId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    nomor_kartu: row.nomor_kartu,
    klasifikasi_kode: row.klasifikasi_kode as KlasifikasiKode,
    masa_berlaku_tahun: row.masa_berlaku_tahun,
    tanggal_terdaftar: row.tanggal_terdaftar,
    tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
    status_krama: row.status_krama,
    status_pemasih: row.status_pemasih,
    anggota_aktif: [],
    kepala: {
      id: "",
      nama_lengkap: row.kepala_nama,
      jenis_kelamin: row.jenis_kelamin,
    },
  };
}

export async function perpanjangPemasih(
  kramaId: string,
  tanggalPerpanjangan?: string
): Promise<void> {
  const existing = await loadKramaUntukPerpanjangan(kramaId);
  if (!existing) throw new Error("Krama tidak ditemukan");
  if (existing.klasifikasi_kode === "MIPIL") {
    throw new Error("Perpanjangan hanya untuk Pemasih (Krama Tamiu / Tamiu)");
  }
  if (isKramaNonaktifTotal(existing)) {
    throw new Error("Krama nonaktif — perpanjangan Pemasih tidak berlaku");
  }

  const tgl = (tanggalPerpanjangan?.trim() || today()).slice(0, 10);
  await applyPerpanjangPemasih(existing, tgl, "manual");
}
