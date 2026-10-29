import { beforeEach, describe, expect, it, vi } from "vitest";

const dbSelect = vi.fn();
const dbExecute = vi.fn();

vi.mock("./db.js", () => ({
  dbSelect: (...args: unknown[]) => dbSelect(...args),
  dbExecute: (...args: unknown[]) => dbExecute(...args),
}));

const TIM_FULL = [
  { name: "id" },
  { name: "nama" },
  { name: "nomor_kontak" },
  { name: "tipe" },
  { name: "nomor_pengenal" },
  { name: "foto_url" },
  { name: "aktif" },
];
const DESA_FULL = [
  { name: "id" },
  { name: "tim_bantuan_aktif" },
  { name: "cek_tunggakan_paturunan_publik" },
];
const KRAMA_FULL = [{ name: "id" }, { name: "nomor_kartu" }, { name: "nomor_kartu_norm" }];

/** Setelah kolom kartu: SELECT desa kode, SELECT all tim, lalu cek tunggakan + krama. */
function mockAfterKartuColumns(opts: { staleNorm: unknown[] }) {
  dbSelect.mockResolvedValueOnce([{ kode_desa_adat: "9999" }]);
  dbSelect.mockResolvedValueOnce([]); // allTim kosong
  dbSelect.mockResolvedValueOnce(DESA_FULL);
  dbSelect.mockResolvedValueOnce(KRAMA_FULL);
  dbSelect.mockResolvedValueOnce(opts.staleNorm);
}

describe("ensureServerMigrations", () => {
  beforeEach(() => {
    vi.resetModules();
    dbSelect.mockReset();
    dbExecute.mockReset();
  });

  it("menambah kolom Tim Bantuan, kartu petugas, cek tunggakan publik, dan nomor_kartu_norm bila belum ada", async () => {
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nama" }]);
    dbSelect.mockResolvedValueOnce([{ name: "id" }]);
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nama" }, { name: "nomor_kontak" }]);
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nama" }, { name: "nomor_kontak" }, { name: "tipe" }]);
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
      { name: "tipe" },
      { name: "nomor_pengenal" },
    ]);
    dbSelect.mockResolvedValueOnce([
      { name: "id" },
      { name: "nama" },
      { name: "nomor_kontak" },
      { name: "tipe" },
      { name: "nomor_pengenal" },
      { name: "foto_url" },
    ]);
    dbSelect.mockResolvedValueOnce([{ kode_desa_adat: "9999" }]);
    dbSelect.mockResolvedValueOnce([{ id: "t1", nomor_pengenal: null }]);
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "tim_bantuan_aktif" }]);
    dbSelect.mockResolvedValueOnce([{ name: "id" }, { name: "nomor_kartu" }]);
    dbSelect.mockResolvedValueOnce([{ x: 1 }]);
    dbExecute.mockResolvedValue({ rowsAffected: 0 });

    const { ensureServerMigrations } = await import("./ensure-migrations.js");
    await ensureServerMigrations();

    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE tim_kasukretan ADD COLUMN nomor_pengenal TEXT"
    );
    expect(dbExecute).toHaveBeenCalledWith("ALTER TABLE tim_kasukretan ADD COLUMN foto_url TEXT");
    expect(dbExecute).toHaveBeenCalledWith(
      "ALTER TABLE tim_kasukretan ADD COLUMN aktif INTEGER NOT NULL DEFAULT 1"
    );
    expect(dbExecute).toHaveBeenCalledWith(
      "UPDATE tim_kasukretan SET nomor_pengenal = ?, updated_at = datetime('now') WHERE id = ?",
      ["9999001", "t1"]
    );
  });

  it("tidak ALTER bila kolom sudah ada; backfill hanya jika ada baris stale", async () => {
    dbSelect
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce([{ name: "id" }, { name: "tim_bantuan_aktif" }])
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce(TIM_FULL);
    mockAfterKartuColumns({ staleNorm: [{ x: 1 }] });
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
    dbSelect
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce([{ name: "id" }, { name: "tim_bantuan_aktif" }])
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce(TIM_FULL)
      .mockResolvedValueOnce(TIM_FULL);
    mockAfterKartuColumns({ staleNorm: [] });
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
