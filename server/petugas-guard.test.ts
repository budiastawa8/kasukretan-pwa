import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, ResultSet } from "@libsql/client";
import type { PublicUser } from "./auth";
import type { PetugasGuard } from "./policy";

const PESAN_TIDAK_JELAS = "Perintah pembayaran tidak menghasilkan baris yang bisa diverifikasi.";

const dir = mkdtempSync(join(tmpdir(), "petugas-guard-"));
const dbUrl = "file:" + join(dir, "t.db").replace(/\\/g, "/");

type WriteFn = typeof import("./petugas-guard").executePetugasPaymentWrite;

let client: Client;
let executePetugasPaymentWrite: WriteFn;

type Pay = {
  id: string;
  kramaId: string;
  jumlah: number;
  petugasId: string;
  tanggalSetor?: string | null;
  setoranId?: string | null;
};

function akun(id: string): PublicUser {
  return { id, username: id, peran: "petugas", nama: id, mustChangePassword: false };
}

const petugas = akun("u-petugas");
const bendahara = akun("u-bendahara");

function stmt(table: "dudukan_pembayaran" | "paturunan_pembayaran", rows: Pay[]) {
  const tuples: string[] = [];
  const bind: unknown[] = [];
  rows.forEach((row, i) => {
    const b = i * 6;
    tuples.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`);
    bind.push(
      row.id,
      row.kramaId,
      row.jumlah,
      row.petugasId,
      row.tanggalSetor ?? null,
      row.setoranId ?? null
    );
  });
  const guard: PetugasGuard = { verb: "insert", table };
  return {
    guard,
    sql: `INSERT INTO ${table} (id, krama_id, jumlah, petugas_id, tanggal_setor, setoran_id) VALUES ${tuples.join(", ")}`,
    bind,
  };
}

async function tersimpan(table: string) {
  const rs = await client.execute(
    `SELECT id, krama_id, jumlah, petugas_id, tanggal_setor, setoran_id FROM ${table} ORDER BY rowid`
  );
  return rs.rows.map((r) => ({
    id: String(r[0]),
    kramaId: String(r[1]),
    jumlah: Number(r[2]),
    petugasId: r[3] == null ? null : String(r[3]),
    tanggalSetor: r[4] == null ? null : String(r[4]),
    setoranId: r[5] == null ? null : String(r[5]),
  }));
}

async function expectTolak(run: Promise<unknown>, message: string) {
  await expect(run).rejects.toMatchObject({ status: 403, message });
}

describe("executePetugasPaymentWrite", () => {
  beforeAll(async () => {
    vi.stubEnv("TURSO_DATABASE_URL", dbUrl);
    vi.resetModules();
    const db = await import("./db");
    ({ executePetugasPaymentWrite } = await import("./petugas-guard"));
    client = await db.getClient();
    await client.executeMultiple(`
      CREATE TABLE tim_kasukretan (
        id TEXT PRIMARY KEY,
        banjar_id TEXT NOT NULL,
        jabatan TEXT NOT NULL,
        tipe TEXT NOT NULL DEFAULT 'banjar'
      );
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        tim_kasukretan_id TEXT,
        aktif INTEGER NOT NULL
      );
      CREATE TABLE krama (
        id TEXT PRIMARY KEY,
        banjar_id TEXT NOT NULL
      );
      CREATE TABLE dudukan_pembayaran (
        id TEXT PRIMARY KEY,
        krama_id TEXT NOT NULL,
        jumlah REAL NOT NULL,
        petugas_id TEXT,
        tanggal_setor TEXT,
        setoran_id TEXT
      );
      CREATE TABLE paturunan_pembayaran (
        id TEXT PRIMARY KEY,
        krama_id TEXT NOT NULL,
        jumlah REAL NOT NULL,
        petugas_id TEXT,
        tanggal_setor TEXT,
        setoran_id TEXT
      );
      INSERT INTO tim_kasukretan (id, banjar_id, jabatan, tipe) VALUES
        ('t-petugas', 'banjar-a', 'Petugas', 'banjar'),
        ('t-lain', 'banjar-a', 'Petugas', 'banjar'),
        ('t-bendahara', 'banjar-a', 'Bendahara', 'banjar'),
        ('t-bantuan', 'banjar-a', 'Petugas', 'bantuan');
      INSERT INTO user (id, tim_kasukretan_id, aktif) VALUES
        ('u-petugas', 't-petugas', 1),
        ('u-bendahara', 't-bendahara', 1),
        ('u-bantuan', 't-bantuan', 1);
      INSERT INTO krama (id, banjar_id) VALUES
        ('krama-a', 'banjar-a'),
        ('krama-b', 'banjar-b');
    `);
  });

  afterAll(() => {
    client?.close();
    vi.unstubAllEnvs();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Berkas SQLite di Windows kadang masih terkunci sesaat setelah close.
    }
  });

  beforeEach(async () => {
    await client.execute("DELETE FROM dudukan_pembayaran");
    await client.execute("DELETE FROM paturunan_pembayaran");
  });

  it("menyimpan beberapa bulan dudukan sekaligus dan memeriksa tiap baris", async () => {
    const rows: Pay[] = [
      { id: "jun", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
      { id: "jul", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
      { id: "agu", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
      { id: "sep", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ];
    const cmd = stmt("dudukan_pembayaran", rows);
    await expect(executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind)).resolves.toEqual({
      rowsAffected: 4,
    });
    expect(await tersimpan("dudukan_pembayaran")).toEqual(
      rows.map((r) => ({ ...r, tanggalSetor: null, setoranId: null }))
    );
  });

  it("menyimpan beberapa baris paturunan dalam satu INSERT", async () => {
    const rows: Pay[] = [
      { id: "wajib", kramaId: "krama-a", jumlah: 50000, petugasId: "t-petugas" },
      { id: "punia", kramaId: "krama-a", jumlah: 10000, petugasId: "t-petugas" },
    ];
    const cmd = stmt("paturunan_pembayaran", rows);
    await expect(executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind)).resolves.toEqual({
      rowsAffected: 2,
    });
    expect(await tersimpan("paturunan_pembayaran")).toEqual(
      rows.map((r) => ({ ...r, tanggalSetor: null, setoranId: null }))
    );
  });

  it("menolak Tim Bantuan menulis Paturunan", async () => {
    const bantuan = akun("u-bantuan");
    const cmd = stmt("paturunan_pembayaran", [
      { id: "tolak", kramaId: "krama-a", jumlah: 10000, petugasId: "t-bantuan" },
    ]);
    await expectTolak(
      executePetugasPaymentWrite(bantuan, cmd.guard, cmd.sql, cmd.bind),
      "Tim Bantuan tidak boleh mengumpulkan Paturunan."
    );
    expect(await tersimpan("paturunan_pembayaran")).toEqual([]);
  });

  it("Tim Bantuan boleh menulis Dudukan", async () => {
    const bantuan = akun("u-bantuan");
    const cmd = stmt("dudukan_pembayaran", [
      { id: "ok-dud", kramaId: "krama-a", jumlah: 15000, petugasId: "t-bantuan" },
    ]);
    await expect(executePetugasPaymentWrite(bantuan, cmd.guard, cmd.sql, cmd.bind)).resolves.toEqual({
      rowsAffected: 1,
    });
  });

  it("tetap menyimpan satu baris", async () => {
    const cmd = stmt("dudukan_pembayaran", [
      { id: "satu", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ]);
    await expect(executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind)).resolves.toEqual({
      rowsAffected: 1,
    });
    expect(await tersimpan("dudukan_pembayaran")).toEqual([
      {
        id: "satu",
        kramaId: "krama-a",
        jumlah: 15000,
        petugasId: "t-petugas",
        tanggalSetor: null,
        setoranId: null,
      },
    ]);
  });

  it("mengembalikan seluruh INSERT jika baris pertama milik petugas lain", async () => {
    const cmd = stmt("dudukan_pembayaran", [
      { id: "milik-lain", kramaId: "krama-a", jumlah: 15000, petugasId: "t-lain" },
      { id: "milik-sendiri", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ]);
    await expectTolak(
      executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind),
      "Petugas pembayaran harus akun Anda sendiri."
    );
    expect(await tersimpan("dudukan_pembayaran")).toEqual([]);
  });

  it("mengembalikan seluruh INSERT jika ada krama di luar banjar", async () => {
    const cmd = stmt("dudukan_pembayaran", [
      { id: "dalam", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
      { id: "luar", kramaId: "krama-b", jumlah: 15000, petugasId: "t-petugas" },
      { id: "dalam-lagi", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ]);
    await expectTolak(
      executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind),
      "Krama ini bukan dari banjar wilayah Anda."
    );
    expect(await tersimpan("dudukan_pembayaran")).toEqual([]);
  });

  it("bendahara boleh mencatat krama banjar lain", async () => {
    const rows: Pay[] = [
      { id: "banjar-sendiri", kramaId: "krama-a", jumlah: 15000, petugasId: "t-bendahara" },
      { id: "banjar-lain", kramaId: "krama-b", jumlah: 15000, petugasId: "t-bendahara" },
    ];
    const cmd = stmt("dudukan_pembayaran", rows);
    await expect(executePetugasPaymentWrite(bendahara, cmd.guard, cmd.sql, cmd.bind)).resolves.toEqual({
      rowsAffected: 2,
    });
    expect(await tersimpan("dudukan_pembayaran")).toEqual(
      rows.map((r) => ({ ...r, tanggalSetor: null, setoranId: null }))
    );
  });

  it("mengembalikan seluruh INSERT jika ada baris yang sudah disetor", async () => {
    const denganTanggal = stmt("dudukan_pembayaran", [
      { id: "baru", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
      {
        id: "sudah-setor",
        kramaId: "krama-a",
        jumlah: 15000,
        petugasId: "t-petugas",
        tanggalSetor: "2026-10-01",
      },
    ]);
    await expectTolak(
      executePetugasPaymentWrite(petugas, denganTanggal.guard, denganTanggal.sql, denganTanggal.bind),
      "Pembayaran dari petugas lapangan harus berstatus belum disetor."
    );
    expect(await tersimpan("dudukan_pembayaran")).toEqual([]);

    const denganSetoran = stmt("paturunan_pembayaran", [
      {
        id: "sudah-setor-id",
        kramaId: "krama-a",
        jumlah: 15000,
        petugasId: "t-petugas",
        setoranId: "setoran-1",
      },
      { id: "baru-paturunan", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ]);
    await expectTolak(
      executePetugasPaymentWrite(petugas, denganSetoran.guard, denganSetoran.sql, denganSetoran.bind),
      "Pembayaran dari petugas lapangan harus berstatus belum disetor."
    );
    expect(await tersimpan("paturunan_pembayaran")).toEqual([]);
  });

  it("mengembalikan seluruh INSERT jika jumlah tidak lebih dari 0", async () => {
    const nol = stmt("dudukan_pembayaran", [
      { id: "nol", kramaId: "krama-a", jumlah: 0, petugasId: "t-petugas" },
      { id: "sah", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ]);
    await expectTolak(
      executePetugasPaymentWrite(petugas, nol.guard, nol.sql, nol.bind),
      "Jumlah pembayaran harus lebih dari 0."
    );
    expect(await tersimpan("dudukan_pembayaran")).toEqual([]);

    const minus = stmt("dudukan_pembayaran", [
      { id: "sah-dulu", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
      { id: "minus", kramaId: "krama-a", jumlah: -500, petugasId: "t-petugas" },
    ]);
    await expectTolak(
      executePetugasPaymentWrite(petugas, minus.guard, minus.sql, minus.bind),
      "Jumlah pembayaran harus lebih dari 0."
    );
    expect(await tersimpan("dudukan_pembayaran")).toEqual([]);
  });

  it("menolak perintah yang tidak menyisipkan baris", async () => {
    const cmd = stmt("dudukan_pembayaran", [
      { id: "dup", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ]);
    await executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind);
    const ulang = {
      ...cmd,
      sql: `${cmd.sql} ON CONFLICT(id) DO NOTHING`,
    };
    await expectTolak(
      executePetugasPaymentWrite(petugas, ulang.guard, ulang.sql, ulang.bind),
      PESAN_TIDAK_JELAS
    );
    expect(await tersimpan("dudukan_pembayaran")).toEqual([
      {
        id: "dup",
        kramaId: "krama-a",
        jumlah: 15000,
        petugasId: "t-petugas",
        tanggalSetor: null,
        setoranId: null,
      },
    ]);
  });

  it("menolak jika lastInsertRowid kosong dan tidak meng-commit", async () => {
    const db = await import("./db");
    const kosong: ResultSet = {
      columns: [],
      columnTypes: [],
      rows: [],
      rowsAffected: 2,
      lastInsertRowid: undefined,
      toJSON: () => ({}),
    };
    const tx = {
      execute: vi.fn(async () => kosong),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      close: vi.fn(),
    };
    const spy = vi.spyOn(db, "getClient").mockResolvedValue({
      transaction: async () => tx,
    } as unknown as Client);
    try {
      const cmd = stmt("dudukan_pembayaran", [
        { id: "a", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
        { id: "b", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
      ]);
      await expectTolak(
        executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind),
        PESAN_TIDAK_JELAS
      );
      expect(tx.execute).toHaveBeenCalledTimes(1);
      expect(tx.commit).not.toHaveBeenCalled();
      expect(tx.rollback).toHaveBeenCalled();
      expect(await tersimpan("dudukan_pembayaran")).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("menghapus pembayaran sendiri yang belum disetor", async () => {
    const cmd = stmt("dudukan_pembayaran", [
      { id: "hapus-saya", kramaId: "krama-a", jumlah: 15000, petugasId: "t-petugas" },
    ]);
    await executePetugasPaymentWrite(petugas, cmd.guard, cmd.sql, cmd.bind);
    await expect(
      executePetugasPaymentWrite(
        petugas,
        { verb: "delete", table: "dudukan_pembayaran" },
        "DELETE FROM dudukan_pembayaran WHERE id = $1",
        ["hapus-saya"]
      )
    ).resolves.toEqual({ rowsAffected: 1 });
    expect(await tersimpan("dudukan_pembayaran")).toEqual([]);
  });

  it("tidak menghapus pembayaran petugas lain", async () => {
    await client.execute({
      sql: `INSERT INTO dudukan_pembayaran (id, krama_id, jumlah, petugas_id) VALUES (?, ?, ?, ?)`,
      args: ["milik-lain", "krama-a", 15000, "t-lain"],
    });
    await expectTolak(
      executePetugasPaymentWrite(
        petugas,
        { verb: "delete", table: "dudukan_pembayaran" },
        "DELETE FROM dudukan_pembayaran WHERE id = $1",
        ["milik-lain"]
      ),
      "Hanya pembayaran yang Anda catat sendiri yang bisa dihapus."
    );
    expect((await tersimpan("dudukan_pembayaran")).map((r) => r.id)).toEqual(["milik-lain"]);
  });

  it("tidak menghapus pembayaran yang sudah disetor", async () => {
    await client.execute({
      sql: `INSERT INTO dudukan_pembayaran (id, krama_id, jumlah, petugas_id, tanggal_setor, setoran_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: ["sudah", "krama-a", 15000, "t-petugas", "2026-10-01", null],
    });
    await expectTolak(
      executePetugasPaymentWrite(
        petugas,
        { verb: "delete", table: "dudukan_pembayaran" },
        "DELETE FROM dudukan_pembayaran WHERE id = $1",
        ["sudah"]
      ),
      "Pembayaran ini sudah disetor ke bendahara — minta bendahara untuk mengoreksinya."
    );
    await client.execute({
      sql: `INSERT INTO paturunan_pembayaran (id, krama_id, jumlah, petugas_id, setoran_id)
            VALUES (?, ?, ?, ?, ?)`,
      args: ["sudah-setoran", "krama-a", 15000, "t-petugas", "setoran-1"],
    });
    await expectTolak(
      executePetugasPaymentWrite(
        petugas,
        { verb: "delete", table: "paturunan_pembayaran" },
        "DELETE FROM paturunan_pembayaran WHERE id = $1",
        ["sudah-setoran"]
      ),
      "Pembayaran ini sudah disetor ke bendahara — minta bendahara untuk mengoreksinya."
    );
    expect((await tersimpan("dudukan_pembayaran")).map((r) => r.id)).toEqual(["sudah"]);
    expect((await tersimpan("paturunan_pembayaran")).map((r) => r.id)).toEqual(["sudah-setoran"]);
  });

  it("mengembalikan nol baris jika id yang dihapus tidak ada", async () => {
    await expect(
      executePetugasPaymentWrite(
        petugas,
        { verb: "delete", table: "paturunan_pembayaran" },
        "DELETE FROM paturunan_pembayaran WHERE id = $1",
        ["tidak-ada"]
      )
    ).resolves.toEqual({ rowsAffected: 0 });
  });
});
