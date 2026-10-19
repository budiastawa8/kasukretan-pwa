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

  it("menambah nomor_kontak bila kolom belum ada", async () => {
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nama" }]);
    dbExecute.mockResolvedValueOnce({ rowsAffected: 0 });

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE tim_kasukretan ADD COLUMN nomor_kontak TEXT"
    );
  });

  it("tidak ALTER ulang bila kolom sudah ada", async () => {
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
    ]);

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    expect(dbExecute).not.toHaveBeenCalled();
  });
});
