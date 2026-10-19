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

  it("menambah nomor_kontak dan nomor_kartu_norm bila belum ada", async () => {
    // tableHasColumn tim_kasukretan
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nama" }]);
    // tableHasColumn krama
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nomor_kartu" }]);
    dbExecute.mockResolvedValue({ rowsAffected: 0 });

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE tim_kasukretan ADD COLUMN nomor_kontak TEXT"
    );
    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE krama ADD COLUMN nomor_kartu_norm TEXT"
    );
  });

  it("tidak ALTER kontak bila sudah ada; tetap backfill kartu norm", async () => {
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
    ]);
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nomor_kartu" },
      { name: "nomor_kartu_norm" },
    ]);
    dbExecute.mockResolvedValue({ rowsAffected: 0 });

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    const alters = dbExecute.mock.calls.filter(
      (c) => typeof c[0] === "string" && String(c[0]).startsWith("ALTER TABLE")
    );
    expect(alters).toHaveLength(0);
    expect(dbExecute.mock.calls.some((c) => String(c[0]).includes("nomor_kartu_norm"))).toBe(
      true
    );
  });
});
