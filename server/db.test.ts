import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@libsql/client/web", () => ({
  createClient: () => ({ execute }),
}));

const hang = () => new Promise(() => {});
const resultSet = { columns: ["ok"], rows: [[1]], rowsAffected: 0 };

describe("dbSelect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("TURSO_DATABASE_URL", "libsql://contoh.turso.io");
    execute.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("mengulang query baca yang menggantung", async () => {
    execute.mockImplementationOnce(hang).mockResolvedValueOnce(resultSet);
    const { dbSelect } = await import("./db");
    const timing = { ms: 0, attempts: 0 };
    const p = dbSelect("SELECT 1 AS ok", [], timing);
    await vi.dynamicImportSettled();
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(p).resolves.toEqual([{ ok: 1 }]);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(timing.attempts).toBe(2);
  });

  it("tidak mengulang perintah tulis", async () => {
    execute.mockResolvedValueOnce(resultSet);
    const { dbSelect } = await import("./db");
    await dbSelect("INSERT INTO x VALUES (1) RETURNING id", []);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
