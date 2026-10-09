import { getDb } from "../db/client";
import { parseNominalIuran, parseTanggalTarget } from "../paturunan-hitung";
import type { IuranPaturunanRow } from "../types";
import { uuid } from "../utils";

function requireNama(nama: string): string {
  const trimmed = nama.trim();
  if (!trimmed) throw new Error("Nama iuran wajib diisi");
  return trimmed;
}

export async function listIuranPaturunan(): Promise<IuranPaturunanRow[]> {
  const db = await getDb();
  return db.select<IuranPaturunanRow[]>(
    `SELECT * FROM iuran_paturunan WHERE aktif = 1 ORDER BY created_at DESC, nama ASC`
  );
}

export async function getIuranPaturunan(id: string): Promise<IuranPaturunanRow | null> {
  const db = await getDb();
  const rows = await db.select<IuranPaturunanRow[]>(
    `SELECT * FROM iuran_paturunan WHERE id = $1 AND aktif = 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createIuranPaturunan(
  nama: string,
  nominal: number,
  tanggalTarget: string,
  keterangan?: string
): Promise<string> {
  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO iuran_paturunan (id, nama, nominal, tanggal_target, keterangan, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, datetime('now'), datetime('now'))`,
    [
      id,
      requireNama(nama),
      parseNominalIuran(nominal),
      parseTanggalTarget(tanggalTarget),
      keterangan?.trim() || null,
    ]
  );
  return id;
}

export async function updateIuranPaturunan(
  id: string,
  nama: string,
  nominal: number,
  tanggalTarget: string,
  keterangan?: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE iuran_paturunan SET
      nama = $1, nominal = $2, tanggal_target = $3, keterangan = $4, updated_at = datetime('now')
     WHERE id = $5`,
    [
      requireNama(nama),
      parseNominalIuran(nominal),
      parseTanggalTarget(tanggalTarget),
      keterangan?.trim() || null,
      id,
    ]
  );
}

export async function deleteIuranPaturunan(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE iuran_paturunan SET aktif = 0, updated_at = datetime('now') WHERE id = $1`,
    [id]
  );
}
