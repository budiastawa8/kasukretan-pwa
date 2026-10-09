import { getDb } from "../db/client";
import type { TarifAdministrasiIlikitaJenis, TarifAdministrasiIlikitaRow } from "../types";
import { isChargeBiayaAdminPemasih } from "../ilikita-kebijakan";
import {
  assertAkunForDanaKasukretanLainnya,
  getDefaultAkunDanaKasukretanLainnyaId,
} from "./akun-keuangan";
import { getDesaAdat } from "./desa";
import { createTransaksiPemasukan } from "./pemasukan";
import { getPosBiayaAdminPemasihId } from "./pos-dana-kasukretan";

export type { TarifAdministrasiIlikitaJenis };

const PEMASIH_JENIS: TarifAdministrasiIlikitaJenis[] = [
  "pemasih_terbit_baru",
  "pemasih_perpanjangan",
];

export const TARIF_ADMIN_ILIKITA_LABELS: Record<TarifAdministrasiIlikitaJenis, string> = {
  ipma_terbit_baru: "IPMA — Pendaftaran / Terbit Baru",
  ipma_perpanjangan: "IPMA — Perpanjangan Tahunan",
  pemasih_terbit_baru: "Pemasih — Pendaftaran / Terbit Baru",
  pemasih_perpanjangan: "Pemasih — Perpanjangan",
};

export async function listTarifAdministrasiIlikita(): Promise<TarifAdministrasiIlikitaRow[]> {
  const db = await getDb();
  return db.select<TarifAdministrasiIlikitaRow[]>(
    `SELECT jenis, nominal, updated_at FROM tarif_administrasi_ilikita ORDER BY jenis`
  );
}

export async function getTarifAdministrasiIlikita(
  jenis: TarifAdministrasiIlikitaJenis
): Promise<TarifAdministrasiIlikitaRow> {
  const db = await getDb();
  const rows = await db.select<TarifAdministrasiIlikitaRow[]>(
    `SELECT jenis, nominal, updated_at FROM tarif_administrasi_ilikita WHERE jenis = ?`,
    [jenis]
  );
  if (!rows[0]) throw new Error("Tarif administrasi tidak ditemukan");
  return rows[0];
}

export async function updateTarifAdministrasiIlikita(
  jenis: TarifAdministrasiIlikitaJenis,
  nominal: number
): Promise<void> {
  const n = Number(nominal);
  if (!Number.isFinite(n) || n < 0) throw new Error("Nominal tarif tidak valid");
  const db = await getDb();
  await db.execute(
    `UPDATE tarif_administrasi_ilikita SET nominal = ?, updated_at = datetime('now') WHERE jenis = ?`,
    [Math.round(n), jenis]
  );
}

export async function shouldChargeBiayaAdmin(
  jenis: TarifAdministrasiIlikitaJenis
): Promise<{ charge: boolean; nominal: number }> {
  const tarif = await getTarifAdministrasiIlikita(jenis);
  const nominal = Math.round(Number(tarif.nominal) || 0);
  if (nominal <= 0) return { charge: false, nominal: 0 };

  if (PEMASIH_JENIS.includes(jenis)) {
    const desa = await getDesaAdat();
    if (!isChargeBiayaAdminPemasih(desa)) return { charge: false, nominal: 0 };
  }

  return { charge: true, nominal };
}

export async function catatBiayaAdministrasiIlikita(params: {
  jenis: TarifAdministrasiIlikitaJenis;
  tanggal: string;
  keterangan: string;
  nominal?: number;
}): Promise<{ transaksiId: string; akunId: string; nominal: number } | null> {
  const { charge, nominal: tarifNominal } = await shouldChargeBiayaAdmin(params.jenis);
  const nominal = params.nominal != null ? Math.round(params.nominal) : tarifNominal;
  if (!charge || nominal <= 0) return null;

  const akunId = await getDefaultAkunDanaKasukretanLainnyaId();
  await assertAkunForDanaKasukretanLainnya(akunId);
  const posId = await getPosBiayaAdminPemasihId();

  const transaksiId = await createTransaksiPemasukan({
    akunKeuanganId: akunId,
    tanggal: params.tanggal.slice(0, 10),
    keterangan: params.keterangan.trim(),
    pos: [{ posPemasukanId: posId, jumlah: nominal }],
  });

  return { transaksiId, akunId, nominal };
}
