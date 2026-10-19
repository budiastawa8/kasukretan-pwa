import { createClient } from "@libsql/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { convertSql } from "../../../server/sql-convert";

const client = createClient({ url: ":memory:" });

vi.mock("../db/client", () => ({
  getDb: async () => ({
    select: async (sql: string, bind: unknown[] = []) => {
      const { sql: s, args } = convertSql(sql, bind);
      const res = await client.execute({ sql: s, args });
      return res.rows.map((r) => ({ ...r }));
    },
  }),
}));

const { getPenerimaanBanjar } = await import("./penerimaan-banjar");

beforeAll(async () => {
  await client.executeMultiple(`
    CREATE TABLE banjar (id TEXT PRIMARY KEY, nama TEXT, kode TEXT);
    CREATE TABLE klasifikasi_krama (id TEXT PRIMARY KEY, kode TEXT, nama_tampilan TEXT);
    CREATE TABLE krama (id TEXT PRIMARY KEY, banjar_id TEXT, klasifikasi_krama_id TEXT);
    CREATE TABLE iuran_paturunan (id TEXT PRIMARY KEY, nama TEXT, created_at TEXT);
    CREATE TABLE paturunan_pembayaran (id TEXT PRIMARY KEY, krama_id TEXT, iuran_id TEXT,
      jenis TEXT, jumlah REAL, tanggal TEXT);
    CREATE TABLE dudukan_pembayaran (id TEXT PRIMARY KEY, krama_id TEXT, jumlah REAL, tanggal TEXT);

    INSERT INTO banjar VALUES ('b1', 'Banjar Satu', '01'), ('b2', 'Banjar Dua', '02');
    INSERT INTO klasifikasi_krama VALUES ('m', 'MIPIL', 'Krama Mipil'),
      ('kt', 'KRAMA_TAMIU', 'Krama Tamiu'), ('t', 'TAMIU', 'Tamiu');
    INSERT INTO krama VALUES ('k1', 'b1', 'kt'), ('k2', 'b1', 't'), ('k3', 'b2', 'kt'),
      ('m1', 'b1', 'm'), ('m2', 'b2', 'm');
    INSERT INTO iuran_paturunan VALUES ('i1', 'Odalan', '2026-01-01'), ('i2', 'Ngaben', '2026-02-01');

    INSERT INTO dudukan_pembayaran VALUES
      ('d1', 'k1', 50000, '2026-10-02'),
      ('d2', 'k1', 50000, '2026-10-05'),
      ('d3', 'k2', 20000, '2026-10-07'),
      ('d4', 'k3', 30000, '2026-10-08'),
      ('d5', 'k1', 99000, '2026-09-30');
    INSERT INTO paturunan_pembayaran VALUES
      ('p1', 'm1', 'i1', 'wajib', 100000, '2026-10-01'),
      ('p2', 'm1', 'i2', 'punia', 25000, '2026-10-03'),
      ('p3', 'm2', 'i1', 'wajib', 70000, '2026-10-04');
  `);
});

const OKT = { dari: "2026-10-01", sampai: "2026-10-31" };

describe("getPenerimaanBanjar", () => {
  it("dudukan satu banjar: total periode, rincian per klasifikasi", async () => {
    const r = await getPenerimaanBanjar({ mode: "dudukan", banjarId: "b1", ...OKT });
    expect(r.total).toBe(120000);
    expect(r.transaksi).toBe(3);
    expect(r.krama).toBe(2);
    expect(r.rincian.map((x) => [x.label, x.jumlah])).toEqual([
      ["Krama Tamiu", 100000],
      ["Tamiu", 20000],
    ]);
  });

  it("dudukan semua banjar: rincian per banjar", async () => {
    const r = await getPenerimaanBanjar({ mode: "dudukan", banjarId: null, ...OKT });
    expect(r.total).toBe(150000);
    expect(r.rincian.map((x) => [x.label, x.jumlah])).toEqual([
      ["Banjar Satu", 120000],
      ["Banjar Dua", 30000],
    ]);
  });

  it("paturunan satu banjar: wajib/punia dan rincian per iuran", async () => {
    const r = await getPenerimaanBanjar({ mode: "paturunan", banjarId: "b1", ...OKT });
    expect(r.total).toBe(125000);
    expect(r.wajib).toBe(100000);
    expect(r.punia).toBe(25000);
    expect(r.krama).toBe(1);
    expect(r.rincian.map((x) => x.label)).toEqual(["Odalan", "Ngaben"]);
  });
});
