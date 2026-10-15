import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedQuery, invalidateQueryCache } from "./query-cache";

describe("cachedQuery", () => {
  afterEach(() => {
    invalidateQueryCache();
    vi.useRealTimers();
  });

  it("memakai hasil yang sama dalam TTL", async () => {
    const load = vi.fn(async () => 1);
    await cachedQuery("k", load);
    await cachedQuery("k", load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("memuat ulang setelah invalidasi atau TTL habis", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => 1);
    await cachedQuery("k", load, 1000);
    invalidateQueryCache();
    await cachedQuery("k", load, 1000);
    vi.advanceTimersByTime(1001);
    await cachedQuery("k", load, 1000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("tidak menyimpan hasil yang gagal", async () => {
    const load = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce(2);
    await expect(cachedQuery("k", load)).rejects.toThrow("x");
    await expect(cachedQuery("k", load)).resolves.toBe(2);
  });
});
