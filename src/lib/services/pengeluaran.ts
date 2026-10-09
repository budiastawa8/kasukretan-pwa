import { parseIsoDateString } from "../date-iso";
import { parseJumlahPembayaran } from "../paturunan-hitung";
import { getDb } from "../db/client";
import type { TransaksiPengeluaranRow } from "../types";
import { uuid } from "../utils";
import { assertAkunTransaksional, isAkunInKelompokKasDudukan } from "./akun-keuangan";
import { assertPengeluaranKasDudukanAllowed } from "./kas-dudukan-alokasi";

export type PengeluaranPosInput = {
  posBiayaId: string;
  jumlah: number;
  keterangan?: string;
};

export async function listTransaksiPengeluaran(params?: {
  akunKeuanganId?: string;
  limit?: number;
}): Promise<TransaksiPengeluaranRow[]> {
  const db = await getDb();
  let sql = `
    SELECT t.*, a.nama as akun_keuangan_nama, u.nama as created_by_nama,
           (SELECT COALESCE(SUM(pp.jumlah), 0) FROM transaksi_pengeluaran_pos pp WHERE pp.transaksi_id = t.id) as total_jumlah,
           (SELECT GROUP_CONCAT(TRIM(pp.keterangan), ' ')
            FROM transaksi_pengeluaran_pos pp
            WHERE pp.transaksi_id = t.id
              AND TRIM(COALESCE(pp.keterangan, '')) != '') as pos_keterangan
    FROM transaksi_pengeluaran t
    JOIN akun_keuangan a ON a.id = t.akun_keuangan_id
    LEFT JOIN user u ON u.id = t.created_by
    WHERE 1=1
  `;
  const args: unknown[] = [];
  if (params?.akunKeuanganId) {
    sql += ` AND t.akun_keuangan_id = ?`;
    args.push(params.akunKeuanganId);
  }
  sql += ` ORDER BY t.tanggal DESC, t.created_at DESC`;
  if (params?.limit && params.limit > 0) {
    sql += ` LIMIT ?`;
    args.push(params.limit);
  }
  return db.select<TransaksiPengeluaranRow[]>(sql, args);
}

export async function getTransaksiPengeluaran(id: string): Promise<TransaksiPengeluaranRow | null> {
  const rows = await listTransaksiPengeluaran();
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const db = await getDb();
  const pos = await db.select<
    {
      id: string;
      transaksi_id: string;
      pos_biaya_id: string;
      pos_biaya_nama: string;
      jumlah: number;
      keterangan: string | null;
    }[]
  >(
    `SELECT pp.*, pb.nama as pos_biaya_nama
     FROM transaksi_pengeluaran_pos pp
     JOIN pos_biaya pb ON pb.id = pp.pos_biaya_id
     WHERE pp.transaksi_id = ?
     ORDER BY pp.id`,
    [id]
  );
  return {
    ...row,
    pos: pos.map((p) => ({
      id: p.id,
      transaksi_id: p.transaksi_id,
      pos_biaya_id: p.pos_biaya_id,
      pos_biaya_nama: p.pos_biaya_nama,
      jumlah: Math.round(Number(p.jumlah) || 0),
      keterangan: p.keterangan,
    })),
  };
}

export async function createTransaksiPengeluaran(params: {
  akunKeuanganId: string;
  tanggal: string;
  keterangan?: string;
  createdBy: string;
  pos: PengeluaranPosInput[];
}): Promise<string> {
  await assertAkunTransaksional(params.akunKeuanganId);

  const { tanggal, lines } = validatePengeluaranInput(params);

  if (await isAkunInKelompokKasDudukan(params.akunKeuanganId)) {
    await assertPengeluaranKasDudukanAllowed(params.akunKeuanganId, tanggal, lines);
  }

  const db = await getDb();
  const transaksiId = uuid();
  await db.execute(
    `INSERT INTO transaksi_pengeluaran (id, akun_keuangan_id, tanggal, keterangan, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [
      transaksiId,
      params.akunKeuanganId,
      tanggal,
      params.keterangan?.trim() || null,
      params.createdBy,
    ]
  );

  for (const line of lines) {
    await db.execute(
      `INSERT INTO transaksi_pengeluaran_pos (id, transaksi_id, pos_biaya_id, jumlah, keterangan)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), transaksiId, line.posBiayaId, line.jumlah, line.keterangan]
    );
  }

  return transaksiId;
}

function validatePengeluaranInput(params: {
  akunKeuanganId: string;
  tanggal: string;
  pos: PengeluaranPosInput[];
}): { tanggal: string; lines: { posBiayaId: string; jumlah: number; keterangan: string | null }[] } {
  if (!params.pos.length) throw new Error("Minimal satu pos biaya");

  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal tidak valid");

  const lines = params.pos.map((p) => {
    const jumlah = parseJumlahPembayaran(p.jumlah);
    if (jumlah <= 0) throw new Error("Jumlah pos biaya harus lebih dari 0");
    if (!p.posBiayaId?.trim()) throw new Error("Pos biaya wajib dipilih");
    return {
      posBiayaId: p.posBiayaId.trim(),
      jumlah,
      keterangan: p.keterangan?.trim() || null,
    };
  });

  return { tanggal, lines };
}

export async function updateTransaksiPengeluaran(
  id: string,
  params: {
    akunKeuanganId: string;
    tanggal: string;
    keterangan?: string;
    pos: PengeluaranPosInput[];
  }
): Promise<void> {
  await assertAkunTransaksional(params.akunKeuanganId);

  const db = await getDb();
  const existing = await db.select<{ id: string }[]>(
    `SELECT id FROM transaksi_pengeluaran WHERE id = ?`,
    [id]
  );
  if (!existing[0]) throw new Error("Transaksi pengeluaran tidak ditemukan");

  const { tanggal, lines } = validatePengeluaranInput(params);

  if (await isAkunInKelompokKasDudukan(params.akunKeuanganId)) {
    await assertPengeluaranKasDudukanAllowed(params.akunKeuanganId, tanggal, lines, id);
  }

  await db.execute(
    `UPDATE transaksi_pengeluaran
     SET akun_keuangan_id = ?, tanggal = ?, keterangan = ?
     WHERE id = ?`,
    [params.akunKeuanganId, tanggal, params.keterangan?.trim() || null, id]
  );

  await db.execute(`DELETE FROM transaksi_pengeluaran_pos WHERE transaksi_id = ?`, [id]);

  for (const line of lines) {
    await db.execute(
      `INSERT INTO transaksi_pengeluaran_pos (id, transaksi_id, pos_biaya_id, jumlah, keterangan)
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), id, line.posBiayaId, line.jumlah, line.keterangan]
    );
  }
}

export async function deleteTransaksiPengeluaran(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM transaksi_pengeluaran_pos WHERE transaksi_id = ?`, [id]);
  await db.execute(`DELETE FROM transaksi_pengeluaran WHERE id = ?`, [id]);
}
