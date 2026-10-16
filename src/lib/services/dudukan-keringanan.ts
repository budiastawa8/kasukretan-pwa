import { getDb } from "../db/client";
import { parseIsoDateString } from "../date-iso";
import {
  hitungSisaDudukan,
  hitungTagihanDudukanPeriode,
  isDudukanBerlakuUntukPeriode,
  isPeriodeDudukanMendatang,
  parseBulan,
  parseJumlahPembayaran,
  parseTahun,
  periodeKey,
  pesanDudukanBelumBerlakuPeriode,
} from "../dudukan-hitung";
import { isJabatanPenerimaSemuaBanjar } from "../petugas-jabatan";
import type { DudukanKeringananRow } from "../types";
import { uuid } from "../utils";

async function getTotalDibayarKramaPeriode(
  kramaId: string,
  tahun: number,
  bulan: number
): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE krama_id = $1 AND tahun = $2 AND bulan = $3`,
    [kramaId, parseTahun(tahun), parseBulan(bulan)]
  );
  return Math.round(Number(rows[0]?.total) || 0);
}

async function assertDudukanBerlakuUntukKrama(
  kramaId: string,
  tahun: number,
  bulan: number
): Promise<{ tanggal_terdaftar: string; tarif_nominal: number }> {
  const db = await getDb();
  const rows = await db.select<
    { tanggal_terdaftar: string; tarif_nominal: number }[]
  >(
    `SELECT k.tanggal_terdaftar,
            COALESCE(jkt.dudukan_nominal, jt.dudukan_nominal, 0) as tarif_nominal
     FROM krama k
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.id = $1`,
    [kramaId]
  );
  const row = rows[0];
  if (!row) throw new Error("Krama tidak ditemukan");
  if (isPeriodeDudukanMendatang(tahun, bulan)) {
    throw new Error("Keringanan tidak berlaku untuk pembayaran dudukan di muka");
  }
  if (!isDudukanBerlakuUntukPeriode(row.tanggal_terdaftar, tahun, bulan)) {
    throw new Error(pesanDudukanBelumBerlakuPeriode(row.tanggal_terdaftar));
  }
  const tagihan = hitungTagihanDudukanPeriode(
    Number(row.tarif_nominal) || 0,
    row.tanggal_terdaftar,
    tahun,
    bulan
  );
  if (tagihan <= 0) {
    throw new Error("Tidak ada kewajiban dudukan untuk periode ini");
  }
  return row;
}

async function assertPetugasForKrama(petugasId: string, kramaId: string): Promise<void> {
  if (!petugasId?.trim()) throw new Error("Petugas wajib dipilih");
  const db = await getDb();
  const rows = await db.select<{ jabatan: string; same_banjar: number }[]>(
    `SELECT t.jabatan,
            CASE WHEN t.banjar_id = k.banjar_id THEN 1 ELSE 0 END as same_banjar
     FROM tim_kasukretan t
     CROSS JOIN krama k
     WHERE t.id = $1 AND k.id = $2`,
    [petugasId, kramaId]
  );
  const row = rows[0];
  if (!row) throw new Error("Petugas atau krama tidak ditemukan");
  if (row.same_banjar === 1 || isJabatanPenerimaSemuaBanjar(row.jabatan)) return;
  throw new Error("Petugas harus dari banjar krama yang sama");
}

export async function getKeringananMapForBulan(
  tahun: number,
  bulan: number
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ krama_id: string; total: number }[]>(
    `SELECT krama_id, COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_keringanan
     WHERE tahun = $1 AND bulan = $2
     GROUP BY krama_id`,
    [parseTahun(tahun), parseBulan(bulan)]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row.krama_id), Math.round(Number(row.total) || 0));
  }
  return map;
}

export async function getKeringananPeriodeMapForKrama(
  kramaId: string
): Promise<Map<string, number>> {
  const db = await getDb();
  const rows = await db.select<{ tahun: number; bulan: number; jumlah: number }[]>(
    `SELECT tahun, bulan, jumlah
     FROM dudukan_keringanan
     WHERE krama_id = $1`,
    [kramaId]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(
      periodeKey(row.tahun, row.bulan),
      Math.round(Number(row.jumlah) || 0)
    );
  }
  return map;
}

export type KeringananPeriodeByKrama = Map<string, Map<string, number>>;

function buildKeringananPeriodeMaps(
  rows: { krama_id: string; tahun: number; bulan: number; jumlah: number }[]
): KeringananPeriodeByKrama {
  const result: KeringananPeriodeByKrama = new Map();
  for (const row of rows) {
    let map = result.get(row.krama_id);
    if (!map) {
      map = new Map();
      result.set(row.krama_id, map);
    }
    map.set(
      periodeKey(row.tahun, row.bulan),
      Math.round(Number(row.jumlah) || 0)
    );
  }
  return result;
}

export async function getKeringananPeriodeMapsForPemasihAktif(): Promise<KeringananPeriodeByKrama> {
  const db = await getDb();
  const rows = await db.select<
    { krama_id: string; tahun: number; bulan: number; jumlah: number }[]
  >(
    `SELECT k.krama_id, k.tahun, k.bulan, k.jumlah
     FROM dudukan_keringanan k
     JOIN krama kr ON kr.id = k.krama_id
     JOIN klasifikasi_krama kk ON kk.id = kr.klasifikasi_krama_id
     WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU') AND kr.status_krama = 'aktif'`
  );
  return buildKeringananPeriodeMaps(rows);
}

export async function getKeringananPeriodeMapsForKramaIds(
  kramaIds: string[]
): Promise<KeringananPeriodeByKrama> {
  if (kramaIds.length === 0) return new Map();
  const db = await getDb();
  const ph = kramaIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<
    { krama_id: string; tahun: number; bulan: number; jumlah: number }[]
  >(
    `SELECT krama_id, tahun, bulan, jumlah
     FROM dudukan_keringanan
     WHERE krama_id IN (${ph})`,
    kramaIds
  );
  return buildKeringananPeriodeMaps(rows);
}

export type KeringananDetailByKrama = Map<string, Map<string, DudukanKeringananRow>>;

function buildKeringananDetailMaps(rows: DudukanKeringananRow[]): KeringananDetailByKrama {
  const result: KeringananDetailByKrama = new Map();
  for (const row of rows) {
    let map = result.get(row.krama_id);
    if (!map) {
      map = new Map();
      result.set(row.krama_id, map);
    }
    map.set(periodeKey(row.tahun, row.bulan), {
      ...row,
      tahun: Number(row.tahun),
      bulan: Number(row.bulan),
      jumlah: Math.round(Number(row.jumlah) || 0),
    });
  }
  return result;
}

export async function getKeringananDetailMapsForPemasihAktif(): Promise<KeringananDetailByKrama> {
  const db = await getDb();
  const rows = await db.select<DudukanKeringananRow[]>(
    `SELECT k.*, t.nama as petugas_nama, t.jabatan as petugas_jabatan
     FROM dudukan_keringanan k
     JOIN krama kr ON kr.id = k.krama_id
     JOIN klasifikasi_krama kk ON kk.id = kr.klasifikasi_krama_id
     LEFT JOIN tim_kasukretan t ON t.id = k.petugas_id
     WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU') AND kr.status_krama = 'aktif'`
  );
  return buildKeringananDetailMaps(rows);
}

export async function getKeringananDetailMapsForKramaIds(
  kramaIds: string[]
): Promise<KeringananDetailByKrama> {
  if (kramaIds.length === 0) return new Map();
  const db = await getDb();
  const ph = kramaIds.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.select<DudukanKeringananRow[]>(
    `SELECT k.*, t.nama as petugas_nama, t.jabatan as petugas_jabatan
     FROM dudukan_keringanan k
     LEFT JOIN tim_kasukretan t ON t.id = k.petugas_id
     WHERE k.krama_id IN (${ph})`,
    kramaIds
  );
  return buildKeringananDetailMaps(rows);
}

export async function getKeringananMapForBulanForKramaIds(
  tahun: number,
  bulan: number,
  kramaIds: string[]
): Promise<Map<string, number>> {
  if (kramaIds.length === 0) return new Map();
  const db = await getDb();
  const ph = kramaIds.map((_, i) => `$${i + 3}`).join(", ");
  const rows = await db.select<{ krama_id: string; total: number }[]>(
    `SELECT krama_id, COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_keringanan
     WHERE tahun = $1 AND bulan = $2 AND krama_id IN (${ph})
     GROUP BY krama_id`,
    [parseTahun(tahun), parseBulan(bulan), ...kramaIds]
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row.krama_id), Math.round(Number(row.total) || 0));
  }
  return map;
}

export async function getKeringananDetailMapForKrama(
  kramaId: string
): Promise<Map<string, DudukanKeringananRow>> {
  const db = await getDb();
  const rows = await db.select<DudukanKeringananRow[]>(
    `SELECT k.*, t.nama as petugas_nama, t.jabatan as petugas_jabatan
     FROM dudukan_keringanan k
     LEFT JOIN tim_kasukretan t ON t.id = k.petugas_id
     WHERE k.krama_id = $1`,
    [kramaId]
  );
  const map = new Map<string, DudukanKeringananRow>();
  for (const row of rows) {
    map.set(periodeKey(row.tahun, row.bulan), {
      ...row,
      tahun: Number(row.tahun),
      bulan: Number(row.bulan),
      jumlah: Math.round(Number(row.jumlah) || 0),
    });
  }
  return map;
}

export async function listKeringananDudukanKrama(
  kramaId: string
): Promise<DudukanKeringananRow[]> {
  const db = await getDb();
  return db.select<DudukanKeringananRow[]>(
    `SELECT k.*, t.nama as petugas_nama, t.jabatan as petugas_jabatan
     FROM dudukan_keringanan k
     LEFT JOIN tim_kasukretan t ON t.id = k.petugas_id
     WHERE k.krama_id = $1
     ORDER BY k.tahun DESC, k.bulan DESC, k.created_at DESC`,
    [kramaId]
  );
}

export async function createKeringananDudukan(params: {
  kramaId: string;
  tahun: number;
  bulan: number;
  jumlah: number;
  tanggal: string;
  petugasId: string;
  keterangan: string;
}): Promise<string> {
  const ids = await createKeringananDudukanMulti({
    kramaId: params.kramaId,
    tanggal: params.tanggal,
    petugasId: params.petugasId,
    keterangan: params.keterangan,
    items: [{ tahun: params.tahun, bulan: params.bulan, jumlah: params.jumlah }],
  });
  return ids[0]!;
}

/** Simpan keringanan untuk beberapa bulan sekaligus (satu alasan, satu petugas). */
export async function createKeringananDudukanMulti(params: {
  kramaId: string;
  tanggal: string;
  petugasId: string;
  keterangan: string;
  items: { tahun: number; bulan: number; jumlah: number }[];
}): Promise<string[]> {
  if (!params.items.length) {
    throw new Error("Pilih minimal satu bulan untuk keringanan");
  }

  const alasan = params.keterangan?.trim();
  if (!alasan) throw new Error("Alasan keringanan wajib diisi");

  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal keputusan tidak valid");

  await assertPetugasForKrama(params.petugasId, params.kramaId);

  const ids: string[] = [];
  const db = await getDb();

  for (const item of params.items) {
    const row = await assertDudukanBerlakuUntukKrama(
      params.kramaId,
      item.tahun,
      item.bulan
    );

    const existing = await db.select<{ id: string }[]>(
      `SELECT id FROM dudukan_keringanan
       WHERE krama_id = $1 AND tahun = $2 AND bulan = $3`,
      [params.kramaId, parseTahun(item.tahun), parseBulan(item.bulan)]
    );
    if (existing.length > 0) {
      throw new Error(
        `Keringanan untuk ${item.bulan}/${item.tahun} sudah ada. Hapus dulu jika perlu diubah.`
      );
    }

    const tagihan = hitungTagihanDudukanPeriode(
      Number(row.tarif_nominal) || 0,
      row.tanggal_terdaftar,
      item.tahun,
      item.bulan
    );
    const dibayar = await getTotalDibayarKramaPeriode(
      params.kramaId,
      item.tahun,
      item.bulan
    );
    const sisa = hitungSisaDudukan(tagihan, dibayar);
    const jumlah = parseJumlahPembayaran(item.jumlah);

    if (sisa <= 0) {
      throw new Error(`Tidak ada sisa tagihan untuk ${item.bulan}/${item.tahun}`);
    }
    if (jumlah > sisa) {
      throw new Error(
        `Keringanan ${item.bulan}/${item.tahun} melebihi sisa tagihan (${sisa})`
      );
    }

    const id = uuid();
    await db.execute(
      `INSERT INTO dudukan_keringanan
        (id, krama_id, tahun, bulan, jumlah, tanggal, petugas_id, keterangan, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, datetime('now'))`,
      [
        id,
        params.kramaId,
        parseTahun(item.tahun),
        parseBulan(item.bulan),
        jumlah,
        tanggal,
        params.petugasId,
        alasan,
      ]
    );
    ids.push(id);
  }

  const { tryAutoPushKeringanan } = await import("../sync/auto-push-keringanan");
  void tryAutoPushKeringanan(ids);
  return ids;
}

export async function updateKeringananDudukan(
  id: string,
  params: {
    kramaId: string;
    tahun: number;
    bulan: number;
    jumlah: number;
    tanggal: string;
    petugasId: string;
    keterangan: string;
  }
): Promise<void> {
  const alasan = params.keterangan?.trim();
  if (!alasan) throw new Error("Alasan keringanan wajib diisi");

  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal keputusan tidak valid");

  const db = await getDb();
  const existing = await db.select<
    { krama_id: string; tahun: number; bulan: number }[]
  >(`SELECT krama_id, tahun, bulan FROM dudukan_keringanan WHERE id = $1`, [id]);
  const row0 = existing[0];
  if (!row0) throw new Error("Keringanan tidak ditemukan");
  if (row0.krama_id !== params.kramaId) {
    throw new Error("Keringanan tidak sesuai krama");
  }
  if (
    parseTahun(row0.tahun) !== parseTahun(params.tahun) ||
    parseBulan(row0.bulan) !== parseBulan(params.bulan)
  ) {
    throw new Error("Periode keringanan tidak dapat diubah");
  }

  await assertPetugasForKrama(params.petugasId, params.kramaId);
  const row = await assertDudukanBerlakuUntukKrama(
    params.kramaId,
    params.tahun,
    params.bulan
  );

  const tagihan = hitungTagihanDudukanPeriode(
    Number(row.tarif_nominal) || 0,
    row.tanggal_terdaftar,
    params.tahun,
    params.bulan
  );
  const dibayar = await getTotalDibayarKramaPeriode(
    params.kramaId,
    params.tahun,
    params.bulan
  );
  const sisa = hitungSisaDudukan(tagihan, dibayar);
  const jumlah = parseJumlahPembayaran(params.jumlah);

  if (jumlah <= 0) throw new Error("Jumlah keringanan harus lebih dari 0");
  if (jumlah > sisa) {
    throw new Error(`Keringanan melebihi sisa tagihan (${sisa})`);
  }

  await db.execute(
    `UPDATE dudukan_keringanan SET
      jumlah = $1, tanggal = $2, petugas_id = $3, keterangan = $4
     WHERE id = $5`,
    [jumlah, tanggal, params.petugasId, alasan, id]
  );
  const { tryAutoPushKeringanan } = await import("../sync/auto-push-keringanan");
  void tryAutoPushKeringanan([id]);
}

export async function deleteKeringananDudukan(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM dudukan_keringanan WHERE id = $1`, [id]);
  const { queueKeringananDeletion } = await import("../sync/keringanan-deletions");
  await queueKeringananDeletion(id);
  const { tryAutoPushKeringananDeletions } = await import("../sync/auto-push-keringanan");
  void tryAutoPushKeringananDeletions();
}
