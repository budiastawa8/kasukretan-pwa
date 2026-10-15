import type Database from "../desktop/sql";
import type { KlasifikasiKode } from "../types";
import { uuid } from "../utils";
import {
  isAnggotaGelarKepalaRow,
  isGelarKepalaStatus,
  statusPenggantiGelarKepala,
  statusSetelahCabutGelar,
} from "../status-keluarga";

const MASTER_TABLES_WITH_CREATED_AT = [
  "tempek",
  "arahan",
  "jenis_krama_mipil",
  "jenis_krama_tamiu",
  "jenis_tamiu",
] as const;

async function tableHasColumn(
  db: Database,
  table: string,
  column: string
): Promise<boolean> {
  const rows = await db.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}

async function addCreatedAtColumn(db: Database, table: string): Promise<void> {
  if (await tableHasColumn(db, table, "created_at")) return;

  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN created_at TEXT`);
  } catch {
    if (await tableHasColumn(db, table, "created_at")) return;
    throw new Error(`Gagal menambah kolom created_at pada tabel ${table}`);
  }

  await db.execute(
    `UPDATE ${table} SET created_at = datetime('now') WHERE created_at IS NULL OR created_at = ''`
  );
}

async function ensureAppSyncMetaTable(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS app_sync_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

async function isMigrationDone(db: Database, key: string): Promise<boolean> {
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = ?`,
    [key]
  );
  return rows[0]?.value === "1";
}

async function markMigrationDone(db: Database, key: string): Promise<void> {
  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES (?, '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key]
  );
}

async function migrateLegacyPemasihStatusKeluarga(db: Database): Promise<void> {
  if (await isMigrationDone(db, "migration_legacy_pemasih_status_v1")) return;
  await db.execute(
    `UPDATE anggota_keluarga SET status_keluarga = 'Saudara'
     WHERE lower(status_keluarga) = 'lainnya'
     AND krama_id IN (
       SELECT k.id FROM krama k
       INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     )`
  );
  await markMigrationDone(db, "migration_legacy_pemasih_status_v1");
}

async function migrateLegacyKepalaStatus(db: Database): Promise<void> {
  if (await isMigrationDone(db, "migration_legacy_kepala_status_v1")) return;
  await db.execute(
    `UPDATE anggota_keluarga SET status_keluarga = 'Pengarep'
     WHERE id IN (
       SELECT ak.id FROM anggota_keluarga ak
       INNER JOIN krama k ON k.id = ak.krama_id
       INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       WHERE kk.kode = 'MIPIL' AND lower(ak.status_keluarga) = 'kepala_keluarga'
     )`
  );
  await db.execute(
    `UPDATE anggota_keluarga SET status_keluarga = 'Pengajeg'
     WHERE id IN (
       SELECT ak.id FROM anggota_keluarga ak
       INNER JOIN krama k ON k.id = ak.krama_id
       INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU') AND lower(ak.status_keluarga) = 'kepala_keluarga'
     )`
  );
  await markMigrationDone(db, "migration_legacy_kepala_status_v1");
}

/** Pastikan hanya satu Pengarep/Pengajeg aktif per krama */
async function repairDuplicateGelarKepala(db: Database): Promise<void> {
  if (await isMigrationDone(db, "migration_repair_gelar_kepala_v1")) return;
  type AnggotaRow = {
    id: string;
    penduduk_id: string;
    status_keluarga: string;
    jenis_kelamin: string;
  };

  const kramas = await db.select<{ id: string; kepala_penduduk_id: string; kode: string }[]>(
    `SELECT k.id, k.kepala_penduduk_id, kk.kode
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     WHERE k.status_krama = 'aktif'`
  );

  for (const k of kramas) {
    const kode = k.kode as KlasifikasiKode;
    const anggota = await db.select<AnggotaRow[]>(
      `SELECT ak.id, ak.penduduk_id, ak.status_keluarga, p.jenis_kelamin
       FROM anggota_keluarga ak
       JOIN penduduk p ON p.id = ak.penduduk_id
       WHERE ak.krama_id = $1 AND ak.status = 'aktif'`,
      [k.id]
    );

    const kepalaRows = anggota.filter((a) =>
      isAnggotaGelarKepalaRow(a.penduduk_id, a.status_keluarga, k.kepala_penduduk_id, kode)
    );
    if (!kepalaRows.length) continue;

    const primary =
      kepalaRows.find((a) => a.penduduk_id === k.kepala_penduduk_id) ?? kepalaRows[0];

    if (isGelarKepalaStatus(primary.status_keluarga, kode)) {
      await db.execute(`UPDATE anggota_keluarga SET status_keluarga = $1 WHERE id = $2`, [
        statusSetelahCabutGelar(primary.jenis_kelamin, kode),
        primary.id,
      ]);
    }

    for (const a of kepalaRows) {
      if (a.id === primary.id) continue;
      if (!isGelarKepalaStatus(a.status_keluarga, kode)) continue;
      await db.execute(`UPDATE anggota_keluarga SET status_keluarga = $1 WHERE id = $2`, [
        statusSetelahCabutGelar(a.jenis_kelamin, kode),
        a.id,
      ]);
    }

    await db.execute(
      `UPDATE krama SET kepala_penduduk_id = $1, updated_at = datetime('now') WHERE id = $2`,
      [primary.penduduk_id, k.id]
    );
  }

  // Koreksi status gelar yang salah klasifikasi (mis. Pengarep di Tamiu)
  const semua = await db.select<
    { ak_id: string; kode: string; status_keluarga: string; jenis_kelamin: string }[]
  >(
    `SELECT ak.id as ak_id, kk.kode, ak.status_keluarga, p.jenis_kelamin
     FROM anggota_keluarga ak
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN penduduk p ON p.id = ak.penduduk_id
     WHERE ak.status = 'aktif' AND k.status_krama = 'aktif'`
  );

  for (const row of semua) {
    const kode = row.kode as KlasifikasiKode;
    const s = row.status_keluarga.trim().toLowerCase();
    const salahKlasifikasi =
      (kode === "MIPIL" && s === "pengajeg") || (kode !== "MIPIL" && s === "pengarep");
    if (salahKlasifikasi) {
      await db.execute(`UPDATE anggota_keluarga SET status_keluarga = $1 WHERE id = $2`, [
        statusPenggantiGelarKepala(row.jenis_kelamin, kode),
        row.ak_id,
      ]);
      continue;
    }
    if (isGelarKepalaStatus(row.status_keluarga, kode)) {
      await db.execute(`UPDATE anggota_keluarga SET status_keluarga = $1 WHERE id = $2`, [
        statusSetelahCabutGelar(row.jenis_kelamin, kode),
        row.ak_id,
      ]);
    }
  }
  await markMigrationDone(db, "migration_repair_gelar_kepala_v1");
}

export async function runMasterDataMigrations(db: Database): Promise<void> {
  await ensureAppSyncMetaTable(db);
  for (const table of MASTER_TABLES_WITH_CREATED_AT) {
    await addCreatedAtColumn(db, table);
  }
  if (!(await tableHasColumn(db, "krama", "rt_btn"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN rt_btn TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "rt_btn"))) throw new Error("Gagal menambah kolom rt_btn");
    }
  }

  if (!(await tableHasColumn(db, "krama", "nomor_kontak"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN nomor_kontak TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "nomor_kontak"))) {
        throw new Error("Gagal menambah kolom nomor_kontak");
      }
    }
  }

  if (!(await tableHasColumn(db, "krama", "alasan_tidak_aktif"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN alasan_tidak_aktif TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "alasan_tidak_aktif"))) {
        throw new Error("Gagal menambah kolom alasan_tidak_aktif");
      }
    }
  }
  if (!(await tableHasColumn(db, "krama", "tanggal_tidak_aktif"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN tanggal_tidak_aktif TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "tanggal_tidak_aktif"))) {
        throw new Error("Gagal menambah kolom tanggal_tidak_aktif");
      }
    }
  }
  if (!(await tableHasColumn(db, "krama", "keterangan_tidak_aktif"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN keterangan_tidak_aktif TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "keterangan_tidak_aktif"))) {
        throw new Error("Gagal menambah kolom keterangan_tidak_aktif");
      }
    }
  }

  if (!(await tableHasColumn(db, "desa_adat", "jenis_umur_nyada"))) {
    try {
      await db.execute(`ALTER TABLE desa_adat ADD COLUMN jenis_umur_nyada INTEGER`);
    } catch {
      if (!(await tableHasColumn(db, "desa_adat", "jenis_umur_nyada"))) {
        throw new Error("Gagal menambah kolom jenis_umur_nyada");
      }
    }
  }
  if (!(await tableHasColumn(db, "desa_adat", "jenis_krama_mipil_id"))) {
    try {
      await db.execute(`ALTER TABLE desa_adat ADD COLUMN jenis_krama_mipil_id TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "desa_adat", "jenis_krama_mipil_id"))) {
        throw new Error("Gagal menambah kolom jenis_krama_mipil_id");
      }
    }
  }

  const nyadaCols: { table: string; name: string; ddl: string }[] = [
    { table: "desa_adat", name: "nyada_berlaku_mulai", ddl: "TEXT" },
    { table: "krama", name: "nyada_sejak", ddl: "TEXT" },
    { table: "krama", name: "jenis_sebelum_nyada_id", ddl: "TEXT" },
    { table: "krama", name: "keterangan_nyada", ddl: "TEXT" },
    { table: "krama", name: "nyada_sampai", ddl: "TEXT" },
    { table: "krama", name: "dapukan_batas", ddl: "TEXT" },
    { table: "krama", name: "balu_dapukan_sejak", ddl: "TEXT" },
    { table: "krama", name: "jenis_sebelum_cerai_id", ddl: "TEXT" },
    { table: "desa_adat", name: "krama_dapukan_aktif", ddl: "INTEGER NOT NULL DEFAULT 0" },
    { table: "desa_adat", name: "krama_dapukan_berlaku_mulai", ddl: "TEXT" },
    { table: "desa_adat", name: "batas_umur_dapukan", ddl: "INTEGER" },
    { table: "desa_adat", name: "jenis_dapukan_mipil_id", ddl: "TEXT" },
    { table: "desa_adat", name: "jenis_balu_dapukan_mipil_id", ddl: "TEXT" },
    { table: "desa_adat", name: "jenis_balu_nglintik_mipil_id", ddl: "TEXT" },
  ];
  for (const col of nyadaCols) {
    if (await tableHasColumn(db, col.table, col.name)) continue;
    try {
      await db.execute(`ALTER TABLE ${col.table} ADD COLUMN ${col.name} ${col.ddl}`);
    } catch {
      if (!(await tableHasColumn(db, col.table, col.name))) {
        throw new Error(`Gagal menambah kolom ${col.name}`);
      }
    }
  }
  if (!(await tableHasColumn(db, "krama", "alasan_nyada"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN alasan_nyada TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "alasan_nyada"))) {
        throw new Error("Gagal menambah kolom alasan_nyada");
      }
    }
    await db.execute(
      `UPDATE krama SET alasan_nyada = CASE WHEN nyada_sejak IS NOT NULL THEN 'umur' ELSE 'lama' END
       WHERE jenis_krama_mipil_id IS NOT NULL
         AND jenis_krama_mipil_id = (SELECT jenis_krama_mipil_id FROM desa_adat LIMIT 1)`
    );
  }

  const desaKetentuanMipilCols: { name: string; ddl: string }[] = [
    { name: "jenis_cerai_mati_mipil_id", ddl: "TEXT" },
    { name: "jenis_cerai_hidup_mipil_id", ddl: "TEXT" },
    { name: "yowana_umur_min", ddl: "INTEGER" },
    { name: "yowana_umur_max", ddl: "INTEGER" },
  ];
  for (const col of desaKetentuanMipilCols) {
    if (!(await tableHasColumn(db, "desa_adat", col.name))) {
      try {
        await db.execute(`ALTER TABLE desa_adat ADD COLUMN ${col.name} ${col.ddl}`);
      } catch {
        if (!(await tableHasColumn(db, "desa_adat", col.name))) {
          throw new Error(`Gagal menambah kolom ${col.name}`);
        }
      }
    }
  }

  if (!(await tableHasColumn(db, "desa_adat", "logo_mda_url"))) {
    try {
      await db.execute(`ALTER TABLE desa_adat ADD COLUMN logo_mda_url TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "desa_adat", "logo_mda_url"))) {
        throw new Error("Gagal menambah kolom logo_mda_url");
      }
    }
  }

  const prajuruCols = [
    "bandesa_nama",
    "bandesa_jabatan",
    "panyarikan_nama",
    "panyarikan_jabatan",
    "patengen_nama",
    "patengen_jabatan",
  ] as const;
  for (const col of prajuruCols) {
    if (!(await tableHasColumn(db, "desa_adat", col))) {
      try {
        await db.execute(`ALTER TABLE desa_adat ADD COLUMN ${col} TEXT`);
      } catch {
        if (!(await tableHasColumn(db, "desa_adat", col))) {
          throw new Error(`Gagal menambah kolom ${col}`);
        }
      }
    }
  }

  for (const col of ["bandesa_ttd_url", "call_center"] as const) {
    if (!(await tableHasColumn(db, "desa_adat", col))) {
      try {
        await db.execute(`ALTER TABLE desa_adat ADD COLUMN ${col} TEXT`);
      } catch {
        if (!(await tableHasColumn(db, "desa_adat", col))) {
          throw new Error(`Gagal menambah kolom ${col}`);
        }
      }
    }
  }

  if (!(await tableHasColumn(db, "penduduk", "foto_url"))) {
    try {
      await db.execute(`ALTER TABLE penduduk ADD COLUMN foto_url TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "penduduk", "foto_url"))) {
        throw new Error("Gagal menambah kolom foto_url pada penduduk");
      }
    }
  }

  const statusIlikitaCols = [
    { name: "status_pipil", defaultVal: "aktif" },
    { name: "status_pemasih", defaultVal: "aktif" },
  ] as const;
  for (const { name, defaultVal } of statusIlikitaCols) {
    if (!(await tableHasColumn(db, "krama", name))) {
      try {
        await db.execute(`ALTER TABLE krama ADD COLUMN ${name} TEXT DEFAULT '${defaultVal}'`);
        await db.execute(
          `UPDATE krama SET ${name} = '${defaultVal}' WHERE ${name} IS NULL OR ${name} = ''`
        );
      } catch {
        if (!(await tableHasColumn(db, "krama", name))) {
          throw new Error(`Gagal menambah kolom ${name} pada krama`);
        }
      }
    }
  }

  if (!(await tableHasColumn(db, "krama", "tanggal_berlaku_mulai_pemasih"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN tanggal_berlaku_mulai_pemasih TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "tanggal_berlaku_mulai_pemasih"))) {
        throw new Error("Gagal menambah kolom tanggal_berlaku_mulai_pemasih");
      }
    }
    await db.execute(
      `UPDATE krama SET tanggal_berlaku_mulai_pemasih = tanggal_terdaftar
       WHERE tanggal_berlaku_mulai_pemasih IS NULL
       AND klasifikasi_krama_id IN (
         SELECT id FROM klasifikasi_krama WHERE kode IN ('KRAMA_TAMIU', 'TAMIU')
       )`
    );
  }

  const jenisMasaBerlakuTables = [
    "jenis_krama_mipil",
    "jenis_krama_tamiu",
    "jenis_tamiu",
  ] as const;
  for (const table of jenisMasaBerlakuTables) {
    if (!(await tableHasColumn(db, table, "masa_berlaku_tahun"))) {
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN masa_berlaku_tahun INTEGER`);
      } catch {
        if (!(await tableHasColumn(db, table, "masa_berlaku_tahun"))) {
          throw new Error(`Gagal menambah kolom masa_berlaku_tahun pada ${table}`);
        }
      }
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tim_kasukretan (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      banjar_id TEXT NOT NULL REFERENCES banjar(id),
      jabatan TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS iuran_paturunan (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      nominal REAL NOT NULL,
      keterangan TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  if (!(await tableHasColumn(db, "iuran_paturunan", "tanggal_target"))) {
    try {
      await db.execute(`ALTER TABLE iuran_paturunan ADD COLUMN tanggal_target TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "iuran_paturunan", "tanggal_target"))) {
        throw new Error("Gagal menambah kolom tanggal_target pada iuran_paturunan");
      }
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS paturunan_lunas_krama (
      krama_id TEXT NOT NULL REFERENCES krama(id),
      iuran_id TEXT NOT NULL REFERENCES iuran_paturunan(id),
      lunas INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (krama_id, iuran_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS paturunan_pembayaran (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      iuran_id TEXT NOT NULL REFERENCES iuran_paturunan(id),
      jumlah REAL NOT NULL,
      tanggal TEXT NOT NULL,
      keterangan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  if (!(await tableHasColumn(db, "paturunan_pembayaran", "jenis"))) {
    try {
      await db.execute(
        `ALTER TABLE paturunan_pembayaran ADD COLUMN jenis TEXT NOT NULL DEFAULT 'wajib'`
      );
    } catch {
      if (!(await tableHasColumn(db, "paturunan_pembayaran", "jenis"))) {
        throw new Error("Gagal menambah kolom jenis pada paturunan_pembayaran");
      }
    }
    await db.execute(
      `UPDATE paturunan_pembayaran SET jenis = 'wajib' WHERE jenis IS NULL OR jenis = ''`
    );
  }

  if (!(await tableHasColumn(db, "paturunan_pembayaran", "petugas_id"))) {
    try {
      await db.execute(
        `ALTER TABLE paturunan_pembayaran ADD COLUMN petugas_id TEXT REFERENCES tim_kasukretan(id)`
      );
    } catch {
      if (!(await tableHasColumn(db, "paturunan_pembayaran", "petugas_id"))) {
        throw new Error("Gagal menambah kolom petugas_id pada paturunan_pembayaran");
      }
    }
  }

  const lunasLegacy = await db.select<
    { krama_id: string; iuran_id: string; nominal: number; paturunan_persen: number | null }[]
  >(
    `SELECT pl.krama_id, pl.iuran_id, i.nominal, jm.paturunan_persen
     FROM paturunan_lunas_krama pl
     JOIN iuran_paturunan i ON i.id = pl.iuran_id
     JOIN krama k ON k.id = pl.krama_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     WHERE pl.lunas = 1`
  );
  for (const row of lunasLegacy) {
    const persen = Number(row.paturunan_persen) || 0;
    const nominal = Number(row.nominal) || 0;
    const jumlah = Math.round((nominal * persen) / 100);
    if (jumlah <= 0) continue;
    const existing = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM paturunan_pembayaran
       WHERE krama_id = $1 AND iuran_id = $2`,
      [row.krama_id, row.iuran_id]
    );
    if ((existing[0]?.c ?? 0) > 0) continue;
    await db.execute(
      `INSERT INTO paturunan_pembayaran (id, krama_id, iuran_id, jenis, jumlah, tanggal, keterangan, created_at)
       VALUES ($1, $2, $3, 'wajib', $4, date('now'), $5, datetime('now'))`,
      [uuid(), row.krama_id, row.iuran_id, jumlah, "Migrasi status lunas"]
    );
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dudukan_pembayaran (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      tahun INTEGER NOT NULL,
      bulan INTEGER NOT NULL,
      jumlah REAL NOT NULL,
      tanggal TEXT NOT NULL,
      petugas_id TEXT REFERENCES tim_kasukretan(id),
      keterangan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_dudukan_pembayaran_periode
      ON dudukan_pembayaran (tahun, bulan, krama_id)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS dudukan_keringanan (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      tahun INTEGER NOT NULL,
      bulan INTEGER NOT NULL,
      jumlah REAL NOT NULL,
      tanggal TEXT NOT NULL,
      petugas_id TEXT REFERENCES tim_kasukretan(id),
      keterangan TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (krama_id, tahun, bulan)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_dudukan_keringanan_periode
      ON dudukan_keringanan (tahun, bulan, krama_id)
  `);

  await migrateLegacyKepalaStatus(db);
  await migrateLegacyPemasihStatusKeluarga(db);
  await repairDuplicateGelarKepala(db);

  await migrateStripPenomoranDash(db);
  await migrateBukuKas(db);
  await migrateTransferAkun(db);
  await migrateKramaPortal(db);
  await migratePemasukanLain(db);
  await migrateKasDudukanAlokasi(db);
  await migrateDudukanPembayaranJenisSnapshot(db);
  await migrateAkunKelompokSub(db);
  await migrateSubAkunNamaPrefix(db);
  await migrateKelompokUrutanTampilan(db);
  await migrateUserMustChangePassword(db);
  await migratePetugasAkun(db);
  await migrateSuratPenagihanDudukan(db);
  await migrateSuratPenagihanDudukanPerBulan(db);
  await migrateSuratKeteranganKrama(db);
  await migrateSuratKeteranganKramaAnggotaV2(db);
  await migrateSuratKeteranganPindah(db);
  await migrateIlikitaKebijakan(db);
  await migrateAutoPerpanjangPemasihTamiu(db);
  await migrateAutoPerpanjangPemasihPerJenis(db);
  await migrateLembagaBadanDanAdminIlikita(db);
  await migrateDanaPaturunanDudukanLabels(db);
  await migrateStaffRolesRbacV1(db);
  await migrateSetoranPetugas(db);
  await migrateUserTimKasukretan(db);
  await ensureRingkasanIndexes(db);
}

/** Index untuk query ringkasan dashboard/laporan (aman dijalankan ulang). */
async function ensureRingkasanIndexes(db: Database): Promise<void> {
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_krama_klasifikasi_status ON krama (klasifikasi_krama_id, status_krama)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_anggota_keluarga_krama_status ON anggota_keluarga (krama_id, status)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_paturunan_pembayaran_iuran_krama ON paturunan_pembayaran (iuran_id, krama_id)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_paturunan_pembayaran_tanggal ON paturunan_pembayaran (tanggal)`
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_dudukan_pembayaran_krama_periode ON dudukan_pembayaran (krama_id, tahun, bulan)`
  );
}

/** Akun peran petugas terikat ke satu nama di Tim Kasukretan. */
async function migrateUserTimKasukretan(db: Database): Promise<void> {
  if (await tableHasColumn(db, "user", "tim_kasukretan_id")) return;
  try {
    await db.execute(
      `ALTER TABLE user ADD COLUMN tim_kasukretan_id TEXT REFERENCES tim_kasukretan(id)`
    );
  } catch {
    if (!(await tableHasColumn(db, "user", "tim_kasukretan_id"))) {
      throw new Error("Gagal menambah kolom tim_kasukretan_id pada user");
    }
  }
}

async function migrateSetoranPetugas(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS setoran (
      id TEXT PRIMARY KEY,
      petugas_id TEXT REFERENCES tim_kasukretan(id),
      tanggal TEXT NOT NULL,
      total REAL NOT NULL,
      keterangan TEXT,
      diterima_oleh TEXT REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  for (const table of ["paturunan_pembayaran", "dudukan_pembayaran"] as const) {
    const cols = [
      { name: "setoran_id", ddl: "TEXT REFERENCES setoran(id)" },
      { name: "tanggal_setor", ddl: "TEXT" },
    ];
    for (const col of cols) {
      if (await tableHasColumn(db, table, col.name)) continue;
      try {
        await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.ddl}`);
      } catch {
        if (!(await tableHasColumn(db, table, col.name))) {
          throw new Error(`Gagal menambah kolom ${col.name} pada ${table}`);
        }
      }
    }
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_${table}_setoran ON ${table} (setoran_id)`
    );
    await db.execute(
      `CREATE INDEX IF NOT EXISTS idx_${table}_tanggal_setor ON ${table} (tanggal_setor)`
    );
  }

  // Sekali saja: pembayaran sebelum fitur setoran sudah tercatat di buku kas.
  if (await isMigrationDone(db, "migration_setoran_petugas_v1")) return;
  await db.execute(
    `UPDATE paturunan_pembayaran SET tanggal_setor = tanggal
     WHERE tanggal_setor IS NULL AND setoran_id IS NULL`
  );
  await db.execute(
    `UPDATE dudukan_pembayaran SET tanggal_setor = tanggal
     WHERE tanggal_setor IS NULL AND setoran_id IS NULL`
  );
  await markMigrationDone(db, "migration_setoran_petugas_v1");
}

async function migratePemasukanLain(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_pemasukan_lain_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pos_pemasukan (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      keterangan TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      urutan INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaksi_pemasukan (
      id TEXT PRIMARY KEY,
      akun_keuangan_id TEXT NOT NULL REFERENCES akun_keuangan(id),
      tanggal TEXT NOT NULL,
      keterangan TEXT,
      created_by TEXT REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaksi_pemasukan_pos (
      id TEXT PRIMARY KEY,
      transaksi_id TEXT NOT NULL REFERENCES transaksi_pemasukan(id) ON DELETE CASCADE,
      pos_pemasukan_id TEXT NOT NULL REFERENCES pos_pemasukan(id),
      jumlah REAL NOT NULL,
      keterangan TEXT
    )
  `);

  const posCount = await db.select<{ c: number }[]>(`SELECT COUNT(*) as c FROM pos_pemasukan`);
  if ((posCount[0]?.c ?? 0) === 0) {
    await db.execute(
      `INSERT INTO pos_pemasukan (id, nama, urutan) VALUES (?, 'Pendapatan lainnya', 1)`,
      [uuid()]
    );
  }

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_pemasukan_lain_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateKramaPortal(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS krama_portal (
      krama_id TEXT PRIMARY KEY REFERENCES krama(id) ON DELETE CASCADE,
      password_hash TEXT NOT NULL,
      aktif INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function migrateTransferAkun(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_transfer_akun_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaksi_transfer (
      id TEXT PRIMARY KEY,
      akun_asal_id TEXT NOT NULL REFERENCES akun_keuangan(id),
      akun_tujuan_id TEXT NOT NULL REFERENCES akun_keuangan(id),
      jumlah REAL NOT NULL,
      tanggal TEXT NOT NULL,
      keterangan TEXT,
      created_by TEXT REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (akun_asal_id != akun_tujuan_id)
    )
  `);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_transfer_akun_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateBukuKas(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_buku_kas_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS akun_keuangan (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      jenis TEXT NOT NULL,
      keterangan TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      urutan INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pos_biaya (
      id TEXT PRIMARY KEY,
      nama TEXT NOT NULL,
      keterangan TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      urutan INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaksi_pengeluaran (
      id TEXT PRIMARY KEY,
      akun_keuangan_id TEXT NOT NULL REFERENCES akun_keuangan(id),
      tanggal TEXT NOT NULL,
      keterangan TEXT,
      created_by TEXT REFERENCES user(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaksi_pengeluaran_pos (
      id TEXT PRIMARY KEY,
      transaksi_id TEXT NOT NULL REFERENCES transaksi_pengeluaran(id) ON DELETE CASCADE,
      pos_biaya_id TEXT NOT NULL REFERENCES pos_biaya(id),
      jumlah REAL NOT NULL,
      keterangan TEXT
    )
  `);

  if (!(await tableHasColumn(db, "paturunan_pembayaran", "akun_keuangan_id"))) {
    await db.execute(
      `ALTER TABLE paturunan_pembayaran ADD COLUMN akun_keuangan_id TEXT REFERENCES akun_keuangan(id)`
    );
  }
  if (!(await tableHasColumn(db, "dudukan_pembayaran", "akun_keuangan_id"))) {
    await db.execute(
      `ALTER TABLE dudukan_pembayaran ADD COLUMN akun_keuangan_id TEXT REFERENCES akun_keuangan(id)`
    );
  }

  const akunCount = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM akun_keuangan`
  );
  if ((akunCount[0]?.c ?? 0) === 0) {
    const kasDudukanId = uuid();
    const kasPaturunanId = uuid();
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan) VALUES (?, 'Dana Dudukan', 'kas_dudukan', 1)`,
      [kasDudukanId]
    );
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan) VALUES (?, 'Dana Paturunan', 'kas_paturunan', 2)`,
      [kasPaturunanId]
    );

    await db.execute(
      `UPDATE dudukan_pembayaran SET akun_keuangan_id = ? WHERE akun_keuangan_id IS NULL`,
      [kasDudukanId]
    );
    await db.execute(
      `UPDATE paturunan_pembayaran SET akun_keuangan_id = ? WHERE akun_keuangan_id IS NULL`,
      [kasPaturunanId]
    );
  } else {
    const kasD = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan WHERE jenis = 'kas_dudukan' AND aktif = 1 ORDER BY urutan LIMIT 1`
    );
    const kasP = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan WHERE jenis = 'kas_paturunan' AND aktif = 1 ORDER BY urutan LIMIT 1`
    );
    if (kasD[0]) {
      await db.execute(
        `UPDATE dudukan_pembayaran SET akun_keuangan_id = ? WHERE akun_keuangan_id IS NULL`,
        [kasD[0].id]
      );
    }
    if (kasP[0]) {
      await db.execute(
        `UPDATE paturunan_pembayaran SET akun_keuangan_id = ? WHERE akun_keuangan_id IS NULL`,
        [kasP[0].id]
      );
    }
  }

  const posCount = await db.select<{ c: number }[]>(`SELECT COUNT(*) as c FROM pos_biaya`);
  if ((posCount[0]?.c ?? 0) === 0) {
    const defaults = [
      "Operasional",
      "Perlengkapan",
      "Konsumsi",
      "Listrik & utilitas",
      "Lainnya",
    ];
    for (let i = 0; i < defaults.length; i++) {
      await db.execute(
        `INSERT INTO pos_biaya (id, nama, urutan) VALUES (?, ?, ?)`,
        [uuid(), defaults[i], i + 1]
      );
    }
  }

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_buku_kas_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateStripPenomoranDash(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_strip_penomoran_dash_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(
    `UPDATE krama SET nomor_kartu = REPLACE(nomor_kartu, '-', ''), updated_at = datetime('now')
     WHERE nomor_kartu LIKE '%-%'`
  );
  await db.execute(
    `UPDATE anggota_keluarga SET nika = REPLACE(nika, '-', '')
     WHERE nika IS NOT NULL AND nika LIKE '%-%'`
  );
  await db.execute(
    `UPDATE anggota_keluarga SET nrkt = REPLACE(nrkt, '-', '')
     WHERE nrkt IS NOT NULL AND nrkt LIKE '%-%'`
  );
  await db.execute(
    `UPDATE anggota_keluarga SET nrt = REPLACE(nrt, '-', '')
     WHERE nrt IS NOT NULL AND nrt LIKE '%-%'`
  );
  await db.execute(
    `UPDATE krama_riwayat_klasifikasi SET nomor_kartu_lama = REPLACE(nomor_kartu_lama, '-', '')
     WHERE nomor_kartu_lama IS NOT NULL AND nomor_kartu_lama LIKE '%-%'`
  );
  await db.execute(
    `UPDATE krama_riwayat_klasifikasi SET nomor_kartu_baru = REPLACE(nomor_kartu_baru, '-', '')
     WHERE nomor_kartu_baru IS NOT NULL AND nomor_kartu_baru LIKE '%-%'`
  );

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_strip_penomoran_dash_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateKasDudukanAlokasi(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_kas_dudukan_alokasi_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS kas_dudukan_alokasi (
      id TEXT PRIMARY KEY,
      pos_biaya_id TEXT NOT NULL UNIQUE REFERENCES pos_biaya(id),
      persen REAL NOT NULL,
      urutan INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const { seedKasDudukanAlokasiIfEmpty } = await import("../services/kas-dudukan-alokasi");
  await seedKasDudukanAlokasiIfEmpty(db);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_kas_dudukan_alokasi_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateDudukanPembayaranJenisSnapshot(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_dudukan_jenis_snapshot_v1'`
  );
  if (done[0]?.value === "1") return;

  if (!(await tableHasColumn(db, "dudukan_pembayaran", "jenis_krama_tamiu_id"))) {
    await db.execute(
      `ALTER TABLE dudukan_pembayaran ADD COLUMN jenis_krama_tamiu_id TEXT REFERENCES jenis_krama_tamiu(id)`
    );
  }
  if (!(await tableHasColumn(db, "dudukan_pembayaran", "jenis_tamiu_id"))) {
    await db.execute(
      `ALTER TABLE dudukan_pembayaran ADD COLUMN jenis_tamiu_id TEXT REFERENCES jenis_tamiu(id)`
    );
  }
  if (!(await tableHasColumn(db, "dudukan_pembayaran", "jenis_nama"))) {
    await db.execute(`ALTER TABLE dudukan_pembayaran ADD COLUMN jenis_nama TEXT`);
  }

  await db.execute(`
    UPDATE dudukan_pembayaran SET
      jenis_krama_tamiu_id = (
        SELECT k.jenis_krama_tamiu_id FROM krama k WHERE k.id = dudukan_pembayaran.krama_id
      ),
      jenis_tamiu_id = (
        SELECT k.jenis_tamiu_id FROM krama k WHERE k.id = dudukan_pembayaran.krama_id
      ),
      jenis_nama = COALESCE(
        (SELECT jt.nama FROM krama k
         JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
         WHERE k.id = dudukan_pembayaran.krama_id),
        (SELECT jkt.nama FROM krama k
         JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
         WHERE k.id = dudukan_pembayaran.krama_id)
      )
    WHERE jenis_nama IS NULL OR TRIM(jenis_nama) = ''
  `);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_dudukan_jenis_snapshot_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateAkunKelompokSub(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_akun_kelompok_v1'`
  );
  if (done[0]?.value === "1") return;

  if (!(await tableHasColumn(db, "akun_keuangan", "parent_akun_id"))) {
    await db.execute(
      `ALTER TABLE akun_keuangan ADD COLUMN parent_akun_id TEXT REFERENCES akun_keuangan(id)`
    );
  }
  if (!(await tableHasColumn(db, "akun_keuangan", "is_kelompok"))) {
    await db.execute(`ALTER TABLE akun_keuangan ADD COLUMN is_kelompok INTEGER NOT NULL DEFAULT 0`);
  }

  for (const jenis of ["kas_dudukan", "kas_paturunan"] as const) {
    const kelompokExisting = await db.select<{ id: string }[]>(
      `SELECT id FROM akun_keuangan WHERE jenis = ? AND is_kelompok = 1 LIMIT 1`,
      [jenis]
    );
    if (kelompokExisting[0]) continue;

    const label = jenis === "kas_dudukan" ? "Dana Dudukan" : "Dana Paturunan";
    const roots = await db.select<{ id: string; nama: string; urutan: number }[]>(
      `SELECT id, nama, urutan FROM akun_keuangan
       WHERE jenis = ? AND COALESCE(is_kelompok, 0) = 0
         AND (parent_akun_id IS NULL OR TRIM(parent_akun_id) = '')
       ORDER BY urutan, created_at`,
      [jenis]
    );
    if (roots.length === 0) continue;

    const tunai = roots[0];
    const groupId = uuid();
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, created_at)
       VALUES (?, ?, ?, ?, 1, datetime('now'))`,
      [groupId, label, jenis, tunai.urutan]
    );

    const tunaiNama = tunai.nama.trim() === label ? `${label} — Tunai` : tunai.nama;
    await db.execute(
      `UPDATE akun_keuangan SET parent_akun_id = ?, nama = ?, is_kelompok = 0 WHERE id = ?`,
      [groupId, tunaiNama, tunai.id]
    );

    for (const extra of roots.slice(1)) {
      await db.execute(`UPDATE akun_keuangan SET parent_akun_id = ? WHERE id = ?`, [
        groupId,
        extra.id,
      ]);
    }
  }

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_akun_kelompok_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateSubAkunNamaPrefix(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_sub_akun_nama_prefix_v1'`
  );
  if (done[0]?.value === "1") return;

  const subs = await db.select<{ id: string; nama: string; parent_akun_id: string }[]>(
    `SELECT id, nama, parent_akun_id FROM akun_keuangan
     WHERE parent_akun_id IS NOT NULL AND TRIM(parent_akun_id) != ''
       AND COALESCE(is_kelompok, 0) = 0`
  );

  for (const sub of subs) {
    const parent = await db.select<{ nama: string }[]>(
      `SELECT nama FROM akun_keuangan WHERE id = ? LIMIT 1`,
      [sub.parent_akun_id]
    );
    const parentNama = parent[0]?.nama?.trim();
    if (!parentNama) continue;

    const short = sub.nama.trim();
    const escaped = parentNama.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefixRe = new RegExp(`^${escaped}\\s*[—–-]\\s*`, "i");
    const baru = prefixRe.test(short) ? short : `${parentNama} - ${short}`;
    if (baru !== sub.nama) {
      await db.execute(`UPDATE akun_keuangan SET nama = ? WHERE id = ?`, [baru, sub.id]);
    }
  }

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_sub_akun_nama_prefix_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateKelompokUrutanTampilan(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_kelompok_urutan_tampilan_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(
    `UPDATE akun_keuangan SET urutan = 1 WHERE jenis = 'kas_paturunan' AND COALESCE(is_kelompok, 0) = 1`
  );
  await db.execute(
    `UPDATE akun_keuangan SET urutan = 2 WHERE jenis = 'kas_dudukan' AND COALESCE(is_kelompok, 0) = 1`
  );

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_kelompok_urutan_tampilan_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateUserMustChangePassword(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_user_must_change_password_v1'`
  );
  if (done[0]?.value === "1") return;

  if (!(await tableHasColumn(db, "user", "must_change_password"))) {
    await db.execute(
      `ALTER TABLE user ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`
    );
  }

  const bcrypt = await import("bcryptjs");
  const users = await db.select<{ id: string; password_hash: string }[]>(
    `SELECT id, password_hash FROM user`
  );
  for (const u of users) {
    const isDefault = await bcrypt.compare("admin123", u.password_hash);
    if (isDefault) {
      await db.execute(`UPDATE user SET must_change_password = 1 WHERE id = ?`, [u.id]);
    }
  }

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_user_must_change_password_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migratePetugasAkun(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS petugas_akun (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      tim_kasukretan_id TEXT NOT NULL REFERENCES tim_kasukretan(id),
      nama TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function migrateSuratPenagihanDudukan(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_surat_penagihan_dudukan_v1'`
  );
  if (done[0]?.value === "1") return;

  const desaCols: { name: string; ddl: string }[] = [
    { name: "panyarikan_ttd_url", ddl: "TEXT" },
    { name: "pararem_nomor", ddl: "TEXT" },
    { name: "pararem_tahun", ddl: "TEXT" },
    { name: "pararem_judul", ddl: "TEXT" },
  ];
  for (const col of desaCols) {
    if (!(await tableHasColumn(db, "desa_adat", col.name))) {
      try {
        await db.execute(`ALTER TABLE desa_adat ADD COLUMN ${col.name} ${col.ddl}`);
      } catch {
        if (!(await tableHasColumn(db, "desa_adat", col.name))) {
          throw new Error(`Gagal menambah kolom ${col.name} pada desa_adat`);
        }
      }
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS penomoran_sp_counter (
      id TEXT PRIMARY KEY,
      desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
      tahun INTEGER NOT NULL,
      urutan_terakhir INTEGER NOT NULL DEFAULT 0,
      UNIQUE(desa_adat_id, tahun)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS surat_penagihan_dudukan (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      nomor_surat TEXT NOT NULL UNIQUE,
      tahun INTEGER NOT NULL,
      bulan_terbit INTEGER NOT NULL,
      tanggal_terbit TEXT NOT NULL,
      tunggakan_bulan INTEGER NOT NULL,
      total_sisa REAL NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(krama_id, tahun, bulan_terbit)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_surat_penagihan_krama_tahun_bulan
      ON surat_penagihan_dudukan (krama_id, tahun, bulan_terbit)
  `);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_surat_penagihan_dudukan_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateSuratPenagihanDudukanPerBulan(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_surat_penagihan_dudukan_v2'`
  );
  if (done[0]?.value === "1") return;

  const ddl = await db.select<{ sql: string | null }[]>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'surat_penagihan_dudukan'`
  );
  const sql = ddl[0]?.sql ?? "";
  const alreadyPerBulan = /UNIQUE\s*\(\s*krama_id\s*,\s*tahun\s*,\s*bulan_terbit\s*\)/i.test(sql);

  if (sql && !alreadyPerBulan) {
    await db.execute(`
      CREATE TABLE surat_penagihan_dudukan_v2 (
        id TEXT PRIMARY KEY,
        krama_id TEXT NOT NULL REFERENCES krama(id),
        nomor_surat TEXT NOT NULL UNIQUE,
        tahun INTEGER NOT NULL,
        bulan_terbit INTEGER NOT NULL,
        tanggal_terbit TEXT NOT NULL,
        tunggakan_bulan INTEGER NOT NULL,
        total_sisa REAL NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(krama_id, tahun, bulan_terbit)
      )
    `);
    await db.execute(`
      INSERT INTO surat_penagihan_dudukan_v2 (
        id, krama_id, nomor_surat, tahun, bulan_terbit, tanggal_terbit,
        tunggakan_bulan, total_sisa, snapshot_json, created_at
      )
      SELECT id, krama_id, nomor_surat, tahun, bulan_terbit, tanggal_terbit,
             tunggakan_bulan, total_sisa, snapshot_json, created_at
      FROM surat_penagihan_dudukan
    `);
    await db.execute(`DROP TABLE surat_penagihan_dudukan`);
    await db.execute(`ALTER TABLE surat_penagihan_dudukan_v2 RENAME TO surat_penagihan_dudukan`);
  }

  await db.execute(`DROP INDEX IF EXISTS idx_surat_penagihan_krama_tahun`);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_surat_penagihan_krama_tahun_bulan
      ON surat_penagihan_dudukan (krama_id, tahun, bulan_terbit)
  `);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_surat_penagihan_dudukan_v2', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateSuratKeteranganKrama(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_surat_keterangan_krama_v1'`
  );
  if (done[0]?.value === "1") return;

  const desaCols: { name: string; ddl: string }[] = [
    { name: "alamat_desa_adat", ddl: "TEXT" },
    { name: "bandesa_nik", ddl: "TEXT" },
  ];
  for (const col of desaCols) {
    if (!(await tableHasColumn(db, "desa_adat", col.name))) {
      try {
        await db.execute(`ALTER TABLE desa_adat ADD COLUMN ${col.name} ${col.ddl}`);
      } catch {
        if (!(await tableHasColumn(db, "desa_adat", col.name))) {
          throw new Error(`Gagal menambah kolom ${col.name} pada desa_adat`);
        }
      }
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS penomoran_skk_counter (
      id TEXT PRIMARY KEY,
      desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
      tahun INTEGER NOT NULL,
      urutan_terakhir INTEGER NOT NULL DEFAULT 0,
      UNIQUE(desa_adat_id, tahun)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS surat_keterangan_krama (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      nomor_surat TEXT NOT NULL UNIQUE,
      tahun INTEGER NOT NULL,
      bulan_terbit INTEGER NOT NULL,
      tanggal_terbit TEXT NOT NULL,
      tujuan TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_surat_keterangan_krama_tanggal
      ON surat_keterangan_krama (tanggal_terbit, krama_id)
  `);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_surat_keterangan_krama_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateSuratKeteranganKramaAnggotaV2(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_surat_keterangan_krama_anggota_v2'`
  );
  if (done[0]?.value === "1") return;

  if (!(await tableHasColumn(db, "surat_keterangan_krama", "anggota_id"))) {
    try {
      await db.execute(
        `ALTER TABLE surat_keterangan_krama ADD COLUMN anggota_id TEXT REFERENCES anggota_keluarga(id)`
      );
    } catch {
      if (!(await tableHasColumn(db, "surat_keterangan_krama", "anggota_id"))) {
        throw new Error("Gagal menambah kolom anggota_id pada surat_keterangan_krama");
      }
    }
  }

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_surat_keterangan_krama_anggota_v2', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateSuratKeteranganPindah(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_surat_keterangan_pindah_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(`
    CREATE TABLE IF NOT EXISTS penomoran_skp_counter (
      id TEXT PRIMARY KEY,
      desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
      tahun INTEGER NOT NULL,
      urutan_terakhir INTEGER NOT NULL DEFAULT 0,
      UNIQUE(desa_adat_id, tahun)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS surat_keterangan_pindah (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      anggota_id TEXT REFERENCES anggota_keluarga(id),
      jenis TEXT NOT NULL CHECK (jenis IN ('keluarga', 'anggota')),
      nomor_surat TEXT NOT NULL UNIQUE,
      tahun INTEGER NOT NULL,
      bulan_terbit INTEGER NOT NULL,
      tanggal_terbit TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_surat_keterangan_pindah_tanggal
      ON surat_keterangan_pindah (tanggal_terbit, krama_id)
  `);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_surat_keterangan_pindah_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateIlikitaKebijakan(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_ilikita_kebijakan_v1'`
  );
  if (done[0]?.value === "1") return;

  if (!(await tableHasColumn(db, "desa_adat", "auto_perpanjang_pemasih"))) {
    try {
      await db.execute(
        `ALTER TABLE desa_adat ADD COLUMN auto_perpanjang_pemasih INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      if (!(await tableHasColumn(db, "desa_adat", "auto_perpanjang_pemasih"))) {
        throw new Error("Gagal menambah kolom auto_perpanjang_pemasih pada desa_adat");
      }
    }
  }

  if (!(await tableHasColumn(db, "desa_adat", "enforce_masa_berlaku_pipil"))) {
    try {
      await db.execute(
        `ALTER TABLE desa_adat ADD COLUMN enforce_masa_berlaku_pipil INTEGER NOT NULL DEFAULT 1`
      );
    } catch {
      if (!(await tableHasColumn(db, "desa_adat", "enforce_masa_berlaku_pipil"))) {
        throw new Error("Gagal menambah kolom enforce_masa_berlaku_pipil pada desa_adat");
      }
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pemasih_perpanjangan_riwayat (
      id TEXT PRIMARY KEY,
      krama_id TEXT NOT NULL REFERENCES krama(id),
      nomor_kartu TEXT NOT NULL,
      tanggal_perpanjangan TEXT NOT NULL,
      tanggal_berlaku_akhir_sebelum TEXT,
      jenis TEXT NOT NULL CHECK (jenis IN ('manual', 'otomatis')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_pemasih_perpanjangan_riwayat_created
      ON pemasih_perpanjangan_riwayat (created_at DESC, krama_id)
  `);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_ilikita_kebijakan_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateAutoPerpanjangPemasihTamiu(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_auto_perpanjang_pemasih_tamiu_v1'`
  );
  if (done[0]?.value === "1") return;

  if (!(await tableHasColumn(db, "desa_adat", "auto_perpanjang_pemasih_tamiu"))) {
    try {
      await db.execute(
        `ALTER TABLE desa_adat ADD COLUMN auto_perpanjang_pemasih_tamiu INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      if (!(await tableHasColumn(db, "desa_adat", "auto_perpanjang_pemasih_tamiu"))) {
        throw new Error("Gagal menambah kolom auto_perpanjang_pemasih_tamiu pada desa_adat");
      }
    }
  }

  await db.execute(
    `UPDATE desa_adat SET auto_perpanjang_pemasih_tamiu = auto_perpanjang_pemasih
     WHERE COALESCE(auto_perpanjang_pemasih_tamiu, 0) = 0 AND COALESCE(auto_perpanjang_pemasih, 0) = 1`
  );

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_auto_perpanjang_pemasih_tamiu_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateAutoPerpanjangPemasihPerJenis(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_auto_perpanjang_pemasih_per_jenis_v1'`
  );
  if (done[0]?.value === "1") return;

  for (const table of ["jenis_krama_tamiu", "jenis_tamiu"] as const) {
    if (!(await tableHasColumn(db, table, "auto_perpanjang"))) {
      try {
        await db.execute(
          `ALTER TABLE ${table} ADD COLUMN auto_perpanjang INTEGER NOT NULL DEFAULT 0`
        );
      } catch {
        if (!(await tableHasColumn(db, table, "auto_perpanjang"))) {
          throw new Error(`Gagal menambah kolom auto_perpanjang pada ${table}`);
        }
      }
    }
  }

  await db.execute(
    `UPDATE jenis_krama_tamiu SET auto_perpanjang = 1
     WHERE COALESCE(masa_berlaku_tahun, 0) > 0
       AND (SELECT COALESCE(auto_perpanjang_pemasih, 0) FROM desa_adat LIMIT 1) = 1`
  );
  await db.execute(
    `UPDATE jenis_tamiu SET auto_perpanjang = 1
     WHERE COALESCE(masa_berlaku_tahun, 0) > 0
       AND (SELECT COALESCE(auto_perpanjang_pemasih_tamiu, 0) FROM desa_adat LIMIT 1) = 1`
  );

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_auto_perpanjang_pemasih_per_jenis_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

const POS_PEMASUKAN_DANA_KASUKRETAN = [
  { nama: "Biaya Administrasi Pemasih", urutan: 1 },
  { nama: "Punia Kasukretan", urutan: 2 },
  { nama: "Dana Kerjasama Kasukretan", urutan: 3 },
  { nama: "Dana Sewa", urutan: 4 },
] as const;

const TARIF_ADMIN_ILIKITA_JENIS = [
  "ipma_terbit_baru",
  "ipma_perpanjangan",
  "pemasih_terbit_baru",
  "pemasih_perpanjangan",
] as const;

async function migrateLembagaBadanDanAdminIlikita(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_lembaga_badan_admin_v1'`
  );
  if (done[0]?.value === "1") return;

  if (!(await tableHasColumn(db, "desa_adat", "charge_biaya_admin_pemasih"))) {
    try {
      await db.execute(
        `ALTER TABLE desa_adat ADD COLUMN charge_biaya_admin_pemasih INTEGER NOT NULL DEFAULT 0`
      );
    } catch {
      if (!(await tableHasColumn(db, "desa_adat", "charge_biaya_admin_pemasih"))) {
        throw new Error("Gagal menambah kolom charge_biaya_admin_pemasih");
      }
    }
  }

  for (const col of ["kelompok_akun", "is_system"] as const) {
    if (!(await tableHasColumn(db, "pos_pemasukan", col === "kelompok_akun" ? col : col))) {
      const ddl = col === "kelompok_akun" ? "TEXT" : "INTEGER NOT NULL DEFAULT 0";
      try {
        await db.execute(`ALTER TABLE pos_pemasukan ADD COLUMN ${col} ${ddl}`);
      } catch {
        if (!(await tableHasColumn(db, "pos_pemasukan", col))) {
          throw new Error(`Gagal menambah kolom pos_pemasukan.${col}`);
        }
      }
    }
    if (!(await tableHasColumn(db, "pos_biaya", col === "kelompok_akun" ? col : col))) {
      const ddl = col === "kelompok_akun" ? "TEXT" : "INTEGER NOT NULL DEFAULT 0";
      try {
        await db.execute(`ALTER TABLE pos_biaya ADD COLUMN ${col} ${ddl}`);
      } catch {
        if (!(await tableHasColumn(db, "pos_biaya", col))) {
          throw new Error(`Gagal menambah kolom pos_biaya.${col}`);
        }
      }
    }
  }

  if (!(await tableHasColumn(db, "krama", "biaya_terbit_transaksi_id"))) {
    try {
      await db.execute(`ALTER TABLE krama ADD COLUMN biaya_terbit_transaksi_id TEXT`);
    } catch {
      if (!(await tableHasColumn(db, "krama", "biaya_terbit_transaksi_id"))) {
        throw new Error("Gagal menambah kolom biaya_terbit_transaksi_id");
      }
    }
  }

  if (!(await tableHasColumn(db, "pemasih_perpanjangan_riwayat", "tarif_nominal"))) {
    try {
      await db.execute(`ALTER TABLE pemasih_perpanjangan_riwayat ADD COLUMN tarif_nominal REAL`);
      await db.execute(
        `ALTER TABLE pemasih_perpanjangan_riwayat ADD COLUMN transaksi_pemasukan_id TEXT`
      );
    } catch {
      if (!(await tableHasColumn(db, "pemasih_perpanjangan_riwayat", "tarif_nominal"))) {
        throw new Error("Gagal menambah kolom biaya pada pemasih_perpanjangan_riwayat");
      }
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS lembaga_badan (
      id TEXT PRIMARY KEY,
      desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
      nama TEXT NOT NULL,
      alamat TEXT,
      sektor_utama TEXT NOT NULL,
      bentuk_hukum TEXT NOT NULL,
      fokus_bidang TEXT NOT NULL,
      nomor_legalitas TEXT,
      nama_penanggung_jawab TEXT NOT NULL,
      no_kontak TEXT,
      penanggung_jawab_krama_id TEXT REFERENCES krama(id),
      aktif INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_lembaga_badan_desa ON lembaga_badan(desa_adat_id)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_lembaga_badan_nama ON lembaga_badan(nama)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS penomoran_ipma_counter (
      id TEXT PRIMARY KEY,
      desa_adat_id TEXT NOT NULL REFERENCES desa_adat(id),
      tahun INTEGER NOT NULL,
      urutan_terakhir INTEGER NOT NULL DEFAULT 0,
      UNIQUE(desa_adat_id, tahun)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS surat_keterangan_mautsaha_adat (
      id TEXT PRIMARY KEY,
      lembaga_badan_id TEXT NOT NULL REFERENCES lembaga_badan(id),
      nomor_surat TEXT NOT NULL UNIQUE,
      tahun INTEGER NOT NULL,
      bulan_terbit INTEGER NOT NULL,
      tanggal_terbit TEXT NOT NULL,
      tanggal_berlaku_sampai TEXT NOT NULL,
      jenis TEXT NOT NULL CHECK (jenis IN ('terbit_baru', 'perpanjangan')),
      snapshot_json TEXT NOT NULL,
      tarif_nominal REAL NOT NULL DEFAULT 0,
      transaksi_pemasukan_id TEXT REFERENCES transaksi_pemasukan(id),
      akun_keuangan_id TEXT REFERENCES akun_keuangan(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sk_mautsaha_lembaga
      ON surat_keterangan_mautsaha_adat (lembaga_badan_id, tanggal_terbit)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tarif_administrasi_ilikita (
      jenis TEXT PRIMARY KEY CHECK (jenis IN (
        'ipma_terbit_baru', 'ipma_perpanjangan',
        'pemasih_terbit_baru', 'pemasih_perpanjangan'
      )),
      nominal REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  for (const jenis of TARIF_ADMIN_ILIKITA_JENIS) {
    await db.execute(
      `INSERT OR IGNORE INTO tarif_administrasi_ilikita (jenis, nominal) VALUES (?, 0)`,
      [jenis]
    );
  }

  const kelompokExisting = await db.select<{ id: string }[]>(
    `SELECT id FROM akun_keuangan WHERE jenis = 'dana_kasukretan_lainnya' AND is_kelompok = 1 LIMIT 1`
  );
  if (!kelompokExisting[0]) {
    const kelompokId = uuid();
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, created_at)
       VALUES (?, 'Dana Kasukretan Lainnya', 'dana_kasukretan_lainnya', 3, 1, datetime('now'))`,
      [kelompokId]
    );
    const tunaiId = uuid();
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, parent_akun_id, created_at)
       VALUES (?, 'Dana Kasukretan Lainnya - Tunai', 'dana_kasukretan_lainnya', 1, 0, ?, datetime('now'))`,
      [tunaiId, kelompokId]
    );
  }

  for (const pos of POS_PEMASUKAN_DANA_KASUKRETAN) {
    const existing = await db.select<{ id: string }[]>(
      `SELECT id FROM pos_pemasukan WHERE nama = ? AND kelompok_akun = 'dana_kasukretan_lainnya' LIMIT 1`,
      [pos.nama]
    );
    if (!existing[0]) {
      await db.execute(
        `INSERT INTO pos_pemasukan (id, nama, urutan, kelompok_akun, is_system, aktif, created_at)
         VALUES (?, ?, ?, 'dana_kasukretan_lainnya', 1, 1, datetime('now'))`,
        [uuid(), pos.nama, pos.urutan]
      );
    }
  }

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_lembaga_badan_admin_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

async function migrateDanaPaturunanDudukanLabels(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_dana_paturunan_dudukan_labels_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(
    `UPDATE akun_keuangan SET nama = REPLACE(nama, 'Kas Paturunan', 'Dana Paturunan') WHERE nama LIKE '%Kas Paturunan%'`
  );
  await db.execute(
    `UPDATE akun_keuangan SET nama = REPLACE(nama, 'Kas Dudukan', 'Dana Dudukan') WHERE nama LIKE '%Kas Dudukan%'`
  );

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_dana_paturunan_dudukan_labels_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}

/** viewer → prajuru; pastikan hanya peran RBAC yang dikenal. */
async function migrateStaffRolesRbacV1(db: Database): Promise<void> {
  const done = await db.select<{ value: string }[]>(
    `SELECT value FROM app_sync_meta WHERE key = 'migration_staff_roles_rbac_v1'`
  );
  if (done[0]?.value === "1") return;

  await db.execute(`UPDATE user SET peran = 'prajuru' WHERE peran = 'viewer'`);

  await db.execute(
    `INSERT INTO app_sync_meta (key, value) VALUES ('migration_staff_roles_rbac_v1', '1')
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
}
