import bcrypt from "bcryptjs";
import { getDb } from "../db/client";

const PIN_RE = /^\d{4,8}$/;

export type KramaPortalStatus = {
  aktif: boolean;
  updated_at: string | null;
};

export function validatePortalPin(pin: string): string | null {
  if (!PIN_RE.test(pin)) return "PIN harus 4–8 digit angka";
  return null;
}

export async function getKramaPortalStatus(kramaId: string): Promise<KramaPortalStatus> {
  const db = await getDb();
  const rows = await db.select<{ aktif: number; updated_at: string }[]>(
    `SELECT aktif, updated_at FROM krama_portal WHERE krama_id = ?`,
    [kramaId]
  );
  const row = rows[0];
  if (!row) return { aktif: false, updated_at: null };
  return { aktif: row.aktif === 1, updated_at: row.updated_at };
}

export async function setKramaPortalPin(
  kramaId: string,
  pin: string,
  aktif = true
): Promise<void> {
  const err = validatePortalPin(pin);
  if (err) throw new Error(err);

  const hash = await bcrypt.hash(pin, 10);
  const now = new Date().toISOString();
  const db = await getDb();
  await db.execute(
    `INSERT INTO krama_portal (krama_id, password_hash, aktif, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(krama_id) DO UPDATE SET
       password_hash = excluded.password_hash,
       aktif = excluded.aktif,
       updated_at = excluded.updated_at`,
    [kramaId, hash, aktif ? 1 : 0, now]
  );
}

export async function setKramaPortalAktif(kramaId: string, aktif: boolean): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama_portal WHERE krama_id = ?`,
    [kramaId]
  );
  if ((rows[0]?.c ?? 0) === 0) {
    throw new Error("Portal belum diatur — set PIN terlebih dahulu");
  }
  await db.execute(
    `UPDATE krama_portal SET aktif = ?, updated_at = ? WHERE krama_id = ?`,
    [aktif ? 1 : 0, new Date().toISOString(), kramaId]
  );
}

export async function collectPortalAccountsForSync() {
  const db = await getDb();
  return db.select<
    { nomor_kartu: string; password_hash: string; aktif: number; updated_at: string }[]
  >(
    `SELECT k.nomor_kartu, kp.password_hash, kp.aktif, kp.updated_at
     FROM krama_portal kp
     JOIN krama k ON k.id = kp.krama_id
     WHERE k.status_krama = 'aktif'`
  );
}

export async function countActiveKramaForPortal(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama WHERE status_krama = 'aktif'`
  );
  return rows[0]?.c ?? 0;
}

export async function countKramaPortalConfigured(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c
     FROM krama_portal kp
     JOIN krama k ON k.id = kp.krama_id
     WHERE k.status_krama = 'aktif'`
  );
  return rows[0]?.c ?? 0;
}

/** Terapkan PIN yang sama ke semua krama berstatus aktif. */
export async function bulkSetPortalPinForActiveKrama(
  pin: string,
  opts?: { aktif?: boolean }
): Promise<{ updated: number }> {
  const pinErr = validatePortalPin(pin);
  if (pinErr) throw new Error(pinErr);

  const db = await getDb();
  const kramaRows = await db.select<{ id: string }[]>(
    `SELECT id FROM krama WHERE status_krama = 'aktif' ORDER BY nomor_kartu`
  );
  if (kramaRows.length === 0) return { updated: 0 };

  const hash = await bcrypt.hash(pin, 10);
  const now = new Date().toISOString();
  const aktif = opts?.aktif !== false ? 1 : 0;

  for (const row of kramaRows) {
    await db.execute(
      `INSERT INTO krama_portal (krama_id, password_hash, aktif, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(krama_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         aktif = excluded.aktif,
         updated_at = excluded.updated_at`,
      [row.id, hash, aktif, now]
    );
  }

  return { updated: kramaRows.length };
}
