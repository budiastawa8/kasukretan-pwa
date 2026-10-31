import { parseIsoDateString } from "../date-iso";
import { getDb } from "../db/client";
import { parseJumlahPembayaran } from "../paturunan-hitung";
import type {
  PenerimaanDanaLainJenis,
  PenerimaanDanaLainRow,
  PenerimaanDanaLainSatuanWaktu,
  PenerimaanDanaLainSumberTipe,
} from "../types";
import { uuid } from "../utils";
import {
  assertAkunForDanaKasukretanLainnya,
  getDefaultAkunDanaKasukretanLainnyaId,
  listAkunForDanaKasukretanLainnya,
} from "./akun-keuangan";
import { POS_PEMASUKAN_DANA_NAMA, getPosPemasukanDanaByNama } from "./pos-dana-kasukretan";
import { assertPembayaranBelumMasukSetoran } from "./setoran";

export const PENERIMAAN_DANA_LAIN_JENIS = ["punia_kasukretan", "dana_kerjasama"] as const;

export const SUMBER_TIPE_OPTIONS: { value: PenerimaanDanaLainSumberTipe; label: string }[] = [
  { value: "krama_mipil", label: "Krama Mipil" },
  { value: "krama_tamiu", label: "Krama Tamiu" },
  { value: "tamiu", label: "Tamiu" },
  { value: "lembaga", label: "Lembaga" },
  { value: "pelaku_usaha", label: "Pelaku Usaha" },
  { value: "lainnya", label: "Lainnya" },
];

export const MITRA_JENIS_OPTIONS = [
  "Hotel/Penginapan",
  "Warung",
  "Toko",
  "Pedagang Kaki Lima",
  "Jasa Konstruksi/Pengembang",
  "Penyelenggara Acara/Pesta",
  "Konser/Pertemuan",
  "Lainnya",
] as const;

export function isPenerimaanDanaLainJenis(v: unknown): v is PenerimaanDanaLainJenis {
  return v === "punia_kasukretan" || v === "dana_kerjasama";
}

export function labelJenisPenerimaanDanaLain(jenis: PenerimaanDanaLainJenis): string {
  return jenis === "punia_kasukretan" ? "Punia Kasukretan" : "Dana Kerjasama Kasukretan";
}

export function hitungJumlahKerjasama(params: {
  tarifSatuan: number;
  jumlahOrang: number;
  lama: number;
}): number {
  const tarif = Math.round(Number(params.tarifSatuan) || 0);
  const orang = Math.max(0, Math.floor(Number(params.jumlahOrang) || 0));
  const lama = Math.max(0, Number(params.lama) || 0);
  return Math.round(tarif * orang * lama);
}

async function resolvePosId(jenis: PenerimaanDanaLainJenis): Promise<string> {
  const nama =
    jenis === "punia_kasukretan"
      ? POS_PEMASUKAN_DANA_NAMA.puniaKasukretan
      : POS_PEMASUKAN_DANA_NAMA.danaKerjasama;
  const pos = await getPosPemasukanDanaByNama(nama);
  if (!pos) throw new Error(`Pos ${nama} belum dikonfigurasi`);
  return pos.id;
}

function normalizeSumberTipe(v: unknown): PenerimaanDanaLainSumberTipe {
  const allowed = new Set(SUMBER_TIPE_OPTIONS.map((o) => o.value));
  if (typeof v === "string" && allowed.has(v as PenerimaanDanaLainSumberTipe)) {
    return v as PenerimaanDanaLainSumberTipe;
  }
  return "lainnya";
}

function normalizeSatuanWaktu(v: unknown): PenerimaanDanaLainSatuanWaktu | null {
  if (v === "hari" || v === "bulan") return v;
  return null;
}

function sumberTipeDariKlasifikasi(kode: string | null | undefined): PenerimaanDanaLainSumberTipe {
  if (kode === "MIPIL") return "krama_mipil";
  if (kode === "KRAMA_TAMIU") return "krama_tamiu";
  if (kode === "TAMIU") return "tamiu";
  return "lainnya";
}

export async function listAkunForPenerimaanDanaLain() {
  return listAkunForDanaKasukretanLainnya();
}

const SELECT_ROW = `
  SELECT p.*,
         pb.nama as pos_pemasukan_nama,
         a.nama as akun_keuangan_nama,
         t.nama as petugas_nama
  FROM penerimaan_dana_lain p
  LEFT JOIN pos_pemasukan pb ON pb.id = p.pos_pemasukan_id
  LEFT JOIN akun_keuangan a ON a.id = p.akun_keuangan_id
  LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id`;

function mapRow(r: PenerimaanDanaLainRow): PenerimaanDanaLainRow {
  return {
    ...r,
    jenis: isPenerimaanDanaLainJenis(r.jenis) ? r.jenis : "punia_kasukretan",
    jumlah: Math.round(Number(r.jumlah) || 0),
    sumber_tipe: normalizeSumberTipe(r.sumber_tipe),
    satuan_waktu: normalizeSatuanWaktu(r.satuan_waktu),
    jumlah_orang: r.jumlah_orang == null ? null : Math.floor(Number(r.jumlah_orang) || 0),
    lama: r.lama == null ? null : Number(r.lama) || 0,
    tarif_satuan: r.tarif_satuan == null ? null : Math.round(Number(r.tarif_satuan) || 0),
  };
}

export async function listPenerimaanDanaLain(params?: {
  jenis?: PenerimaanDanaLainJenis;
  petugasId?: string;
  dari?: string;
  sampai?: string;
  limit?: number;
}): Promise<PenerimaanDanaLainRow[]> {
  const db = await getDb();
  let sql = `${SELECT_ROW} WHERE 1=1`;
  const args: unknown[] = [];
  if (params?.jenis) {
    sql += ` AND p.jenis = ?`;
    args.push(params.jenis);
  }
  if (params?.petugasId) {
    sql += ` AND p.petugas_id = ?`;
    args.push(params.petugasId);
  }
  const dari = params?.dari ? parseIsoDateString(params.dari) : null;
  if (dari) {
    sql += ` AND p.tanggal >= ?`;
    args.push(dari);
  }
  const sampai = params?.sampai ? parseIsoDateString(params.sampai) : null;
  if (sampai) {
    sql += ` AND p.tanggal <= ?`;
    args.push(sampai);
  }
  sql += ` ORDER BY p.tanggal DESC, p.created_at DESC`;
  if (params?.limit && params.limit > 0) {
    sql += ` LIMIT ?`;
    args.push(params.limit);
  }
  const rows = await db.select<PenerimaanDanaLainRow[]>(sql, args);
  return rows.map(mapRow);
}

export async function getPenerimaanDanaLain(id: string): Promise<PenerimaanDanaLainRow | null> {
  const db = await getDb();
  const rows = await db.select<PenerimaanDanaLainRow[]>(`${SELECT_ROW} WHERE p.id = ?`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

export type CreatePenerimaanDanaLainInput = {
  jenis: PenerimaanDanaLainJenis;
  tanggal: string;
  jumlah: number;
  petugasId?: string | null;
  akunKeuanganId?: string | null;
  keterangan?: string;
  sumberTipe: PenerimaanDanaLainSumberTipe;
  kramaId?: string | null;
  lembagaBadanId?: string | null;
  sumberNama?: string | null;
  kegiatan?: string | null;
  mitraJenis?: string | null;
  jumlahOrang?: number | null;
  satuanWaktu?: PenerimaanDanaLainSatuanWaktu | null;
  lama?: number | null;
  tarifSatuan?: number | null;
  /** false = uang di tangan petugas; default true (setor langsung). */
  disetorLangsung?: boolean;
  createdBy?: string | null;
};

export async function createPenerimaanDanaLain(
  params: CreatePenerimaanDanaLainInput
): Promise<string> {
  if (!isPenerimaanDanaLainJenis(params.jenis)) {
    throw new Error("Jenis penerimaan tidak valid");
  }
  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal tidak valid");

  const jumlah = parseJumlahPembayaran(params.jumlah);
  if (jumlah <= 0) throw new Error("Jumlah harus lebih dari 0");

  const sumberTipe = normalizeSumberTipe(params.sumberTipe);
  let kramaId = params.kramaId?.trim() || null;
  let lembagaId = params.lembagaBadanId?.trim() || null;
  let sumberNama = params.sumberNama?.trim() || null;

  const db = await getDb();

  let sumberTipeFinal = sumberTipe;
  if (kramaId) {
    const rows = await db.select<{ nama: string; klasifikasi_kode: string | null }[]>(
      `SELECT pd.nama_lengkap as nama, kk.kode as klasifikasi_kode
       FROM krama k
       JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
       LEFT JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       WHERE k.id = ?`,
      [kramaId]
    );
    const k = rows[0];
    if (!k) throw new Error("Krama tidak ditemukan");
    if (!sumberNama) sumberNama = k.nama;
    if (
      sumberTipe === "lainnya" ||
      sumberTipe === "krama_mipil" ||
      sumberTipe === "krama_tamiu" ||
      sumberTipe === "tamiu"
    ) {
      sumberTipeFinal = sumberTipeDariKlasifikasi(k.klasifikasi_kode);
    }
  }

  if (lembagaId) {
    const rows = await db.select<{ nama: string }[]>(
      `SELECT nama FROM lembaga_badan WHERE id = ?`,
      [lembagaId]
    );
    if (!rows[0]) throw new Error("Lembaga/badan tidak ditemukan");
    if (!sumberNama) sumberNama = rows[0].nama;
  }

  if (!kramaId && !lembagaId && !sumberNama) {
    throw new Error("Isi nama pemberi/mitra, atau pilih krama/lembaga");
  }

  const akunId = params.akunKeuanganId?.trim() || (await getDefaultAkunDanaKasukretanLainnyaId());
  await assertAkunForDanaKasukretanLainnya(akunId);

  const posId = await resolvePosId(params.jenis);
  const tanggalSetor = params.disetorLangsung === false ? null : tanggal;
  const id = uuid();

  await db.execute(
    `INSERT INTO penerimaan_dana_lain (
       id, jenis, pos_pemasukan_id, jumlah, tanggal, petugas_id, akun_keuangan_id, keterangan,
       sumber_tipe, krama_id, lembaga_badan_id, sumber_nama, kegiatan,
       mitra_jenis, jumlah_orang, satuan_waktu, lama, tarif_satuan,
       setoran_id, tanggal_setor, created_by, created_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       NULL, ?, ?, datetime('now')
     )`,
    [
      id,
      params.jenis,
      posId,
      jumlah,
      tanggal,
      params.petugasId?.trim() || null,
      akunId,
      params.keterangan?.trim() || null,
      sumberTipeFinal,
      kramaId,
      lembagaId,
      sumberNama,
      params.kegiatan?.trim() || null,
      params.mitraJenis?.trim() || null,
      params.jumlahOrang == null ? null : Math.floor(Number(params.jumlahOrang) || 0),
      normalizeSatuanWaktu(params.satuanWaktu),
      params.lama == null ? null : Number(params.lama) || 0,
      params.tarifSatuan == null ? null : Math.round(Number(params.tarifSatuan) || 0),
      tanggalSetor,
      params.createdBy?.trim() || null,
    ]
  );
  return id;
}

export async function updatePenerimaanDanaLain(
  id: string,
  params: Omit<CreatePenerimaanDanaLainInput, "jenis" | "disetorLangsung" | "createdBy"> & {
    jenis?: PenerimaanDanaLainJenis;
  }
): Promise<void> {
  await assertPembayaranBelumMasukSetoran("dana_lain", id);
  const existing = await getPenerimaanDanaLain(id);
  if (!existing) throw new Error("Penerimaan tidak ditemukan");

  const jenis = params.jenis ?? existing.jenis;
  if (!isPenerimaanDanaLainJenis(jenis)) throw new Error("Jenis penerimaan tidak valid");

  const tanggal = parseIsoDateString(params.tanggal);
  if (!tanggal) throw new Error("Tanggal tidak valid");
  const jumlah = parseJumlahPembayaran(params.jumlah);
  if (jumlah <= 0) throw new Error("Jumlah harus lebih dari 0");

  const sumberNama = params.sumberNama?.trim() || null;
  const kramaId = params.kramaId?.trim() || null;
  const lembagaId = params.lembagaBadanId?.trim() || null;
  if (!kramaId && !lembagaId && !sumberNama) {
    throw new Error("Isi nama pemberi/mitra, atau pilih krama/lembaga");
  }

  const akunId = params.akunKeuanganId?.trim() || existing.akun_keuangan_id;
  if (!akunId) throw new Error("Akun keuangan wajib");
  await assertAkunForDanaKasukretanLainnya(akunId);

  const posId = await resolvePosId(jenis);
  const db = await getDb();
  const sudahSetor = !!existing.tanggal_setor;
  await db.execute(
    `UPDATE penerimaan_dana_lain SET
       jenis = ?, pos_pemasukan_id = ?, jumlah = ?, tanggal = ?, petugas_id = ?,
       akun_keuangan_id = ?, keterangan = ?, sumber_tipe = ?, krama_id = ?,
       lembaga_badan_id = ?, sumber_nama = ?, kegiatan = ?, mitra_jenis = ?,
       jumlah_orang = ?, satuan_waktu = ?, lama = ?, tarif_satuan = ?,
       tanggal_setor = CASE WHEN ? THEN ? ELSE tanggal_setor END
     WHERE id = ?`,
    [
      jenis,
      posId,
      jumlah,
      tanggal,
      params.petugasId?.trim() || null,
      akunId,
      params.keterangan?.trim() || null,
      normalizeSumberTipe(params.sumberTipe),
      kramaId,
      lembagaId,
      sumberNama,
      params.kegiatan?.trim() || null,
      params.mitraJenis?.trim() || null,
      params.jumlahOrang == null ? null : Math.floor(Number(params.jumlahOrang) || 0),
      normalizeSatuanWaktu(params.satuanWaktu),
      params.lama == null ? null : Number(params.lama) || 0,
      params.tarifSatuan == null ? null : Math.round(Number(params.tarifSatuan) || 0),
      sudahSetor && !existing.setoran_id ? 1 : 0,
      tanggal,
      id,
    ]
  );
}

export async function deletePenerimaanDanaLain(
  id: string,
  alasan: import("./pembayaran-hapus-log").AlasanHapusPembayaran
): Promise<void> {
  await assertPembayaranBelumMasukSetoran("dana_lain", id);
  const { catatHapusPembayaran } = await import("./pembayaran-hapus-log");
  await catatHapusPembayaran("dana_lain", id, alasan);
  const db = await getDb();
  await db.execute(`DELETE FROM penerimaan_dana_lain WHERE id = ?`, [id]);
}
