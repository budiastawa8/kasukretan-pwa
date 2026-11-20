import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";

const execute = vi.fn();
const select = vi.fn();

vi.mock("./db/client", () => ({
  getDb: async () => ({ execute, select }),
}));

vi.mock("./lan-client", () => ({
  isLanClientMode: () => true,
}));

describe("petugas-payment-outbox", () => {
  beforeEach(async () => {
    vi.resetModules();
    execute.mockReset();
    select.mockReset();
    vi.stubGlobal("navigator", { onLine: true });
    // Hapus DB outbox antar tes
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("kasukretan_petugas_outbox");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("deleteDatabase failed"));
      req.onblocked = () => resolve();
    });
  });

  it("isLikelyNetworkError mengenali gagal jaringan", async () => {
    const { isLikelyNetworkError } = await import("./petugas-payment-outbox");
    expect(isLikelyNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isLikelyNetworkError(new Error("HTTP 503"))).toBe(true);
    expect(isLikelyNetworkError(new Error("Jumlah harus lebih dari 0"))).toBe(false);
  });

  it("enqueue lalu listPending", async () => {
    const { enqueuePetugasPaymentOutbox, listPetugasPaymentOutbox } = await import(
      "./petugas-payment-outbox"
    );
    await enqueuePetugasPaymentOutbox({
      kind: "paturunan",
      label: "Paturunan uji",
      writes: [
        {
          paymentId: "pay-1",
          table: "paturunan_pembayaran",
          sql: "INSERT INTO paturunan_pembayaran (id) VALUES (?)",
          bind: ["pay-1"],
        },
      ],
    });
    const rows = await listPetugasPaymentOutbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.writes[0]?.paymentId).toBe("pay-1");
    expect(rows[0]?.status).toBe("pending");
  });

  it("flush menandai synced dan hapus item; skip INSERT jika id sudah ada", async () => {
    const {
      enqueuePetugasPaymentOutbox,
      flushPetugasPaymentOutbox,
      listPetugasPaymentOutbox,
    } = await import("./petugas-payment-outbox");

    select.mockResolvedValue([{ id: "pay-exist" }]);
    execute.mockResolvedValue(undefined);

    await enqueuePetugasPaymentOutbox({
      kind: "dudukan",
      label: "Dudukan uji",
      writes: [
        {
          paymentId: "pay-exist",
          table: "dudukan_pembayaran",
          sql: "INSERT INTO dudukan_pembayaran (id) VALUES (?)",
          bind: ["pay-exist"],
        },
      ],
    });

    const result = await flushPetugasPaymentOutbox();
    expect(result.synced).toBe(1);
    expect(result.remaining).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    expect(await listPetugasPaymentOutbox()).toHaveLength(0);
  });

  it("commitPaymentWrites mengantrikan saat offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const { commitPaymentWrites, listPetugasPaymentOutbox } = await import(
      "./petugas-payment-outbox"
    );
    const saved = await commitPaymentWrites({
      kind: "dana_lain",
      label: "Punia",
      allowOfflineQueue: true,
      writes: [
        {
          paymentId: "dl-1",
          table: "penerimaan_dana_lain",
          sql: "INSERT INTO penerimaan_dana_lain (id) VALUES (?)",
          bind: ["dl-1"],
        },
      ],
    });
    expect(saved.mode).toBe("queued");
    expect(saved.paymentIds).toEqual(["dl-1"]);
    expect(await listPetugasPaymentOutbox()).toHaveLength(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it("commitPaymentWrites mengantrikan saat gagal jaringan", async () => {
    execute.mockRejectedValue(new Error("Failed to fetch"));
    select.mockResolvedValue([]);
    const { commitPaymentWrites, listPetugasPaymentOutbox } = await import(
      "./petugas-payment-outbox"
    );
    const saved = await commitPaymentWrites({
      kind: "paturunan",
      label: "Paturunan",
      allowOfflineQueue: true,
      writes: [
        {
          paymentId: "pay-net",
          table: "paturunan_pembayaran",
          sql: "INSERT INTO paturunan_pembayaran (id) VALUES (?)",
          bind: ["pay-net"],
        },
      ],
    });
    expect(saved.mode).toBe("queued");
    expect(await listPetugasPaymentOutbox()).toHaveLength(1);
  });
});
