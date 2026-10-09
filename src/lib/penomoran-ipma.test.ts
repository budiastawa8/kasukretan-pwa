import { describe, expect, it } from "vitest";
import { formatNomorSuratMautsahaAdat } from "./penomoran-ipma";

describe("formatNomorSuratMautsahaAdat", () => {
  it("membentuk nomor IPMA standar", () => {
    expect(formatNomorSuratMautsahaAdat(1, "1234", 6, 2026)).toBe("IPMA/001/1234/VI/2026");
    expect(formatNomorSuratMautsahaAdat(42, "5678", 12, 2025)).toBe("IPMA/042/5678/XII/2025");
  });

  it("memadatkan kode desa ke 4 digit terakhir", () => {
    expect(formatNomorSuratMautsahaAdat(7, "DA-0099", 3, 2024)).toBe("IPMA/007/0099/III/2024");
  });

  it("mengisi nol di depan urutan", () => {
    expect(formatNomorSuratMautsahaAdat(999, "0001", 1, 2026)).toBe("IPMA/999/0001/I/2026");
  });
});
