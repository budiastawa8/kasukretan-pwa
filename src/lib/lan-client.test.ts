import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearSelectCache, LanDatabase } from "./lan-client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200 });
}

describe("LanDatabase select cache", () => {
  beforeEach(() => {
    clearSelectCache();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/sql/execute") ? jsonResponse({ rowsAffected: 1 }) : jsonResponse([{ id: "a" }])
    );
  });

  const db = () => Reflect.construct(LanDatabase, []) as LanDatabase;

  it("query identik bersamaan cukup satu request, hasil tidak saling berbagi objek", async () => {
    const d = db();
    const [a, b] = await Promise.all([
      d.select<{ id: string }[]>("SELECT * FROM x"),
      d.select<{ id: string }[]>("SELECT * FROM x"),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    a[0].id = "ubah";
    expect(b[0].id).toBe("a");
  });

  it("bind berbeda tetap request terpisah", async () => {
    const d = db();
    await d.select("SELECT * FROM x WHERE id = $1", ["1"]);
    await d.select("SELECT * FROM x WHERE id = $1", ["2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("perintah tulis mengosongkan cache", async () => {
    const d = db();
    await d.select("SELECT * FROM x");
    await d.execute("UPDATE x SET id = 'b'");
    await d.select("SELECT * FROM x");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
