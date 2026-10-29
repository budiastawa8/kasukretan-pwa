import { describe, expect, it } from "vitest";
import { CEK_PETUGAS_PATH } from "./cek-petugas-publik";

describe("cek-petugas-publik", () => {
  it("path stabil untuk dibagikan", () => {
    expect(CEK_PETUGAS_PATH).toBe("/cek-petugas");
  });
});
