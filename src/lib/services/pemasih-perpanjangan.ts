import { getDb } from "../db/client";
import type { DesaAdat } from "../types";
import { uuid } from "../utils";
import { DESA_ADAT_UPDATED_EVENT, getDesaAdat } from "./desa";

export type PemasihPerpanjanganJenis = "manual" | "otomatis";

export type PemasihPerpanjanganRiwayatRow = {
  id: string;
  krama_id: string;
  nomor_kartu: string;
  tanggal_perpanjangan: string;
  tanggal_berlaku_akhir_sebelum: string | null;
  jenis: PemasihPerpanjanganJenis;
  created_at: string;
  nama_kepala?: string;
};

export async function insertPemasihPerpanjanganRiwayat(input: {
  kramaId: string;
  nomorKartu: string;
  tanggalPerpanjangan: string;
  tanggalBerlakuAkhirSebelum: string | null;
  jenis: PemasihPerpanjanganJenis;
  tarifNominal?: number | null;
  transaksiPemasukanId?: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO pemasih_perpanjangan_riwayat (
      id, krama_id, nomor_kartu, tanggal_perpanjangan, tanggal_berlaku_akhir_sebelum, jenis,
      tarif_nominal, transaksi_pemasukan_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      input.kramaId,
      input.nomorKartu,
      input.tanggalPerpanjangan.slice(0, 10),
      input.tanggalBerlakuAkhirSebelum?.slice(0, 10) ?? null,
      input.jenis,
      input.tarifNominal ?? null,
      input.transaksiPemasukanId ?? null,
    ]
  );
}

export async function listPemasihPerpanjanganRiwayat(
  limit = 100
): Promise<PemasihPerpanjanganRiwayatRow[]> {
  const db = await getDb();
  return db.select<PemasihPerpanjanganRiwayatRow[]>(
    `SELECT r.*, p.nama_lengkap as nama_kepala
     FROM pemasih_perpanjangan_riwayat r
     JOIN krama k ON k.id = r.krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     ORDER BY r.created_at DESC
     LIMIT ?`,
    [limit]
  );
}

export async function updateDesaIlikitaKebijakan(input: {
  autoPerpanjangPemasih?: boolean;
  autoPerpanjangPemasihTamiu?: boolean;
  enforceMasaBerlakuPipil?: boolean;
  chargeBiayaAdminPemasih?: boolean;
}): Promise<DesaAdat> {
  const desa = await getDesaAdat();
  if (!desa) throw new Error("Data desa adat belum ada.");

  const autoVal =
    input.autoPerpanjangPemasih !== undefined ? (input.autoPerpanjangPemasih ? 1 : 0) : null;
  const autoTamiuVal =
    input.autoPerpanjangPemasihTamiu !== undefined
      ? input.autoPerpanjangPemasihTamiu
        ? 1
        : 0
      : null;
  const enforceVal =
    input.enforceMasaBerlakuPipil !== undefined ? (input.enforceMasaBerlakuPipil ? 1 : 0) : null;
  const chargeVal =
    input.chargeBiayaAdminPemasih !== undefined ? (input.chargeBiayaAdminPemasih ? 1 : 0) : null;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (autoVal !== null) {
    sets.push("auto_perpanjang_pemasih = ?");
    params.push(autoVal);
  }
  if (autoTamiuVal !== null) {
    sets.push("auto_perpanjang_pemasih_tamiu = ?");
    params.push(autoTamiuVal);
  }
  if (enforceVal !== null) {
    sets.push("enforce_masa_berlaku_pipil = ?");
    params.push(enforceVal);
  }
  if (chargeVal !== null) {
    sets.push("charge_biaya_admin_pemasih = ?");
    params.push(chargeVal);
  }
  if (!sets.length) return desa;

  sets.push("updated_at = datetime('now')");
  params.push(desa.id);

  const db = await getDb();
  await db.execute(`UPDATE desa_adat SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await getDesaAdat();
  if (!updated) throw new Error("Gagal menyimpan kebijakan ilikita.");
  window.dispatchEvent(new CustomEvent(DESA_ADAT_UPDATED_EVENT));
  return updated;
}
