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
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/sql/execute")) return jsonResponse({ rowsAffected: 1 });
      if (url.endsWith("/sql/select-batch")) {
        return jsonResponse({
          results: [[{ id: "a" }], [{ id: "b" }]],
        });
      }
      return jsonResponse([{ id: "a" }]);
    });
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

  it("bind berbeda berurutan tetap request terpisah", async () => {
    const d = db();
    await d.select("SELECT * FROM x WHERE id = $1", ["1"]);
    await d.select("SELECT * FROM x WHERE id = $1", ["2"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bind berbeda dalam Promise.all digabung satu batch", async () => {
    const d = db();
    const [a, b] = await Promise.all([
      d.select<{ id: string }[]>("SELECT * FROM x WHERE id = $1", ["1"]),
      d.select<{ id: string }[]>("SELECT * FROM x WHERE id = $1", ["2"]),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/sql/select-batch");
    expect(a[0].id).toBe("a");
    expect(b[0].id).toBe("b");
  });

  it("perintah tulis mengosongkan cache", async () => {
    const d = db();
    await d.select("SELECT * FROM x");
    await d.execute("UPDATE x SET id = 'b'");
    await d.select("SELECT * FROM x");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("hasil kecil di sessionStorage dipakai ulang tanpa menunggu network", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    });
    vi.stubGlobal("indexedDB", undefined);

    const d = db();
    await d.select("SELECT * FROM y");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearSelectCache();
    const key = `SELECT * FROM y\u0000[]`;
    sessionStorage.setItem(
      `kasukretan_sel:${key}`,
      JSON.stringify({ at: Date.now(), rows: [{ id: "stale" }] })
    );

    fetchMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return jsonResponse([{ id: "fresh" }]);
    });

    const rows = await d.select<{ id: string }[]>("SELECT * FROM y");
    expect(rows[0].id).toBe("stale");
  });
});
