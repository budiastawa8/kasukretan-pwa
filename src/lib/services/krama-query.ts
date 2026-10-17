import { getDb } from "../db/client";
import type {
  AnggotaKeluarga,
  KramaDetail,
  KramaListItem,
  KlasifikasiKode,
  Penduduk,
} from "../types";
import { assertKramaStatusAktifUntukPembayaran } from "../krama-status";
import { formatStatusKeluarga } from "../status-keluarga";
import { getDesaAdat } from "./desa";
import { syncStatusIlikitaStored } from "./krama-ilikita-sync";
import { previewStatusIlikita, statusIlikitaColumn } from "../status-ilikita";

export async function assertKramaAktifUntukPembayaran(kramaId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ status_krama: string }[]>(
    `SELECT status_krama FROM krama WHERE id = $1`,
    [kramaId]
  );
  if (!rows[0]) throw new Error("Krama tidak ditemukan");
  assertKramaStatusAktifUntukPembayaran(rows[0].status_krama);
}

export async function getKlasifikasiList() {
  const db = await getDb();
  return db.select(`SELECT * FROM klasifikasi_krama ORDER BY kode`);
}

/** Daftar RT/BTN unik pemasih (Krama Tamiu & Tamiu), opsional per banjar. */
export async function listRtBtnPemasih(params?: {
  banjarId?: string;
  statusKrama?: "aktif" | "nonaktif";
}): Promise<string[]> {
  const db = await getDb();
  const status = params?.statusKrama ?? "aktif";
  let sql = `
    SELECT DISTINCT TRIM(k.rt_btn) as rt_btn
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
      AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
    WHERE k.status_krama = $1
      AND k.rt_btn IS NOT NULL AND TRIM(k.rt_btn) <> ''
  `;
  const args: unknown[] = [status];
  if (params?.banjarId) {
    sql += ` AND k.banjar_id = $2`;
    args.push(params.banjarId);
  }
  sql += ` ORDER BY rt_btn`;
  const rows = await db.select<{ rt_btn: string }[]>(sql, args);
  return rows.map((r) => r.rt_btn.trim()).filter(Boolean);
}

export type KramaListFilter = {
  klasifikasi?: KlasifikasiKode;
  klasifikasiIn?: KlasifikasiKode[];
  banjarId?: string;
  jenisKramaMipilId?: string;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  tempekId?: string;
  arahanId?: string;
  rtBtn?: string;
  q?: string;
  /** Default: hanya krama aktif. */
  statusKrama?: "aktif" | "nonaktif";
  alasanTidakAktif?: "meninggal" | "pindah";
};

export type KramaListParams = KramaListFilter & {
  /** Pagination server — tanpa limit mengembalikan semua baris (ekspor/laporan). */
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDir?: "asc" | "desc";
};

const KRAMA_LIST_FROM = `
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
    JOIN penduduk p ON p.id = k.kepala_penduduk_id
    LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
    LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
    LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tempek t ON t.id = k.tempek_id
    LEFT JOIN arahan a ON a.id = k.arahan_id
`;

const KRAMA_LIST_ORDER_SQL: Record<string, string> = {
  nomor_kartu: "k.nomor_kartu",
  kepala_nama: "p.nama_lengkap COLLATE NOCASE",
  kepala_tanggal_lahir: "p.tanggal_lahir",
  jenis_nama: "COALESCE(jm.nama, jkt.nama, jt.nama) COLLATE NOCASE",
  banjar_nama: "b.nama COLLATE NOCASE",
  tempek_nama: "t.nama COLLATE NOCASE",
  arahan_nama: "a.nama COLLATE NOCASE",
  alasan_tidak_aktif: "k.alasan_tidak_aktif",
  tanggal_tidak_aktif: "k.tanggal_tidak_aktif",
  status_pipil: "k.status_pipil",
  tanggal_terdaftar: "k.tanggal_terdaftar",
  alamat: "k.alamat COLLATE NOCASE",
  rt_btn: "k.rt_btn COLLATE NOCASE",
  klasifikasi_nama: "kk.nama_tampilan COLLATE NOCASE",
};

function buildKramaListWhere(params?: KramaListFilter): {
  where: string;
  args: unknown[];
  statusFilter: "aktif" | "nonaktif";
} {
  const statusFilter = params?.statusKrama ?? "aktif";
  let where = `WHERE k.status_krama = $1`;
  const args: unknown[] = [statusFilter];
  let n = 2;
  if (params?.alasanTidakAktif) {
    where += ` AND k.alasan_tidak_aktif = $${n++}`;
    args.push(params.alasanTidakAktif);
  }
  if (params?.klasifikasiIn?.length) {
    const ph = params.klasifikasiIn.map(() => `$${n++}`).join(", ");
    where += ` AND kk.kode IN (${ph})`;
    args.push(...params.klasifikasiIn);
  } else if (params?.klasifikasi) {
    where += ` AND kk.kode = $${n++}`;
    args.push(params.klasifikasi);
  }
  if (params?.banjarId) {
    where += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId);
  }
  if (params?.jenisKramaMipilId) {
    where += ` AND k.jenis_krama_mipil_id = $${n++}`;
    args.push(params.jenisKramaMipilId);
  }
  if (params?.jenisKramaTamiuId) {
    where += ` AND k.jenis_krama_tamiu_id = $${n++}`;
    args.push(params.jenisKramaTamiuId);
  }
  if (params?.jenisTamiuId) {
    where += ` AND k.jenis_tamiu_id = $${n++}`;
    args.push(params.jenisTamiuId);
  }
  if (params?.rtBtn?.trim()) {
    where += ` AND TRIM(k.rt_btn) = $${n++}`;
    args.push(params.rtBtn.trim());
  }
  if (params?.tempekId) {
    where += ` AND k.tempek_id = $${n++}`;
    args.push(params.tempekId);
  }
  if (params?.arahanId) {
    where += ` AND k.arahan_id = $${n++}`;
    args.push(params.arahanId);
  }
  if (params?.q) {
    const q = `%${params.q}%`;
    where += ` AND (
      k.nomor_kartu LIKE $${n}
      OR COALESCE(k.alamat, '') LIKE $${n + 1}
      OR p.nama_lengkap LIKE $${n + 2}
      OR p.nik_atau_nika LIKE $${n + 3}
      OR COALESCE(p.nik_kependudukan, '') LIKE $${n + 4}
      OR EXISTS (
        SELECT 1
        FROM anggota_keluarga ak
        JOIN penduduk pm ON pm.id = ak.penduduk_id
        WHERE ak.krama_id = k.id
          AND ak.status = 'aktif'
          AND (
            pm.nama_lengkap LIKE $${n + 5}
            OR pm.nik_atau_nika LIKE $${n + 6}
            OR COALESCE(pm.nik_kependudukan, '') LIKE $${n + 7}
            OR COALESCE(ak.nika, '') LIKE $${n + 8}
            OR COALESCE(ak.nrkt, '') LIKE $${n + 9}
            OR COALESCE(ak.nrt, '') LIKE $${n + 10}
          )
      )
    )`;
    args.push(q, q, q, q, q, q, q, q, q, q, q);
  }
  return { where, args, statusFilter };
}

function kramaListOrderSql(orderBy?: string, orderDir?: "asc" | "desc"): string {
  const col = orderBy ? KRAMA_LIST_ORDER_SQL[orderBy] : undefined;
  if (!col) {
    return `ORDER BY b.kode ASC, COALESCE(t.created_at, '') ASC, COALESCE(a.created_at, '') ASC, k.nomor_kartu ASC`;
  }
  const dir = orderDir === "desc" ? "DESC" : "ASC";
  return `ORDER BY ${col} ${dir}, k.nomor_kartu ASC`;
}

function applyIlikitaPreview(rows: KramaListItem[], desa: Awaited<ReturnType<typeof getDesaAdat>>): void {
  for (const row of rows) {
    const kode = row.klasifikasi_kode as KlasifikasiKode;
    const col = statusIlikitaColumn(kode);
    if (!col) continue;
    const stub: KramaDetail = {
      id: row.id,
      nomor_kartu: row.nomor_kartu,
      jenis_kartu: row.jenis_kartu as KramaDetail["jenis_kartu"],
      klasifikasi_kode: kode,
      klasifikasi_nama: row.klasifikasi_nama,
      gelar_kepala: "",
      banjar_id: "",
      banjar_nama: row.banjar_nama,
      banjar_kode: "",
      masa_berlaku_tahun: row.masa_berlaku_tahun,
      auto_perpanjang_pemasih: row.auto_perpanjang_pemasih,
      tanggal_terdaftar: row.tanggal_terdaftar,
      tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
      status_krama: row.status_krama,
      status_pipil: row.status_pipil,
      status_pemasih: row.status_pemasih,
      kepala: { id: "", nama_lengkap: row.kepala_nama, jenis_kelamin: "" },
      anggota_aktif: [],
    };
    previewStatusIlikita(stub, desa);
    row.status_pipil = stub.status_pipil;
    row.status_pemasih = stub.status_pemasih;
  }
}

export async function countKrama(params?: KramaListFilter): Promise<number> {
  const db = await getDb();
  const { where, args } = buildKramaListWhere(params);
  const rows = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c ${KRAMA_LIST_FROM} ${where}`,
    args
  );
  return Number(rows[0]?.c ?? 0);
}

/** Ringkasan chip filter — tanpa mengunduh seluruh daftar. */
export async function summarizeKramaByJenis(
  params?: KramaListFilter
): Promise<{ klasifikasi_nama: string; jenis_nama: string | null; count: number }[]> {
  const db = await getDb();
  const { where, args } = buildKramaListWhere(params);
  return db.select(
    `SELECT kk.nama_tampilan as klasifikasi_nama,
            COALESCE(jm.nama, jkt.nama, jt.nama) as jenis_nama,
            COUNT(*) as count
     ${KRAMA_LIST_FROM}
     ${where}
     GROUP BY kk.nama_tampilan, COALESCE(jm.nama, jkt.nama, jt.nama)
     ORDER BY count DESC, klasifikasi_nama ASC, jenis_nama ASC`,
    args
  );
}

export async function listKrama(params?: KramaListParams): Promise<KramaListItem[]> {
  const db = await getDb();
  const { where, args, statusFilter } = buildKramaListWhere(params);
  let sql = `
    SELECT k.id, k.nomor_kartu, k.nomor_kontak, k.jenis_kartu, k.status_krama, k.status_pipil, k.status_pemasih,
           k.tanggal_terdaftar, k.tanggal_berlaku_mulai_pemasih,
           k.alasan_tidak_aktif, k.tanggal_tidak_aktif, k.keterangan_tidak_aktif,
           kk.kode as klasifikasi_kode, kk.nama_tampilan as klasifikasi_nama,
           p.nama_lengkap as kepala_nama, p.tanggal_lahir as kepala_tanggal_lahir,
           k.jenis_krama_mipil_id, k.alasan_nyada,
           COALESCE(jm.nama, jkt.nama, jt.nama) as jenis_nama,
           COALESCE(jm.masa_berlaku_tahun, jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun,
           COALESCE(jkt.auto_perpanjang, jt.auto_perpanjang) as auto_perpanjang_pemasih,
           k.alamat, k.rt_btn,
           b.nama as banjar_nama, b.kode as banjar_kode,
           t.nama as tempek_nama, t.created_at as tempek_created_at,
           a.nama as arahan_nama, a.created_at as arahan_created_at
    ${KRAMA_LIST_FROM}
    ${where}
    ${kramaListOrderSql(params?.orderBy, params?.orderDir)}
  `;
  const bind = [...args];
  if (params?.limit != null && Number.isFinite(params.limit)) {
    sql += ` LIMIT $${bind.length + 1}`;
    bind.push(Math.max(1, Math.floor(params.limit)));
    if (params.offset != null && Number.isFinite(params.offset) && params.offset > 0) {
      sql += ` OFFSET $${bind.length + 1}`;
      bind.push(Math.max(0, Math.floor(params.offset)));
    }
  }
  const rows = await db.select<KramaListItem[]>(sql, bind);

  for (const row of rows) {
    row.nomor_kontak = row.nomor_kontak?.trim() || null;
  }

  if (statusFilter === "aktif") {
    applyIlikitaPreview(rows, await getDesaAdat());
  }

  return rows;
}

type KramaDetailRow = KramaDetail & { kepala_penduduk_id: string };

export async function getKramaDetail(id: string): Promise<KramaDetail | null> {
  const db = await getDb();
  const rows = await db.select<KramaDetailRow[]>(
    `SELECT k.*, kk.kode as klasifikasi_kode, kk.nama_tampilan as klasifikasi_nama, kk.gelar_kepala,
            b.nama as banjar_nama, b.kode as banjar_kode,
            t.nama as tempek_nama, a.nama as arahan_nama,
            COALESCE(jm.nama, jkt.nama, jt.nama) as jenis_nama,
            jm.paturunan_persen, COALESCE(jkt.dudukan_nominal, jt.dudukan_nominal) as dudukan_nominal,
            COALESCE(jm.masa_berlaku_tahun, jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun,
            COALESCE(jkt.auto_perpanjang, jt.auto_perpanjang) as auto_perpanjang_pemasih
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tempek t ON t.id = k.tempek_id
     LEFT JOIN arahan a ON a.id = k.arahan_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.id = $1`,
    [id]
  );
  const krama = rows[0];
  if (!krama) return null;

  const kepala = await db.select<Penduduk[]>(`SELECT * FROM penduduk WHERE id = $1`, [
    krama.kepala_penduduk_id,
  ]);

  const anggota = await db.select<AnggotaKeluarga[]>(
    `SELECT ak.id as anggota_id, ak.penduduk_id, ak.status_keluarga, ak.urut_dalam_keluarga,
            ak.nika, ak.nrkt, ak.nrt, ak.tanggal_pencatatan, ak.masuk_pada, ak.keluar_pada, ak.status,
            p.nama_lengkap, p.jenis_kelamin, p.tempat_lahir, p.tanggal_lahir,
            p.status_kawin, p.pekerjaan, p.nama_ibu, p.nama_ayah,
            p.nik_kependudukan, p.nik_atau_nika, p.agama, p.foto_url
     FROM anggota_keluarga ak
     JOIN penduduk p ON p.id = ak.penduduk_id
     WHERE ak.krama_id = $1 AND ak.status = 'aktif'
     ORDER BY
       CASE WHEN lower(ak.status_keluarga) IN ('pengarep', 'pengajeg', 'kepala_keluarga') THEN 0 ELSE 1 END,
       ak.urut_dalam_keluarga,
       ak.masuk_pada`,
    [id]
  );

  const detail = {
    ...krama,
    kepala: kepala[0] as KramaDetail["kepala"],
    anggota_aktif: anggota.map((a) => ({
      ...a,
      status_keluarga: formatStatusKeluarga(
        a.status_keluarga,
        krama.klasifikasi_kode as KlasifikasiKode
      ),
    })),
  } as KramaDetail;

  await syncStatusIlikitaStored(detail);
  return detail;
}

export type PemasihPerBanjarRow = {
  label: string;
  krama_tamiu: number;
  tamiu: number;
};

/** Jumlah Krama Tamiu dan Tamiu aktif per banjar (dashboard). */
export async function getPemasihPerBanjar(): Promise<PemasihPerBanjarRow[]> {
  const db = await getDb();
  const rows = await db.select<{ label: string; krama_tamiu: number; tamiu: number }[]>(
    `SELECT b.nama as label,
            COALESCE(SUM(CASE WHEN kk.kode = 'KRAMA_TAMIU' THEN 1 ELSE 0 END), 0) as krama_tamiu,
            COALESCE(SUM(CASE WHEN kk.kode = 'TAMIU' THEN 1 ELSE 0 END), 0) as tamiu
     FROM banjar b
     LEFT JOIN krama k ON k.banjar_id = b.id AND k.status_krama = 'aktif'
     LEFT JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     GROUP BY b.id
     ORDER BY b.kode`
  );
  return rows.map((r) => ({
    label: r.label,
    krama_tamiu: Number(r.krama_tamiu) || 0,
    tamiu: Number(r.tamiu) || 0,
  }));
}

export async function getRekap() {
  const db = await getDb();
  const perKlasifikasi = await db.select<{ label: string; count: number }[]>(
    `SELECT kk.nama_tampilan as label, COUNT(k.id) as count
     FROM klasifikasi_krama kk
     LEFT JOIN krama k ON k.klasifikasi_krama_id = kk.id AND k.status_krama = 'aktif'
     GROUP BY kk.id`
  );
  const perBanjar = await db.select<{ label: string; count: number }[]>(
    `SELECT b.nama as label, COUNT(k.id) as count
     FROM banjar b
     LEFT JOIN krama k ON k.banjar_id = b.id AND k.status_krama = 'aktif'
     GROUP BY b.id ORDER BY b.kode`
  );
  const total = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama WHERE status_krama = 'aktif'`
  );
  return { perKlasifikasi, perBanjar, total: total[0]?.c ?? 0 };
}
