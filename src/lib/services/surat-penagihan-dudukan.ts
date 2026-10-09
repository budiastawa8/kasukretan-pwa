import { getDb } from "../db/client";
import { allocateNomorSuratPenagihan } from "../penomoran-sp";
import type { DesaAdat } from "../types";
import { today, uuid } from "../utils";
import { getDesaAdat } from "./desa";
import {
  listDudukanTunggakanLaporan,
  type DudukanTunggakanBulan,
  type DudukanTunggakanLaporanRow,
} from "./dudukan";

export const MIN_BULAN_SURAT_PENAGIHAN = 3;

export type SuratPenagihanDudukanRow = {
  id: string;
  krama_id: string;
  nomor_surat: string;
  tahun: number;
  bulan_terbit: number;
  tanggal_terbit: string;
  tunggakan_bulan: number;
  total_sisa: number;
  snapshot_json: string;
  created_at: string;
};

export type SuratPenagihanTunggakanSnapshot = {
  klasifikasi_nama: string;
  jenis_nama: string;
  bulan_tunggakan: DudukanTunggakanBulan[];
};

export type SuratPenagihanEligibleRow = DudukanTunggakanLaporanRow & {
  surat_id: string | null;
  nomor_surat: string | null;
  tanggal_terbit: string | null;
};

export type SuratPenagihanFilter = {
  q?: string;
  banjarId?: string;
  klasifikasi?: import("../types").KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  rtBtn?: string;
};

export type SuratPenagihanArsipFilter = {
  q?: string;
  tahun?: number;
  banjarId?: string;
  tanggalDari?: string;
  tanggalSampai?: string;
};

export type SuratPenagihanArsipRow = SuratPenagihanDudukanRow & {
  nomor_kartu: string;
  kepala_nama: string;
  alamat: string;
  banjar_nama: string;
  klasifikasi_kode: import("../types").KlasifikasiKode;
  klasifikasi_nama: string;
  jenis_nama: string;
};

function tahunBerjalan(): number {
  return new Date().getFullYear();
}

function bulanBerjalan(): number {
  return new Date().getMonth() + 1;
}

function parseTanggalIso(tanggal: string): string {
  const t = tanggal.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error("Tanggal terbit tidak valid");
  return t;
}

export function assertDesaSiapSuratPenagihan(desa: DesaAdat | null): void {
  if (!desa?.kode_desa_adat?.trim() || desa.kode_desa_adat.trim().length !== 4) {
    throw new Error("Kode desa adat belum lengkap. Lengkapi di Pengaturan → Setup Wilayah.");
  }
  if (!desa.pararem_nomor?.trim() || !desa.pararem_tahun?.trim() || !desa.pararem_judul?.trim()) {
    throw new Error(
      "Data Pararem desa adat belum lengkap. Lengkapi di Master Data → Profil Desa Adat."
    );
  }
}

async function mapSuratByKramaTahunBulan(
  tahun: number,
  bulan: number
): Promise<Map<string, SuratPenagihanDudukanRow>> {
  const db = await getDb();
  const rows = await db.select<SuratPenagihanDudukanRow[]>(
    `SELECT * FROM surat_penagihan_dudukan WHERE tahun = ? AND bulan_terbit = ?`,
    [tahun, bulan]
  );
  return new Map(rows.map((r) => [r.krama_id, r]));
}

export async function listEligibleSuratPenagihan(
  filter?: SuratPenagihanFilter
): Promise<SuratPenagihanEligibleRow[]> {
  const [rows, suratMap] = await Promise.all([
    listDudukanTunggakanLaporan({
      ...filter,
      minBulanTunggakan: MIN_BULAN_SURAT_PENAGIHAN,
    }),
    mapSuratByKramaTahunBulan(tahunBerjalan(), bulanBerjalan()),
  ]);

  return rows.map((row) => {
    const surat = suratMap.get(row.id);
    return {
      ...row,
      surat_id: surat?.id ?? null,
      nomor_surat: surat?.nomor_surat ?? null,
      tanggal_terbit: surat?.tanggal_terbit ?? null,
    };
  });
}

export async function getSuratPenagihanForKrama(
  kramaId: string,
  tahun = tahunBerjalan(),
  bulan = bulanBerjalan()
): Promise<SuratPenagihanDudukanRow | null> {
  const db = await getDb();
  const rows = await db.select<SuratPenagihanDudukanRow[]>(
    `SELECT * FROM surat_penagihan_dudukan
     WHERE krama_id = ? AND tahun = ? AND bulan_terbit = ? LIMIT 1`,
    [kramaId, tahun, bulan]
  );
  return rows[0] ?? null;
}

async function findEligibleRow(kramaId: string): Promise<DudukanTunggakanLaporanRow> {
  const rows = await listDudukanTunggakanLaporan({
    minBulanTunggakan: MIN_BULAN_SURAT_PENAGIHAN,
  });
  const row = rows.find((r) => r.id === kramaId);
  if (!row) {
    throw new Error("Pemasih tidak memenuhi syarat surat penagihan (tunggakan minimal 3 bulan).");
  }
  return row;
}

function buildSnapshot(row: DudukanTunggakanLaporanRow): SuratPenagihanTunggakanSnapshot {
  return {
    klasifikasi_nama: row.klasifikasi_nama,
    jenis_nama: row.jenis_nama,
    bulan_tunggakan: row.bulan_tunggakan_aktif,
  };
}

export async function issueSuratPenagihan(
  kramaId: string,
  tanggalTerbitInput?: string
): Promise<{ surat: SuratPenagihanDudukanRow; row: DudukanTunggakanLaporanRow }> {
  const desa = await getDesaAdat();
  assertDesaSiapSuratPenagihan(desa);
  if (!desa) throw new Error("Data desa adat belum ada.");

  const tanggalTerbit = parseTanggalIso(tanggalTerbitInput ?? today());
  const tahun = new Date(tanggalTerbit).getFullYear();
  const bulanTerbit = new Date(tanggalTerbit).getMonth() + 1;

  const existing = await getSuratPenagihanForKrama(kramaId, tahun, bulanTerbit);
  const row = await findEligibleRow(kramaId);

  if (existing) {
    return { surat: existing, row };
  }

  const nomorSurat = await allocateNomorSuratPenagihan(desa.id, tanggalTerbit);
  const snapshot = buildSnapshot(row);
  const id = uuid();

  const db = await getDb();
  await db.execute(
    `INSERT INTO surat_penagihan_dudukan (
      id, krama_id, nomor_surat, tahun, bulan_terbit, tanggal_terbit,
      tunggakan_bulan, total_sisa, snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      kramaId,
      nomorSurat,
      tahun,
      bulanTerbit,
      tanggalTerbit,
      row.tunggakan_bulan,
      row.total_sisa,
      JSON.stringify(snapshot),
    ]
  );

  const surat = await getSuratPenagihanForKrama(kramaId, tahun, bulanTerbit);
  if (!surat) throw new Error("Gagal menyimpan surat penagihan.");
  return { surat, row };
}

export async function issueSuratPenagihanBatch(
  kramaIds: string[],
  tanggalTerbitInput?: string
): Promise<Array<{ surat: SuratPenagihanDudukanRow; row: DudukanTunggakanLaporanRow }>> {
  const results: Array<{ surat: SuratPenagihanDudukanRow; row: DudukanTunggakanLaporanRow }> = [];
  for (const kramaId of kramaIds) {
    results.push(await issueSuratPenagihan(kramaId, tanggalTerbitInput));
  }
  return results;
}

const ARSIP_KRAMA_JOIN = `
  FROM surat_penagihan_dudukan s
  JOIN krama kr ON kr.id = s.krama_id
  JOIN penduduk p ON p.id = kr.kepala_penduduk_id
  JOIN banjar b ON b.id = kr.banjar_id
  JOIN klasifikasi_krama kk ON kk.id = kr.klasifikasi_krama_id
  LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = kr.jenis_krama_tamiu_id
  LEFT JOIN jenis_tamiu jt ON jt.id = kr.jenis_tamiu_id
`;

const ARSIP_SELECT = `
  SELECT s.*,
    kr.nomor_kartu,
    p.nama_lengkap as kepala_nama,
    COALESCE(kr.alamat, '') as alamat,
    b.nama as banjar_nama,
    kk.kode as klasifikasi_kode,
    kk.nama_tampilan as klasifikasi_nama,
    COALESCE(jkt.nama, jt.nama, '') as jenis_nama
  ${ARSIP_KRAMA_JOIN}
`;

function buildArsipWhere(
  filter: SuratPenagihanArsipFilter | undefined,
  extra?: { id?: string }
): { where: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (extra?.id) {
    clauses.push("s.id = ?");
    params.push(extra.id);
  }
  if (filter?.tahun) {
    clauses.push("s.tahun = ?");
    params.push(filter.tahun);
  }
  if (filter?.banjarId) {
    clauses.push("kr.banjar_id = ?");
    params.push(filter.banjarId);
  }
  if (filter?.tanggalDari) {
    clauses.push("s.tanggal_terbit >= ?");
    params.push(filter.tanggalDari.trim().slice(0, 10));
  }
  if (filter?.tanggalSampai) {
    clauses.push("s.tanggal_terbit <= ?");
    params.push(filter.tanggalSampai.trim().slice(0, 10));
  }
  if (filter?.q?.trim()) {
    const q = `%${filter.q.trim()}%`;
    clauses.push(`(p.nama_lengkap LIKE ? OR kr.nomor_kartu LIKE ? OR s.nomor_surat LIKE ?)`);
    params.push(q, q, q);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { where, params };
}

export async function listSuratPenagihanArsip(
  filter?: SuratPenagihanArsipFilter
): Promise<SuratPenagihanArsipRow[]> {
  const db = await getDb();
  const { where, params } = buildArsipWhere(filter);
  return db.select<SuratPenagihanArsipRow[]>(
    `${ARSIP_SELECT} ${where} ORDER BY s.tanggal_terbit DESC, s.nomor_surat DESC`,
    params
  );
}

export async function getSuratPenagihanArsipById(
  id: string
): Promise<SuratPenagihanArsipRow | null> {
  const db = await getDb();
  const { where, params } = buildArsipWhere(undefined, { id });
  const rows = await db.select<SuratPenagihanArsipRow[]>(`${ARSIP_SELECT} ${where} LIMIT 1`, params);
  return rows[0] ?? null;
}

/** Baris laporan minimal untuk cetak ulang dari arsip (data tunggakan dari snapshot). */
export function arsipRowToLaporanRow(arsip: SuratPenagihanArsipRow): DudukanTunggakanLaporanRow {
  const snapshot = JSON.parse(arsip.snapshot_json) as SuratPenagihanTunggakanSnapshot;
  return {
    id: arsip.krama_id,
    nomor_kartu: arsip.nomor_kartu,
    kepala_nama: arsip.kepala_nama,
    alamat: arsip.alamat,
    banjar_id: "",
    banjar_nama: arsip.banjar_nama,
    banjar_kode: "",
    klasifikasi_kode: arsip.klasifikasi_kode,
    klasifikasi_nama: arsip.klasifikasi_nama,
    jenis_nama: arsip.jenis_nama,
    tarif_bulanan: 0,
    rt_btn: "",
    tanggal_terdaftar: "",
    tunggakan_bulan: arsip.tunggakan_bulan,
    total_sisa: arsip.total_sisa,
    total_sisa_dimuka: 0,
    lunas_keringanan_bulan: 0,
    bulan_tunggakan_aktif: snapshot.bulan_tunggakan,
    bulan_tunggakan: snapshot.bulan_tunggakan,
  };
}
