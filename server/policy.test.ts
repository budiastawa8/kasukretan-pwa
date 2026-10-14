import { describe, expect, it } from "vitest";
import { authorizeSql } from "./policy";

const INSERT_PATURUNAN = `INSERT INTO paturunan_pembayaran
  (id, krama_id, iuran_id, jenis, jumlah, tanggal, petugas_id, akun_keuangan_id, keterangan,
   tanggal_setor, created_at)
 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, datetime('now'))`;

describe("authorizeSql — petugas lapangan", () => {
  it("boleh membaca data", () => {
    expect(authorizeSql("petugas", "SELECT * FROM krama WHERE id = ?")).toEqual({ allow: true });
  });

  it("INSERT pembayaran satu baris lolos dengan guard baris", () => {
    expect(authorizeSql("petugas", INSERT_PATURUNAN)).toEqual({
      allow: true,
      petugasGuard: { verb: "insert", table: "paturunan_pembayaran" },
    });
  });

  it("DELETE pembayaran per id lolos dengan guard baris", () => {
    expect(authorizeSql("petugas", "DELETE FROM dudukan_pembayaran WHERE id = $1")).toEqual({
      allow: true,
      petugasGuard: { verb: "delete", table: "dudukan_pembayaran" },
    });
  });

  it("menolak UPDATE pembayaran", () => {
    const d = authorizeSql(
      "petugas",
      "UPDATE paturunan_pembayaran SET jumlah = ? WHERE id = ?"
    );
    expect(d.allow).toBe(false);
  });

  it("menolak DELETE massal dan INSERT ... SELECT", () => {
    expect(authorizeSql("petugas", "DELETE FROM paturunan_pembayaran WHERE krama_id = ?").allow).toBe(
      false
    );
    expect(
      authorizeSql(
        "petugas",
        "INSERT INTO dudukan_pembayaran (id, krama_id) SELECT id, krama_id FROM dudukan_pembayaran"
      ).allow
    ).toBe(false);
  });

  it("menolak tulis ke tabel lain (setoran, keringanan, krama)", () => {
    expect(authorizeSql("petugas", "INSERT INTO setoran (id) VALUES (?)").allow).toBe(false);
    expect(authorizeSql("petugas", "DELETE FROM dudukan_keringanan WHERE id = ?").allow).toBe(false);
    expect(authorizeSql("petugas", "UPDATE krama SET alamat = ? WHERE id = ?").allow).toBe(false);
  });

  it("tetap boleh menulis penanda app_sync_meta", () => {
    expect(
      authorizeSql(
        "petugas",
        "INSERT INTO app_sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
    ).toEqual({ allow: true });
  });

  it("peran keuangan tidak terkena guard petugas", () => {
    expect(authorizeSql("keuangan", INSERT_PATURUNAN)).toEqual({ allow: true });
  });
});
