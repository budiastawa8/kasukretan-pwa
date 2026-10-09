import { parseIsoDateString } from "../date-iso";
import { parseJumlahPembayaran } from "../paturunan-hitung";
import { getDb } from "../db/client";
import type { TransaksiTransferRow } from "../types";
import { uuid } from "../utils";
import { getAkunKeuangan, assertAkunTransaksional } from "./akun-keuangan";
import { getSaldoAkun } from "./buku-kas";

export async function listTransaksiTransfer(params?: {
  akunKeuanganId?: string;
  limit?: number;
}): Promise<TransaksiTransferRow[]> {
  const db = await getDb();
  let sql = `
    SELECT t.*,
           a_asal.nama as akun_asal_nama,
           a_tujuan.nama as akun_tujuan_nama,
           u.nama as created_by_nama
    FROM transaksi_transfer t
    JOIN akun_keuangan a_asal ON a_asal.id = t.akun_asal_id
    JOIN akun_keuangan a_tujuan ON a_tujuan.id = t.akun_tujuan_id
    LEFT JOIN user u ON u.id = t.created_by
    WHERE 1=1
  `;
  const args: unknown[] = [];
  if (params?.akunKeuanganId) {
    sql += ` AND (t.akun_asal_id = ? OR t.akun_tujuan_id = ?)`;
    args.push(params.akunKeuanganId, params.akunKeuanganId);
  }
  sql += ` ORDER BY t.tanggal DESC, t.created_at DESC`;
  if (params?.limit && params.limit > 0) {
    sql += ` LIMIT ?`;
    args.push(params.limit);
  }
  const rows = await db.select<TransaksiTransferRow[]>(sql, args);
  return rows.map((r) => ({
    ...r,
    jumlah: Math.round(Number(r.jumlah) || 0),
  }));
}

export async function getTransaksiTransfer(id: string): Promise<TransaksiTransferRow | null> {
  const rows = await listTransaksiTransfer();
  return rows.find((r) => r.id === id) ?? null;
}

async function saldoTersediaAkunAsal(akunAsalId: string, excludeTransferId?: string): Promise<number> {
  let saldo = await getSaldoAkun(akunAsalId);
  if (excludeTransferId) {
    const existing = await getTransaksiTransfer(excludeTransferId);
    if (existing?.akun_asal_id === akunAsalId) {
      saldo += existing.jumlah;
    }
  }
  return saldo;
}

function validateTransferInput(params: {
  akunAsalId: string;
  akunTujuanId: string;
  tanggal: string;
  jumlah: number;
}): { tanggal: string; jumlah: number } {
  const asal = params.akunAsalId?.trim();
  const tujuan = params.akunTujuanId?.trim();
  if (!asal || !tujuan) throw new Error("Akun asal dan tujuan wajib dipilih");
  if (asal === tujuan) throw new Error("Akun asal dan tujuan harus berbeda");

  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal tidak valid");

  const jumlah = parseJumlahPembayaran(params.jumlah);
  if (jumlah <= 0) throw new Error("Jumlah transfer harus lebih dari 0");

  return { tanggal, jumlah };
}

async function assertAkunTransfer(akunAsalId: string, akunTujuanId: string): Promise<void> {
  const [asal, tujuan] = await Promise.all([getAkunKeuangan(akunAsalId), getAkunKeuangan(akunTujuanId)]);
  if (!asal || asal.aktif !== 1) throw new Error("Akun asal tidak valid");
  if (!tujuan || tujuan.aktif !== 1) throw new Error("Akun tujuan tidak valid");
}

export async function createTransaksiTransfer(params: {
  akunAsalId: string;
  akunTujuanId: string;
  tanggal: string;
  jumlah: number;
  keterangan?: string;
  createdBy: string;
}): Promise<string> {
  const { tanggal, jumlah } = validateTransferInput(params);
  await assertAkunTransfer(params.akunAsalId, params.akunTujuanId);
  await assertAkunTransaksional(params.akunAsalId);
  await assertAkunTransaksional(params.akunTujuanId);

  const saldo = await saldoTersediaAkunAsal(params.akunAsalId);
  if (saldo < jumlah) {
    throw new Error(`Saldo akun asal tidak cukup (tersedia ${saldo.toLocaleString("id-ID")})`);
  }

  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO transaksi_transfer
      (id, akun_asal_id, akun_tujuan_id, jumlah, tanggal, keterangan, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      id,
      params.akunAsalId,
      params.akunTujuanId,
      jumlah,
      tanggal,
      params.keterangan?.trim() || null,
      params.createdBy,
    ]
  );
  return id;
}

export async function updateTransaksiTransfer(
  id: string,
  params: {
    akunAsalId: string;
    akunTujuanId: string;
    tanggal: string;
    jumlah: number;
    keterangan?: string;
  }
): Promise<void> {
  const db = await getDb();
  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM transaksi_transfer WHERE id = ?`,
    [id]
  );
  if (!existing[0]) throw new Error("Transaksi transfer tidak ditemukan");

  const { tanggal, jumlah } = validateTransferInput(params);
  await assertAkunTransfer(params.akunAsalId, params.akunTujuanId);
  await assertAkunTransaksional(params.akunAsalId);
  await assertAkunTransaksional(params.akunTujuanId);

  const saldo = await saldoTersediaAkunAsal(params.akunAsalId, id);
  if (saldo < jumlah) {
    throw new Error(`Saldo akun asal tidak cukup (tersedia ${saldo.toLocaleString("id-ID")})`);
  }

  await db.execute(
    `UPDATE transaksi_transfer
     SET akun_asal_id = ?, akun_tujuan_id = ?, jumlah = ?, tanggal = ?, keterangan = ?
     WHERE id = ?`,
    [
      params.akunAsalId,
      params.akunTujuanId,
      jumlah,
      tanggal,
      params.keterangan?.trim() || null,
      id,
    ]
  );
}

export async function deleteTransaksiTransfer(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM transaksi_transfer WHERE id = ?`, [id]);
}
