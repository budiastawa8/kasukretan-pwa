import { getDb } from "../db/client";
import {
  getBentukHukumOptions,
  isValidBentukHukum,
  getFokusBidangOptions,
  isValidFokusBidang,
  isValidSektorUtama,
  SEKTOR_SWASTA_KOMERSIAL,
  type SektorUtama,
} from "../lembaga-badan-options";
import type { LembagaBadanListItem, LembagaBadanRow, MautsahaAdatStatus } from "../types";
import { today, uuid } from "../utils";
import { computeMautsahaStatus } from "../mautsaha-status";
import { getDesaAdat } from "./desa";
import { getKramaDetail } from "./krama";

export type LembagaBadanInput = {
  nama: string;
  alamat?: string;
  sektorUtama: string;
  bentukHukum: string;
  fokusBidang: string;
  nomorLegalitas?: string;
  namaPenanggungJawab: string;
  noKontak?: string;
  penanggungJawabKramaId?: string | null;
};

export type LembagaBadanFilter = {
  q?: string;
  sektorUtama?: string;
  aktifOnly?: boolean;
};

function assertLembagaInput(input: LembagaBadanInput): void {
  const nama = input.nama.trim();
  if (!nama) throw new Error("Nama lembaga/badan wajib diisi");
  if (!isValidSektorUtama(input.sektorUtama)) throw new Error("Sektor utama tidak valid");
  const sektor = input.sektorUtama as SektorUtama;
  if (!isValidBentukHukum(sektor, input.bentukHukum.trim())) {
    throw new Error("Bentuk hukum/organisasi tidak valid untuk sektor terpilih");
  }
  if (!isValidFokusBidang(sektor, input.fokusBidang.trim())) {
    throw new Error("Fokus bidang tidak valid untuk sektor terpilih");
  }
  const pj = input.namaPenanggungJawab.trim();
  if (!pj) throw new Error("Nama penanggung jawab wajib diisi");
  if (sektor === SEKTOR_SWASTA_KOMERSIAL && !input.penanggungJawabKramaId?.trim()) {
    throw new Error("Penanggung jawab wajib dipilih dari data Krama untuk Swasta Komersial");
  }
}

async function assertKramaPenanggungJawab(kramaId: string): Promise<void> {
  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama penanggung jawab tidak ditemukan");
  if (krama.status_krama !== "aktif") {
    throw new Error("Krama penanggung jawab harus berstatus aktif");
  }
}

export async function listLembagaBadan(filter?: LembagaBadanFilter): Promise<LembagaBadanListItem[]> {
  const db = await getDb();
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter?.aktifOnly !== false) {
    clauses.push("lb.aktif = 1");
  }
  if (filter?.sektorUtama?.trim()) {
    clauses.push("lb.sektor_utama = ?");
    params.push(filter.sektorUtama.trim());
  }
  if (filter?.q?.trim()) {
    const q = `%${filter.q.trim()}%`;
    clauses.push(
      `(lb.nama LIKE ? OR lb.alamat LIKE ? OR lb.nama_penanggung_jawab LIKE ? OR lb.nomor_legalitas LIKE ?)`
    );
    params.push(q, q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db.select<LembagaBadanRow[]>(
    `SELECT lb.* FROM lembaga_badan lb ${where} ORDER BY lb.nama COLLATE NOCASE`,
    params
  );

  const result: LembagaBadanListItem[] = [];
  for (const row of rows) {
    const item: LembagaBadanListItem = { ...row };
    if (row.sektor_utama === SEKTOR_SWASTA_KOMERSIAL) {
      const hari = today();
      const aktif = await db.select<{ nomor_surat: string; tanggal_berlaku_sampai: string }[]>(
        `SELECT nomor_surat, tanggal_berlaku_sampai FROM surat_keterangan_mautsaha_adat
         WHERE lembaga_badan_id = ? AND tanggal_berlaku_sampai >= ?
         ORDER BY tanggal_terbit DESC, created_at DESC LIMIT 1`,
        [row.id, hari]
      );
      const latest = await db.select<{ nomor_surat: string; tanggal_berlaku_sampai: string }[]>(
        `SELECT nomor_surat, tanggal_berlaku_sampai FROM surat_keterangan_mautsaha_adat
         WHERE lembaga_badan_id = ? ORDER BY tanggal_terbit DESC, created_at DESC LIMIT 1`,
        [row.id]
      );
      const berlakuSampai =
        aktif[0]?.tanggal_berlaku_sampai ?? latest[0]?.tanggal_berlaku_sampai ?? null;
      item.mautsaha_status = computeMautsahaStatus(berlakuSampai, !!latest[0]);
      item.mautsaha_nomor_surat = aktif[0]?.nomor_surat ?? latest[0]?.nomor_surat ?? null;
      item.mautsaha_berlaku_sampai = berlakuSampai;
    }
    result.push(item);
  }
  return result;
}

export async function getLembagaBadanById(id: string): Promise<LembagaBadanRow | null> {
  const db = await getDb();
  const rows = await db.select<LembagaBadanRow[]>(
    `SELECT * FROM lembaga_badan WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createLembagaBadan(input: LembagaBadanInput): Promise<string> {
  assertLembagaInput(input);
  const desa = await getDesaAdat();
  if (!desa) throw new Error("Data desa adat belum ada.");

  const sektor = input.sektorUtama as SektorUtama;
  const kramaId =
    sektor === SEKTOR_SWASTA_KOMERSIAL ? input.penanggungJawabKramaId!.trim() : null;
  if (kramaId) await assertKramaPenanggungJawab(kramaId);

  const id = uuid();
  const db = await getDb();
  await db.execute(
    `INSERT INTO lembaga_badan (
      id, desa_adat_id, nama, alamat, sektor_utama, bentuk_hukum, fokus_bidang,
      nomor_legalitas, nama_penanggung_jawab, no_kontak, penanggung_jawab_krama_id,
      aktif, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [
      id,
      desa.id,
      input.nama.trim(),
      input.alamat?.trim() || null,
      sektor,
      input.bentukHukum.trim(),
      input.fokusBidang.trim(),
      input.nomorLegalitas?.trim() || null,
      input.namaPenanggungJawab.trim(),
      input.noKontak?.trim() || null,
      kramaId,
    ]
  );
  return id;
}

export async function updateLembagaBadan(id: string, input: LembagaBadanInput): Promise<void> {
  const existing = await getLembagaBadanById(id);
  if (!existing) throw new Error("Lembaga/badan tidak ditemukan");
  assertLembagaInput(input);

  const sektor = input.sektorUtama as SektorUtama;
  const kramaId =
    sektor === SEKTOR_SWASTA_KOMERSIAL ? input.penanggungJawabKramaId!.trim() : null;
  if (kramaId) await assertKramaPenanggungJawab(kramaId);

  const db = await getDb();
  await db.execute(
    `UPDATE lembaga_badan SET
      nama = ?, alamat = ?, sektor_utama = ?, bentuk_hukum = ?, fokus_bidang = ?,
      nomor_legalitas = ?, nama_penanggung_jawab = ?, no_kontak = ?,
      penanggung_jawab_krama_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.nama.trim(),
      input.alamat?.trim() || null,
      sektor,
      input.bentukHukum.trim(),
      input.fokusBidang.trim(),
      input.nomorLegalitas?.trim() || null,
      input.namaPenanggungJawab.trim(),
      input.noKontak?.trim() || null,
      kramaId,
      id,
    ]
  );
}

export async function softDeleteLembagaBadan(id: string): Promise<void> {
  const db = await getDb();
  const row = await getLembagaBadanById(id);
  if (!row) throw new Error("Lembaga/badan tidak ditemukan");
  await db.execute(
    `UPDATE lembaga_badan SET aktif = 0, updated_at = datetime('now') WHERE id = ?`,
    [id]
  );
}

export async function reaktivasiLembagaBadan(id: string): Promise<void> {
  const db = await getDb();
  const row = await getLembagaBadanById(id);
  if (!row) throw new Error("Lembaga/badan tidak ditemukan");
  await db.execute(
    `UPDATE lembaga_badan SET aktif = 1, updated_at = datetime('now') WHERE id = ?`,
    [id]
  );
}

export function getBentukOptionsForSektor(sektor: string): readonly string[] {
  if (!isValidSektorUtama(sektor)) return [];
  return getBentukHukumOptions(sektor);
}

export function getFokusOptionsForSektor(sektor: string): readonly string[] {
  if (!isValidSektorUtama(sektor)) return [];
  return getFokusBidangOptions(sektor);
}

export type LembagaBadanStats = {
  totalAktif: number;
  swastaBerlaku: number;
  swastaPerluPerpanjang: number;
  swastaKedaluwarsa: number;
};

export async function getLembagaBadanStats(): Promise<LembagaBadanStats> {
  const rows = await listLembagaBadan({ aktifOnly: true });
  let swastaBerlaku = 0;
  let swastaPerluPerpanjang = 0;
  let swastaKedaluwarsa = 0;
  for (const r of rows) {
    if (r.sektor_utama !== SEKTOR_SWASTA_KOMERSIAL) continue;
    if (r.mautsaha_status === "berlaku") swastaBerlaku++;
    else if (r.mautsaha_status === "perlu_perpanjang") swastaPerluPerpanjang++;
    else if (r.mautsaha_status === "kedaluwarsa") swastaKedaluwarsa++;
  }
  return {
    totalAktif: rows.length,
    swastaBerlaku,
    swastaPerluPerpanjang,
    swastaKedaluwarsa,
  };
}

export function labelMautsahaStatus(status?: MautsahaAdatStatus | null): string {
  switch (status) {
    case "berlaku":
      return "Berlaku";
    case "perlu_perpanjang":
      return "Perlu perpanjang";
    case "kedaluwarsa":
      return "Kedaluwarsa";
    case "belum_terbit":
      return "Belum terbit";
    default:
      return "—";
  }
}
