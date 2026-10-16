import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSelectPersist,
  readSelectPersist,
  writeSelectPersist,
} from "./select-persist";

describe("select-persist", () => {
  beforeEach(() => {
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
    clearSelectPersist();
  });

  it("menyimpan hasil kecil di sessionStorage", async () => {
    await writeSelectPersist("q1", [{ id: 1 }]);
    const hit = await readSelectPersist("q1");
    expect(hit?.rows).toEqual([{ id: 1 }]);
    expect(typeof hit?.at).toBe("number");
  });

  it("clear mengosongkan session", async () => {
    await writeSelectPersist("q2", [1]);
    clearSelectPersist();
    expect(await readSelectPersist("q2")).toBeNull();
  });
});
