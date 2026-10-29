import { describe, expect, it } from "vitest";
import {
  formatNomorPengenal,
  formatNomorPengenalDisplay,
  isNomorPengenalFormatBaru,
  normalizeKodeDesaUntukPengenal,
  parseNomorPengenalUrut,
} from "./penomoran-petugas";

describe("penomoran-petugas", () => {
  it("memformat 4 digit kode desa + 3 digit urut", () => {
    expect(formatNomorPengenal("9999", 1)).toBe("9999001");
    expect(formatNomorPengenal("12", 42)).toBe("0012042");
    expect(formatNomorPengenal("7", 7)).toBe("0007007");
  });

  it("tampilan dengan strip", () => {
    expect(formatNomorPengenalDisplay("9999001")).toBe("9999-001");
    expect(formatNomorPengenalDisplay("9999-001")).toBe("9999-001");
  });

  it("mengurai urutan dari nomor 4+3 atau format lama", () => {
    expect(parseNomorPengenalUrut("9999001")).toBe(1);
    expect(parseNomorPengenalUrut("9999-042")).toBe(42);
    expect(parseNomorPengenalUrut("001")).toBe(1);
    expect(parseNomorPengenalUrut("")).toBe(0);
  });

  it("mengenali format baru", () => {
    expect(isNomorPengenalFormatBaru("9999001", "9999")).toBe(true);
    expect(isNomorPengenalFormatBaru("001", "9999")).toBe(false);
    expect(normalizeKodeDesaUntukPengenal("7")).toBe("0007");
  });
});
