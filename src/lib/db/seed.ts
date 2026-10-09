import bcrypt from "bcryptjs";
import type Database from "../desktop/sql";
import { getDb } from "./client";
import { uuid } from "../utils";

/** Seed minimal setelah database dikosongkan (tanpa early return). */
export async function seedDatabaseAfterWipe(db?: Database): Promise<void> {
  const database = db ?? (await getDb());

  const mipilId = uuid();
  const kramaTamiuId = uuid();
  const tamiuId = uuid();

  await database.execute(
    `INSERT INTO klasifikasi_krama (id, kode, nama_tampilan, gelar_kepala, prefix_kartu) VALUES (?, 'MIPIL', 'Krama Mipil', 'Pengarep', 'NPK')`,
    [mipilId]
  );
  await database.execute(
    `INSERT INTO klasifikasi_krama (id, kode, nama_tampilan, gelar_kepala, prefix_kartu) VALUES (?, 'KRAMA_TAMIU', 'Krama Tamiu', 'Pengajeg', 'NPKT')`,
    [kramaTamiuId]
  );
  await database.execute(
    `INSERT INTO klasifikasi_krama (id, kode, nama_tampilan, gelar_kepala, prefix_kartu) VALUES (?, 'TAMIU', 'Tamiu', 'Pengajeg', 'NPT')`,
    [tamiuId]
  );

  const desaId = uuid();
  await database.execute(
    `INSERT INTO desa_adat (id, kode_kabupaten, nama_kabupaten, kode_kecamatan, nama_kecamatan, kode_desa_adat, nama_desa_adat)
     VALUES (?, '', '', '', '', '', '')`,
    [desaId]
  );

  const hash = await bcrypt.hash("admin123", 10);
  await database.execute(
    `INSERT INTO user (id, username, password_hash, peran, nama, must_change_password)
     VALUES (?, 'admin', ?, 'admin', 'Administrator', 1)`,
    [uuid(), hash]
  );
}

export async function seedDatabase(): Promise<void> {
  const db = await getDb();

  const klasifikasi = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM klasifikasi_krama`
  );
  if (klasifikasi[0]?.c > 0) return;

  await seedDatabaseAfterWipe(db);
}
