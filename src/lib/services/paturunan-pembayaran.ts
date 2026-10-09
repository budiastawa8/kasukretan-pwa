import { getDb } from "../db/client";
import { parseIsoDateString } from "../date-iso";
import { isJabatanPenerimaSemuaBanjar } from "../petugas-jabatan";
import {
  alokasiPembayaranBaru,
  hitungSisaPaturunan,
  hitungTagihanPaturunan,
  parseJumlahPembayaran,
  parsePembayaranJenis,
  resolvePersenPaturunanIuran,
} from "../paturunan-hitung";
import type { PaturunanPembayaranJenis, PaturunanPembayaranRow } from "../types";
import { uuid } from "../utils";
import {
  assertAkunForPembayaranPaturunan,
  getDefaultAkunPaturunanId,
} from "./akun-keuangan";
import { assertKramaAktifUntukPembayaran } from "./krama";

export type PaturunanPembayaranSaveOptions = {
  /** Impor riwayat — izinkan krama nonaktif. */
  riwayatImport?: boolean;
};

export type PembayaranTotals = { wajib: number; punia: number };

function emptyTotals(): PembayaranTotals {
  return { wajib: 0, punia: 0 };
}

function normalizeJenis(raw?: string | null): PaturunanPembayaranJenis {
  return raw === "punia" ? "punia" : "wajib";
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

export async function getPembayaranTotalsMap(
  iuranId: string
): Promise<Map<string, PembayaranTotals>> {
  const db = await getDb();
  const rows = await db.select<{ krama_id: string; jenis: string; total: number }[]>(
    `SELECT krama_id, COALESCE(jenis, 'wajib') as jenis, COALESCE(SUM(jumlah), 0) as total
     FROM paturunan_pembayaran
     WHERE iuran_id = $1
     GROUP BY krama_id, jenis`,
    [iuranId]
  );
  const map = new Map<string, PembayaranTotals>();
  for (const row of rows) {
    const cur = map.get(row.krama_id) ?? emptyTotals();
    const jumlah = Math.round(Number(row.total) || 0);
    if (normalizeJenis(row.jenis) === "punia") {
      cur.punia += jumlah;
    } else {
      cur.wajib += jumlah;
    }
    map.set(row.krama_id, cur);
  }
  return map;
}

export async function getPembayaranTotals(
  kramaId: string,
  iuranId: string
): Promise<PembayaranTotals> {
  const db = await getDb();
  const rows = await db.select<{ jenis: string; total: number }[]>(
    `SELECT COALESCE(jenis, 'wajib') as jenis, COALESCE(SUM(jumlah), 0) as total
     FROM paturunan_pembayaran
     WHERE krama_id = $1 AND iuran_id = $2
     GROUP BY jenis`,
    [kramaId, iuranId]
  );
  const totals = emptyTotals();
  for (const row of rows) {
    const jumlah = Math.round(Number(row.total) || 0);
    if (normalizeJenis(row.jenis) === "punia") {
      totals.punia += jumlah;
    } else {
      totals.wajib += jumlah;
    }
  }
  return totals;
}

export async function assertPaturunanWajibPaymentAllowed(
  kramaId: string,
  iuranId: string,
  jumlah: number,
  tagihan: number
): Promise<void> {
  const totals = await getPembayaranTotals(kramaId, iuranId);
  const sisa = hitungSisaPaturunan(tagihan, totals.wajib);
  const amt = parseJumlahPembayaran(jumlah);
  if (tagihan > 0 && sisa <= 0) {
    throw new Error("Paturunan sudah lunas untuk iuran ini");
  }
  if (amt > sisa) {
    throw new Error(`Jumlah melebihi sisa tagihan (sisa ${sisa})`);
  }
}

export async function getTagihanPaturunanKramaIuran(
  kramaId: string,
  iuranId: string
): Promise<number> {
  return resolveTagihanPaturunan(kramaId, iuranId);
}

async function resolveTagihanPaturunan(kramaId: string, iuranId: string): Promise<number> {
  const db = await getDb();
  const iuranRows = await db.select<{ nominal: number; tanggal_target: string | null }[]>(
    `SELECT nominal, tanggal_target FROM iuran_paturunan WHERE id = $1 AND aktif = 1`,
    [iuranId]
  );
  const kramaRows = await db.select<
    {
      paturunan_persen: number;
      nyada_sejak: string | null;
      paturunan_persen_sebelum_nyada: number | null;
      nyada_sampai: string | null;
      paturunan_persen_nyada: number | null;
    }[]
  >(
    `SELECT COALESCE(jm.paturunan_persen, 0) as paturunan_persen,
            k.nyada_sejak, jprev.paturunan_persen as paturunan_persen_sebelum_nyada,
            k.nyada_sampai, jny.paturunan_persen as paturunan_persen_nyada
     FROM krama k
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     LEFT JOIN jenis_krama_mipil jprev ON jprev.id = k.jenis_sebelum_nyada_id
     LEFT JOIN desa_adat d ON d.id = k.desa_adat_id
     LEFT JOIN jenis_krama_mipil jny ON jny.id = d.jenis_krama_mipil_id
     WHERE k.id = $1`,
    [kramaId]
  );
  const k = kramaRows[0];
  return hitungTagihanPaturunan(
    Number(iuranRows[0]?.nominal) || 0,
    resolvePersenPaturunanIuran({
      persen: k?.paturunan_persen,
      persenSebelumNyada: k?.paturunan_persen_sebelum_nyada,
      nyadaSejak: k?.nyada_sejak,
      persenNyada: k?.paturunan_persen_nyada,
      nyadaSampai: k?.nyada_sampai,
      tanggalTarget: iuranRows[0]?.tanggal_target,
    })
  );
}

export async function assertPaturunanPaymentAllowed(
  kramaId: string,
  iuranId: string,
  jenis: PaturunanPembayaranJenis,
  jumlah: number
): Promise<void> {
  if (jenis === "punia") return;
  const tagihan = await resolveTagihanPaturunan(kramaId, iuranId);
  await assertPaturunanWajibPaymentAllowed(kramaId, iuranId, jumlah, tagihan);
}

export type PaturunanRiwayatRow = {
  id: string;
  krama_id: string;
  iuran_id: string;
  nomor_kartu: string;
  kepala_nama: string;
  banjar_nama: string;
  banjar_id?: string | null;
  banjar_kode?: string | null;
  tempek_nama: string;
  tempek_created_at?: string | null;
  arahan_nama: string;
  jenis_krama_mipil_id?: string | null;
  jenis_created_at?: string | null;
  jenis_nama: string;
  iuran_nama: string;
  iuran_created_at?: string | null;
  jenis: PaturunanPembayaranJenis;
  jumlah: number;
  tanggal: string;
  petugas_nama?: string | null;
  keterangan?: string | null;
};

export async function listRiwayatPembayaranPaturunan(params?: {
  iuranId?: string;
  banjarId?: string;
  tempekId?: string;
  petugasId?: string;
  dari?: string;
  sampai?: string;
  jenis?: PaturunanPembayaranJenis;
  q?: string;
}): Promise<PaturunanRiwayatRow[]> {
  const db = await getDb();
  let sql = `
    SELECT p.id, p.krama_id, p.iuran_id, k.nomor_kartu, pd.nama_lengkap as kepala_nama,
           b.nama as banjar_nama, k.banjar_id, b.kode as banjar_kode,
           COALESCE(NULLIF(TRIM(tp.nama), ''), '—') as tempek_nama,
           tp.created_at as tempek_created_at,
           COALESCE(NULLIF(TRIM(ar.nama), ''), '—') as arahan_nama,
           k.jenis_krama_mipil_id,
           jm.created_at as jenis_created_at,
           COALESCE(NULLIF(TRIM(jm.nama), ''), '—') as jenis_nama,
           i.nama as iuran_nama, i.created_at as iuran_created_at,
           COALESCE(p.jenis, 'wajib') as jenis, p.jumlah, p.tanggal,
           t.nama as petugas_nama, p.keterangan
    FROM paturunan_pembayaran p
    JOIN krama k ON k.id = p.krama_id
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
    JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
    JOIN iuran_paturunan i ON i.id = p.iuran_id
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tempek tp ON tp.id = k.tempek_id
    LEFT JOIN arahan ar ON ar.id = k.arahan_id
    LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
    LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
    WHERE 1=1
  `;
  const args: unknown[] = [];
  let n = 1;
  if (params?.iuranId) {
    sql += ` AND p.iuran_id = $${n++}`;
    args.push(params.iuranId);
  }
  if (params?.banjarId) {
    sql += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId);
  }
  if (params?.tempekId) {
    sql += ` AND k.tempek_id = $${n++}`;
    args.push(params.tempekId);
  }
  if (params?.petugasId) {
    sql += ` AND p.petugas_id = $${n++}`;
    args.push(params.petugasId);
  }
  if (params?.dari?.trim()) {
    sql += ` AND p.tanggal >= $${n++}`;
    args.push(params.dari.trim());
  }
  if (params?.sampai?.trim()) {
    sql += ` AND p.tanggal <= $${n++}`;
    args.push(params.sampai.trim());
  }
  if (params?.jenis) {
    sql += ` AND COALESCE(p.jenis, 'wajib') = $${n++}`;
    args.push(params.jenis);
  }
  if (params?.q?.trim()) {
    const q = `%${params.q.trim()}%`;
    sql += ` AND (k.nomor_kartu LIKE $${n} OR pd.nama_lengkap LIKE $${n + 1})`;
    args.push(q, q);
    n += 2;
  }
  sql += ` ORDER BY p.tanggal DESC, p.created_at DESC`;

  const rows = await db.select<PaturunanRiwayatRow[]>(sql, args);
  return rows.map((r) => ({
    ...r,
    jenis: normalizeJenis(r.jenis),
    jumlah: Math.round(Number(r.jumlah) || 0),
  }));
}

export type KartuPaturunanPembayaranRow = {
  iuran_nama: string;
  jenis: PaturunanPembayaranJenis;
  jumlah: number;
  tanggal: string;
  petugas_nama: string;
};

/** Semua pembayaran paturunan satu krama — untuk kartu paturunan. */
export async function listPembayaranPaturunanByKrama(
  kramaId: string
): Promise<KartuPaturunanPembayaranRow[]> {
  const db = await getDb();
  const rows = await db.select<KartuPaturunanPembayaranRow[]>(
    `SELECT i.nama as iuran_nama,
            COALESCE(p.jenis, 'wajib') as jenis,
            p.jumlah, p.tanggal,
            COALESCE(t.nama, '') as petugas_nama
     FROM paturunan_pembayaran p
     JOIN iuran_paturunan i ON i.id = p.iuran_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE p.krama_id = $1
     ORDER BY p.tanggal ASC, p.created_at ASC`,
    [kramaId]
  );
  return rows.map((r) => ({
    ...r,
    jenis: normalizeJenis(r.jenis),
    jumlah: Math.round(Number(r.jumlah) || 0),
  }));
}

export async function listPembayaranPaturunan(
  kramaId: string,
  iuranId: string
): Promise<PaturunanPembayaranRow[]> {
  const db = await getDb();
  const rows = await db.select<PaturunanPembayaranRow[]>(
    `SELECT p.*, t.nama as petugas_nama, t.jabatan as petugas_jabatan,
            a.nama as akun_keuangan_nama
     FROM paturunan_pembayaran p
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
     WHERE p.krama_id = $1 AND p.iuran_id = $2
     ORDER BY p.tanggal DESC, p.created_at DESC`,
    [kramaId, iuranId]
  );
  return rows.map((r) => ({ ...r, jenis: normalizeJenis(r.jenis) }));
}

async function insertPembayaran(params: {
  kramaId: string;
  iuranId: string;
  jenis: PaturunanPembayaranJenis;
  jumlah: number;
  tanggal: string;
  petugasId: string;
  keterangan?: string;
  akunKeuanganId?: string;
}): Promise<string> {
  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal pembayaran tidak valid");
  await assertPetugasForKrama(params.petugasId, params.kramaId);

  const akunId = params.akunKeuanganId?.trim() || (await getDefaultAkunPaturunanId());
  await assertAkunForPembayaranPaturunan(akunId);

  const db = await getDb();
  const id = uuid();
  await db.execute(
    `INSERT INTO paturunan_pembayaran
      (id, krama_id, iuran_id, jenis, jumlah, tanggal, petugas_id, akun_keuangan_id, keterangan, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, datetime('now'))`,
    [
      id,
      params.kramaId,
      params.iuranId,
      params.jenis,
      parseJumlahPembayaran(params.jumlah),
      tanggal,
      params.petugasId,
      akunId,
      params.keterangan?.trim() || null,
    ]
  );
  return id;
}

/** Simpan pembayaran dengan alokasi otomatis wajib / punia. */
export async function createPembayaranDenganAlokasi(
  params: {
    kramaId: string;
    iuranId: string;
    jumlah: number;
    tanggal: string;
    tagihan: number;
    petugasId: string;
    keterangan?: string;
    akunKeuanganId?: string;
  },
  opts?: PaturunanPembayaranSaveOptions
): Promise<string[]> {
  if (!opts?.riwayatImport) await assertKramaAktifUntukPembayaran(params.kramaId);
  const totals = await getPembayaranTotals(params.kramaId, params.iuranId);
  const { wajib, punia } = alokasiPembayaranBaru(
    params.tagihan,
    totals.wajib,
    params.jumlah
  );
  const ids: string[] = [];
  const ket = params.keterangan?.trim() || null;

  if (wajib > 0) {
    ids.push(
      await insertPembayaran({
        kramaId: params.kramaId,
        iuranId: params.iuranId,
        jenis: "wajib",
        jumlah: wajib,
        tanggal: params.tanggal,
        petugasId: params.petugasId,
        keterangan: ket ?? undefined,
        akunKeuanganId: params.akunKeuanganId,
      })
    );
  }
  if (punia > 0) {
    ids.push(
      await insertPembayaran({
        kramaId: params.kramaId,
        iuranId: params.iuranId,
        jenis: "punia",
        jumlah: punia,
        tanggal: params.tanggal,
        petugasId: params.petugasId,
        keterangan:
          ket ??
          (wajib > 0 ? "Kelebihan atas kewajiban paturunan" : undefined),
        akunKeuanganId: params.akunKeuanganId,
      })
    );
  }

  const { tryAutoPushPayments } = await import("../sync/auto-push-payment");
  void tryAutoPushPayments({ paturunanIds: ids });

  return ids;
}

export async function updatePembayaranPaturunan(
  id: string,
  params: {
    kramaId: string;
    jenis: PaturunanPembayaranJenis;
    jumlah: number;
    tanggal: string;
    petugasId: string;
    keterangan?: string;
    akunKeuanganId?: string;
  }
): Promise<void> {
  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal pembayaran tidak valid");
  await assertPetugasForKrama(params.petugasId, params.kramaId);

  const akunId = params.akunKeuanganId?.trim();
  if (akunId) await assertAkunForPembayaranPaturunan(akunId);

  const db = await getDb();
  await db.execute(
    `UPDATE paturunan_pembayaran SET
      jenis = $1, jumlah = $2, tanggal = $3, petugas_id = $4, keterangan = $5,
      akun_keuangan_id = COALESCE($6, akun_keuangan_id)
     WHERE id = $7`,
    [
      parsePembayaranJenis(params.jenis),
      parseJumlahPembayaran(params.jumlah),
      tanggal,
      params.petugasId,
      params.keterangan?.trim() || null,
      akunId ?? null,
      id,
    ]
  );
}

export async function deletePembayaranPaturunan(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM paturunan_pembayaran WHERE id = $1`, [id]);
  const { queuePaymentDeletion } = await import("../sync/payment-deletions");
  const { tryAutoPushPaymentDeletions } = await import("../sync/auto-push-payment");
  await queuePaymentDeletion("paturunan", id);
  void tryAutoPushPaymentDeletions();
}

/** Satu baris pembayaran paturunan (jenis wajib/punia eksplisit) — untuk impor Excel. */
export async function createPembayaranPaturunan(
  params: {
    kramaId: string;
    iuranId: string;
    jenis: PaturunanPembayaranJenis;
    jumlah: number;
    tanggal: string;
    petugasId: string;
    keterangan?: string;
    akunKeuanganId?: string;
  },
  opts?: PaturunanPembayaranSaveOptions
): Promise<string> {
  if (!opts?.riwayatImport) await assertKramaAktifUntukPembayaran(params.kramaId);
  return insertPembayaran({
    ...params,
    jenis: parsePembayaranJenis(params.jenis),
  });
}
