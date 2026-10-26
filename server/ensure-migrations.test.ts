import { beforeEach, describe, expect, it, vi } from "vitest";

const dbSelect = vi.fn();
const dbExecute = vi.fn();

vi.mock("./db.js", () => ({
  dbSelect: (...args: unknown[]) => dbSelect(...args),
  dbExecute: (...args: unknown[]) => dbExecute(...args),
}));

describe("ensureServerMigrations", () => {
  beforeEach(() => {
    vi.resetModules();
    dbSelect.mockReset();
    dbExecute.mockReset();
  });

  it("menambah kolom Tim Bantuan dan nomor_kartu_norm bila belum ada", async () => {
    // tableHasColumn tim_kasukretan (nomor_kontak)
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nama" }]);
    // tableHasColumn desa_adat (tim_bantuan_aktif)
    dbSelect.mockResolvedValueOnce([{ name: "id" }]);
    // tableHasColumn tim_kasukretan (tipe)
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nama" }, { name: "nomor_kontak" }]);
    // tableHasColumn krama (nomor_kartu_norm)
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nomor_kartu" }]);
    // probe baris stale nomor_kartu_norm
    dbSelect.mockResolvedValueOnce([{ x: 1 }]);
    dbExecute.mockResolvedValue({ rowsAffected: 0 });

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE tim_kasukretan ADD COLUMN nomor_kontak TEXT"
    );
    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE desa_adat ADD COLUMN tim_bantuan_aktif INTEGER NOT NULL DEFAULT 0"
    );
    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE tim_kasukretan ADD COLUMN tipe TEXT NOT NULL DEFAULT 'banjar'"
    );
    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE krama ADD COLUMN nomor_kartu_norm TEXT"
    );
  });

  it("tidak ALTER bila kolom sudah ada; backfill hanya jika ada baris stale", async () => {
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
    ]);
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "tim_bantuan_aktif" }]);
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
      { name: "tipe" },
    ]);
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nomor_kartu" },
      { name: "nomor_kartu_norm" },
    ]);
    // ada baris yang perlu di-backfill
    dbSelect.mockResolvedValueOnce([{ x: 1 }]);
    dbExecute.mockResolvedValue({ rowsAffected: 0 });

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    const alters = dbExecute.mock.calls.filter(
      (c) => typeof c[0] === "string" && String(c[0]).startsWith("ALTER TABLE")
    );
    expect(alters).toHaveLength(0);
    expect(
      dbExecute.mock.calls.some(
        (c) => typeof c[0] === "string" && String(c[0]).startsWith("UPDATE krama SET nomor_kartu_norm")
      )
    ).toBe(true);
  });

  it("melewati UPDATE nomor_kartu_norm jika tidak ada baris stale", async () => {
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
    ]);
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "tim_bantuan_aktif" }]);
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
      { name: "tipe" },
    ]);
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nomor_kartu" },
      { name: "nomor_kartu_norm" },
    ]);
    dbSelect.mockResolvedValueOnce([]);
    dbExecute.mockResolvedValue({ rowsAffected: 0 });

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    expect(
      dbExecute.mock.calls.some(
        (c) => typeof c[0] === "string" && String(c[0]).startsWith("UPDATE krama SET nomor_kartu_norm")
      )
    ).toBe(false);
  });
});
