import { getDb } from "../db/client";
import { cachedQuery } from "../query-cache";
import { compareBanjarRow } from "../wilayah-order";
import {
  hitungSisaDudukan,
  hitungTagihanDudukan,
  hitungTagihanDudukanPeriode,
  isLunasDudukan,
  isLunasKeringananDudukan,
  isPeriodeDudukanDalamMasaBerlaku,
  isPeriodeDudukanMendatang,
  isPeringatanTelatDudukan,
  iterPeriodeDudukanBayar,
  parseBulan,
  parseTahun,
  periodeKey,
  statusBayarDudukan,
} from "../dudukan-hitung";
import type { DudukanKeringananRow, KlasifikasiKode } from "../types";
import { listBanjar } from "./master";
import {
  getDibayarPeriodeMapForKrama,
  getDibayarPeriodeMapsForKramaIds,
  getDibayarPeriodeMapsForPemasihAktif,
  getLastPembayaranTanggalMapsForPemasihAktif,
  getTotalDibayarMap,
  getTotalDibayarMapForKramaIds,
  type DibayarPeriodeByKrama,
  type LastPembayaranTanggalByKrama,
} from "./dudukan-pembayaran";
import {
  getKeringananDetailMapForKrama,
  getKeringananDetailMapsForKramaIds,
  getKeringananDetailMapsForPemasihAktif,
  getKeringananMapForBulan,
  getKeringananMapForBulanForKramaIds,
  getKeringananPeriodeMapForKrama,
  getKeringananPeriodeMapsForKramaIds,
  getKeringananPeriodeMapsForPemasihAktif,
  type KeringananDetailByKrama,
  type KeringananPeriodeByKrama,
} from "./dudukan-keringanan";

export type DudukanKramaDetail = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  klasifikasi_kode: KlasifikasiKode;
  klasifikasi_nama: string;
  jenis_nama: string;
  tarif_bulanan: number;
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  alamat: string;
  rt_btn: string;
  tanggal_terdaftar: string;
  nomor_kontak?: string | null;
};

export type DudukanTunggakanBulan = {
  tahun: number;
  bulan: number;
  tagihan: number;
  dibayar: number;
  keringanan: number;
  keringanan_id?: string | null;
  keringanan_keterangan?: string | null;
  sisa: number;
  lunas: boolean;
  lunas_keringanan: boolean;
  telat: boolean;
  di_muka: boolean;
};

export type DudukanKramaSearchRow = DudukanKramaDetail & {
  tunggakan_bulan: number;
  total_sisa: number;
  /** Sisa tagihan bulan mendatang (bayar di muka) — tidak masuk tunggakan. */
  total_sisa_dimuka: number;
  lunas_keringanan_bulan: number;
  /** Bulan dengan sisa > 0 (bukan di muka) — untuk periode pesan WhatsApp. */
  bulan_tunggakan_aktif: DudukanTunggakanBulan[];
};

export type DudukanTunggakanLaporanRow = DudukanKramaSearchRow & {
  bulan_tunggakan: DudukanTunggakanBulan[];
};

export type DudukanPertimbanganKeringananRow = DudukanKramaDetail & {
  tahun: number;
  bulan: number;
  tagihan: number;
  dibayar: number;
  sisa: number;
  telat: boolean;
  tanggal_transaksi: string | null;
};

export type DudukanKramaRow = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  klasifikasi_kode: KlasifikasiKode;
  klasifikasi_nama: string;
  jenis_nama: string;
  tarif: number;
  dibayar: number;
  /** Uang diterima berdasar tanggal transaksi dalam rentang laporan (diisi laporan dudukan). */
  diterima_periode?: number;
  keringanan: number;
  sisa: number;
  lunas: boolean;
  lunas_keringanan: boolean;
  peringatan_telat: boolean;
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  status_krama: string;
  status_pemasih: string;
  tanggal_tidak_aktif: string | null;
  tanggal_terdaftar: string;
};

export type DudukanJenisRingkasan = {
  klasifikasi_kode: KlasifikasiKode;
  jenis_id: string;
  jenis_nama: string;
  tarif: number;
  jumlah_krama: number;
};

export type DudukanRingkasan = {
  totalPemasihAktif: number;
  perJenis: DudukanJenisRingkasan[];
};

export type RingkasanBulanDudukan = {
  tahun: number;
  bulan: number;
  total_krama: number;
  total_tagihan: number;
  total_dibayar: number;
  total_keringanan: number;
  total_sisa: number;
  jumlah_belum_lunas: number;
  jumlah_lunas_keringanan: number;
  jumlah_telat: number;
  perJenis: {
    klasifikasi_kode: KlasifikasiKode;
    jenis_nama: string;
    tarif: number;
    jumlah_krama: number;
    total_tagihan: number;
  }[];
};

export async function getDudukanRingkasan(): Promise<DudukanRingkasan> {
  const db = await getDb();

  const ktRows = await db.select<DudukanJenisRingkasan[]>(
    `SELECT 'KRAMA_TAMIU' as klasifikasi_kode, j.id as jenis_id, j.nama as jenis_nama,
            COALESCE(j.dudukan_nominal, 0) as tarif,
            (SELECT COUNT(*) FROM krama k
             INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'KRAMA_TAMIU'
             WHERE k.jenis_krama_tamiu_id = j.id AND k.status_krama = 'aktif') as jumlah_krama
     FROM jenis_krama_tamiu j
     WHERE j.aktif = 1
     ORDER BY j.nama ASC`
  );

  const tRows = await db.select<DudukanJenisRingkasan[]>(
    `SELECT 'TAMIU' as klasifikasi_kode, j.id as jenis_id, j.nama as jenis_nama,
            COALESCE(j.dudukan_nominal, 0) as tarif,
            (SELECT COUNT(*) FROM krama k
             INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'TAMIU'
             WHERE k.jenis_tamiu_id = j.id AND k.status_krama = 'aktif') as jumlah_krama
     FROM jenis_tamiu j
     WHERE j.aktif = 1
     ORDER BY j.nama ASC`
  );

  const totalRow = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU') AND k.status_krama = 'aktif'`
  );

  const perJenis = [...ktRows, ...tRows].map((j) => ({
    ...j,
    tarif: Math.round(Number(j.tarif) || 0),
    jumlah_krama: Number(j.jumlah_krama) || 0,
  }));

  return {
    totalPemasihAktif: totalRow[0]?.c ?? 0,
    perJenis,
  };
}

export async function getRingkasanBulanDudukan(
  tahun: number,
  bulan: number
): Promise<RingkasanBulanDudukan> {
  const t = parseTahun(tahun);
  const b = parseBulan(bulan);
  const [rows, dibayarMap, keringananMap] = await Promise.all([
    queryKramaDudukanBase(),
    getTotalDibayarMap(t, b),
    getKeringananMapForBulan(t, b),
  ]);
  const dudukanRows = buildDudukanRowsForBulan(rows, t, b, dibayarMap, keringananMap);
  return buildRingkasanBulanFromDudukanRows(dudukanRows, t, b);
}

export async function listKramaDudukan(params: {
  tahun: number;
  bulan: number;
  q?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  statusBayar?: "belum" | "cicil" | "lunas" | "lunas_keringanan" | "telat";
  includeNonaktifPernahBayar?: boolean;
}): Promise<DudukanKramaRow[]> {
  const db = await getDb();
  const tahun = parseTahun(params.tahun);
  const bulan = parseBulan(params.bulan);

  let sql = `
    SELECT k.id, k.nomor_kartu, k.status_krama, k.status_pemasih,
           k.tanggal_tidak_aktif,
           kk.kode as klasifikasi_kode, kk.nama_tampilan as klasifikasi_nama,
           p.nama_lengkap as kepala_nama,
           COALESCE(jkt.nama, jt.nama, '') as jenis_nama,
           COALESCE(jkt.dudukan_nominal, jt.dudukan_nominal, 0) as tarif_nominal,
           k.banjar_id, b.nama as banjar_nama, b.kode as banjar_kode,
           k.tanggal_terdaftar, k.tanggal_berlaku_mulai_pemasih,
           COALESCE(jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
    JOIN penduduk p ON p.id = k.kepala_penduduk_id
    LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
    LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
    JOIN banjar b ON b.id = k.banjar_id
    WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
  `;
  const args: unknown[] = [];
  let n = 1;

  if (params.includeNonaktifPernahBayar) {
    sql += ` AND (
      k.status_krama = 'aktif'
      OR EXISTS (
        SELECT 1
        FROM dudukan_pembayaran dp
        WHERE dp.krama_id = k.id AND dp.tahun = $${n++} AND dp.bulan = $${n++}
      )
    )`;
    args.push(tahun, bulan);
  } else {
    sql += ` AND k.status_krama = 'aktif'`;
  }

  if (params.klasifikasi) {
    sql += ` AND kk.kode = $${n++}`;
    args.push(params.klasifikasi);
  }
  if (params.banjarId) {
    sql += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId);
  }
  if (params.jenisKramaTamiuId) {
    sql += ` AND k.jenis_krama_tamiu_id = $${n++}`;
    args.push(params.jenisKramaTamiuId);
  }
  if (params.jenisTamiuId) {
    sql += ` AND k.jenis_tamiu_id = $${n++}`;
    args.push(params.jenisTamiuId);
  }
  if (params.q) {
    const q = `%${params.q}%`;
    sql += ` AND (
      k.nomor_kartu LIKE $${n}
      OR p.nama_lengkap LIKE $${n + 1}
      OR EXISTS (
        SELECT 1
        FROM anggota_keluarga ak
        JOIN penduduk pm ON pm.id = ak.penduduk_id
        WHERE ak.krama_id = k.id
          AND ak.status = 'aktif'
          AND pm.nama_lengkap LIKE $${n + 2}
      )
    )`;
    args.push(q, q, q);
  }
  sql += ` ORDER BY b.kode ASC, k.nomor_kartu ASC`;

  const rows = await db.select<
    (Omit<
      DudukanKramaRow,
      "tarif" | "dibayar" | "sisa" | "lunas" | "peringatan_telat"
    > & {
      tarif_nominal: number;
      tanggal_berlaku_mulai_pemasih: string | null;
      masa_berlaku_tahun: number | null;
    })[]
  >(sql, args);

  const dibayarMap = await getTotalDibayarMap(tahun, bulan);
  const keringananMap = await getKeringananMapForBulan(tahun, bulan);

  const result: DudukanKramaRow[] = [];
  for (const row of rows) {
    const dibayar = dibayarMap.get(row.id) ?? 0;
    const dalamMasaBerlaku = isPeriodeDudukanDalamMasaBerlaku(
      row.tanggal_terdaftar,
      row.tanggal_berlaku_mulai_pemasih,
      row.masa_berlaku_tahun,
      tahun,
      bulan
    );
    if (!dalamMasaBerlaku && dibayar <= 0) {
      continue;
    }
    const tarif = hitungTagihanDudukanPeriode(
      Number(row.tarif_nominal) || 0,
      row.tanggal_terdaftar,
      tahun,
      bulan
    );
    const keringanan = keringananMap.get(row.id) ?? 0;
    const sisa = hitungSisaDudukan(tarif, dibayar, keringanan);
    const lunas = isLunasDudukan(tarif, dibayar, keringanan);
    const lunas_keringanan = isLunasKeringananDudukan(tarif, dibayar, keringanan);
    const peringatan_telat = isPeringatanTelatDudukan(
      tahun,
      bulan,
      tarif,
      dibayar,
      keringanan
    );

    if (tarif <= 0 && dibayar <= 0) continue;

    if (params.statusBayar === "belum" && (lunas || dibayar > 0)) continue;
    if (params.statusBayar === "cicil" && (lunas || dibayar <= 0)) continue;
    if (params.statusBayar === "lunas" && !lunas) continue;
    if (params.statusBayar === "lunas_keringanan" && !lunas_keringanan) continue;
    if (params.statusBayar === "telat" && !peringatan_telat) continue;

    result.push({
      id: row.id,
      nomor_kartu: row.nomor_kartu,
      kepala_nama: row.kepala_nama,
      klasifikasi_kode: row.klasifikasi_kode,
      klasifikasi_nama: row.klasifikasi_nama,
      jenis_nama: row.jenis_nama?.trim() || "—",
      tarif,
      dibayar,
      keringanan,
      sisa,
      lunas,
      lunas_keringanan,
      peringatan_telat,
      banjar_id: row.banjar_id,
      banjar_nama: row.banjar_nama,
      banjar_kode: row.banjar_kode,
      status_krama: row.status_krama,
      status_pemasih: row.status_pemasih,
      tanggal_tidak_aktif: row.tanggal_tidak_aktif,
      tanggal_terdaftar: row.tanggal_terdaftar,
    });
  }

  return result;
}

type KramaDudukanBase = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  klasifikasi_kode: KlasifikasiKode;
  klasifikasi_nama: string;
  jenis_nama: string;
  tarif_nominal: number;
  banjar_id: string;
  banjar_nama: string;
  banjar_kode: string;
  alamat: string;
  rt_btn: string;
  tanggal_terdaftar: string;
  status_krama: string;
  tanggal_tidak_aktif: string | null;
  tanggal_berlaku_mulai_pemasih: string | null;
  masa_berlaku_tahun: number | null;
  nomor_kontak?: string | null;
};

function mapKramaBase(row: KramaDudukanBase): DudukanKramaDetail {
  return {
    id: row.id,
    nomor_kartu: row.nomor_kartu,
    kepala_nama: row.kepala_nama,
    klasifikasi_kode: row.klasifikasi_kode,
    klasifikasi_nama: row.klasifikasi_nama,
    jenis_nama: row.jenis_nama?.trim() || "—",
    tarif_bulanan: hitungTagihanDudukan(Number(row.tarif_nominal) || 0),
    banjar_id: row.banjar_id,
    banjar_nama: row.banjar_nama,
    banjar_kode: row.banjar_kode,
    alamat: row.alamat?.trim() || "—",
    rt_btn: row.rt_btn?.trim() || "—",
    tanggal_terdaftar: row.tanggal_terdaftar,
    nomor_kontak: row.nomor_kontak?.trim() || null,
  };
}

function hitungTunggakanDariPembayaran(
  tarifNominal: number,
  tanggalTerdaftar: string,
  dibayarMap: Map<string, number>,
  keringananMap: Map<string, number>,
  keringananDetailMap?: Map<string, DudukanKeringananRow>,
  masaBerlaku?: {
    tanggal_berlaku_mulai_pemasih?: string | null;
    masa_berlaku_tahun?: number | null;
  }
): {
  tunggakan_bulan: number;
  total_sisa: number;
  total_sisa_dimuka: number;
  lunas_keringanan_bulan: number;
  bulan: DudukanTunggakanBulan[];
} {
  const bulan: DudukanTunggakanBulan[] = [];
  let tunggakan_bulan = 0;
  let total_sisa = 0;
  let total_sisa_dimuka = 0;
  let lunas_keringanan_bulan = 0;

  for (const { tahun, bulan: bl } of iterPeriodeDudukanBayar(
    tanggalTerdaftar,
    masaBerlaku?.tanggal_berlaku_mulai_pemasih,
    masaBerlaku?.masa_berlaku_tahun
  )) {
    const tagihan = hitungTagihanDudukanPeriode(
      tarifNominal,
      tanggalTerdaftar,
      tahun,
      bl
    );
    if (tagihan <= 0) continue;
    const key = periodeKey(tahun, bl);
    const dibayar = dibayarMap.get(key) ?? 0;
    const detail = keringananDetailMap?.get(key);
    const keringanan = detail
      ? Math.round(Number(detail.jumlah) || 0)
      : (keringananMap.get(key) ?? 0);
    const sisa = hitungSisaDudukan(tagihan, dibayar, keringanan);
    const lunas = isLunasDudukan(tagihan, dibayar, keringanan);
    const lunas_keringanan = isLunasKeringananDudukan(tagihan, dibayar, keringanan);
    const telat = isPeringatanTelatDudukan(tahun, bl, tagihan, dibayar, keringanan);
    const di_muka = isPeriodeDudukanMendatang(tahun, bl);
    const item: DudukanTunggakanBulan = {
      tahun,
      bulan: bl,
      tagihan,
      dibayar,
      keringanan,
      keringanan_id: detail?.id ?? null,
      keringanan_keterangan: detail?.keterangan ?? null,
      sisa,
      lunas,
      lunas_keringanan,
      telat,
      di_muka,
    };
    bulan.push(item);
    if (lunas_keringanan) lunas_keringanan_bulan += 1;
    if (sisa > 0) {
      if (di_muka) {
        total_sisa_dimuka += sisa;
      } else {
        total_sisa += sisa;
        tunggakan_bulan += 1;
      }
    }
  }

  return { tunggakan_bulan, total_sisa, total_sisa_dimuka, lunas_keringanan_bulan, bulan };
}

type TunggakanBatchData = {
  dibayarByKrama: DibayarPeriodeByKrama;
  keringananByKrama: KeringananPeriodeByKrama;
  keringananDetailByKrama: KeringananDetailByKrama;
  lastPembayaranTanggalByKrama?: LastPembayaranTanggalByKrama;
};

const EMPTY_PERIODE_MAP = new Map<string, number>();
const EMPTY_KERINGANAN_DETAIL_MAP = new Map<string, DudukanKeringananRow>();
const EMPTY_TANGGAL_MAP = new Map<string, string>();

async function loadTunggakanBatchData(
  includeLastPembayaran = false
): Promise<TunggakanBatchData> {
  const [dibayarByKrama, keringananByKrama, keringananDetailByKrama, lastPembayaranTanggalByKrama] =
    await Promise.all([
      getDibayarPeriodeMapsForPemasihAktif(),
      getKeringananPeriodeMapsForPemasihAktif(),
      getKeringananDetailMapsForPemasihAktif(),
      includeLastPembayaran ? getLastPembayaranTanggalMapsForPemasihAktif() : Promise.resolve(undefined),
    ]);
  return {
    dibayarByKrama,
    keringananByKrama,
    keringananDetailByKrama,
    lastPembayaranTanggalByKrama,
  };
}

/** Batch pembayaran/keringanan hanya untuk krama terfilter — jauh lebih ringan saat filter banjar/cari. */
async function loadTunggakanBatchDataForKramaIds(kramaIds: string[]): Promise<TunggakanBatchData> {
  if (kramaIds.length === 0) {
    return {
      dibayarByKrama: new Map(),
      keringananByKrama: new Map(),
      keringananDetailByKrama: new Map(),
    };
  }
  const [dibayarByKrama, keringananByKrama, keringananDetailByKrama] = await Promise.all([
    getDibayarPeriodeMapsForKramaIds(kramaIds),
    getKeringananPeriodeMapsForKramaIds(kramaIds),
    getKeringananDetailMapsForKramaIds(kramaIds),
  ]);
  return { dibayarByKrama, keringananByKrama, keringananDetailByKrama };
}

function hasDudukanListFilter(params: {
  q?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  rtBtn?: string;
  punyaTunggakan?: boolean;
}): boolean {
  return Boolean(
    params.q?.trim() ||
      params.banjarId ||
      params.klasifikasi ||
      params.jenisKramaTamiuId ||
      params.jenisTamiuId ||
      params.rtBtn?.trim()
  );
}

function hitungTunggakanForBaseRow(row: KramaDudukanBase, batch: TunggakanBatchData) {
  return hitungTunggakanDariPembayaran(
    Number(row.tarif_nominal) || 0,
    row.tanggal_terdaftar,
    batch.dibayarByKrama.get(row.id) ?? EMPTY_PERIODE_MAP,
    batch.keringananByKrama.get(row.id) ?? EMPTY_PERIODE_MAP,
    batch.keringananDetailByKrama.get(row.id) ?? EMPTY_KERINGANAN_DETAIL_MAP,
    {
      tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
      masa_berlaku_tahun: row.masa_berlaku_tahun,
    }
  );
}

function buildRingkasanBulanFromDudukanRows(
  dudukanRows: DudukanKramaRow[],
  tahun: number,
  bulan: number
): RingkasanBulanDudukan {
  const perJenisMap = new Map<
    string,
    {
      klasifikasi_kode: KlasifikasiKode;
      jenis_nama: string;
      tarif: number;
      jumlah_krama: number;
      total_tagihan: number;
    }
  >();

  for (const r of dudukanRows) {
    const key = `${r.klasifikasi_kode}:${r.jenis_nama}:${r.tarif}`;
    const cur = perJenisMap.get(key) ?? {
      klasifikasi_kode: r.klasifikasi_kode,
      jenis_nama: r.jenis_nama,
      tarif: r.tarif,
      jumlah_krama: 0,
      total_tagihan: 0,
    };
    cur.jumlah_krama += 1;
    cur.total_tagihan += r.tarif;
    perJenisMap.set(key, cur);
  }

  return {
    tahun: parseTahun(tahun),
    bulan: parseBulan(bulan),
    total_krama: dudukanRows.length,
    total_tagihan: dudukanRows.reduce((s, r) => s + r.tarif, 0),
    total_dibayar: dudukanRows.reduce((s, r) => s + r.dibayar, 0),
    total_keringanan: dudukanRows.reduce((s, r) => s + r.keringanan, 0),
    total_sisa: dudukanRows.reduce((s, r) => s + r.sisa, 0),
    jumlah_belum_lunas: dudukanRows.filter((r) => r.tarif > 0 && !r.lunas).length,
    jumlah_lunas_keringanan: dudukanRows.filter((r) => r.lunas_keringanan).length,
    jumlah_telat: dudukanRows.filter((r) => r.peringatan_telat).length,
    perJenis: [...perJenisMap.values()].sort(
      (a, b) =>
        a.klasifikasi_kode.localeCompare(b.klasifikasi_kode) ||
        a.jenis_nama.localeCompare(b.jenis_nama)
    ),
  };
}

function buildDudukanRowsForBulan(
  rows: KramaDudukanBase[],
  tahun: number,
  bulan: number,
  dibayarMap: Map<string, number>,
  keringananMap: Map<string, number>
): DudukanKramaRow[] {
  const result: DudukanKramaRow[] = [];
  for (const row of rows) {
    if (
      !isPeriodeDudukanDalamMasaBerlaku(
        row.tanggal_terdaftar,
        row.tanggal_berlaku_mulai_pemasih,
        row.masa_berlaku_tahun,
        tahun,
        bulan
      )
    ) {
      continue;
    }
    const tarif = hitungTagihanDudukanPeriode(
      Number(row.tarif_nominal) || 0,
      row.tanggal_terdaftar,
      tahun,
      bulan
    );
    if (tarif <= 0) continue;

    const dibayar = dibayarMap.get(row.id) ?? 0;
    const keringanan = keringananMap.get(row.id) ?? 0;
    const sisa = hitungSisaDudukan(tarif, dibayar, keringanan);
    const lunas = isLunasDudukan(tarif, dibayar, keringanan);
    const lunas_keringanan = isLunasKeringananDudukan(tarif, dibayar, keringanan);
    const peringatan_telat = isPeringatanTelatDudukan(
      tahun,
      bulan,
      tarif,
      dibayar,
      keringanan
    );

    result.push({
      id: row.id,
      nomor_kartu: row.nomor_kartu,
      kepala_nama: row.kepala_nama,
      klasifikasi_kode: row.klasifikasi_kode,
      klasifikasi_nama: row.klasifikasi_nama,
      jenis_nama: row.jenis_nama?.trim() || "—",
      tarif,
      dibayar,
      keringanan,
      sisa,
      lunas,
      lunas_keringanan,
      peringatan_telat,
      banjar_id: row.banjar_id,
      banjar_nama: row.banjar_nama,
      banjar_kode: row.banjar_kode,
      status_krama: row.status_krama,
      status_pemasih: "aktif",
      tanggal_tidak_aktif: row.tanggal_tidak_aktif,
      tanggal_terdaftar: row.tanggal_terdaftar,
    });
  }
  return result;
}

function buildKramaDudukanSearchFromBase(
  rows: KramaDudukanBase[],
  batch: TunggakanBatchData,
  punyaTunggakan?: boolean
): DudukanKramaSearchRow[] {
  const result: DudukanKramaSearchRow[] = [];
  for (const row of rows) {
    const detail = mapKramaBase(row);
    if (detail.tarif_bulanan <= 0) continue;

    const tunggakan = hitungTunggakanForBaseRow(row, batch);
    if (punyaTunggakan && tunggakan.tunggakan_bulan <= 0) continue;

    const bulan_tunggakan_aktif = tunggakan.bulan.filter((b) => b.sisa > 0 && !b.di_muka);

    result.push({
      ...detail,
      tunggakan_bulan: tunggakan.tunggakan_bulan,
      total_sisa: tunggakan.total_sisa,
      total_sisa_dimuka: tunggakan.total_sisa_dimuka,
      lunas_keringanan_bulan: tunggakan.lunas_keringanan_bulan,
      bulan_tunggakan_aktif,
    });
  }
  result.sort((a, b) => {
    const alamat = (a.alamat ?? "").localeCompare(b.alamat ?? "", "id", { sensitivity: "base" });
    if (alamat !== 0) return alamat;
    return (a.kepala_nama ?? "").localeCompare(b.kepala_nama ?? "", "id");
  });
  return result;
}

export async function loadDudukanListAndRingkasanBulan(
  searchParams: {
    q?: string;
    banjarId?: string;
    klasifikasi?: KlasifikasiKode;
    jenisKramaTamiuId?: string;
    jenisTamiuId?: string;
    rtBtn?: string;
    punyaTunggakan?: boolean;
  } = {},
  tahun: number,
  bulan: number
): Promise<{ list: DudukanKramaSearchRow[]; ringkasanBulan: RingkasanBulanDudukan }> {
  const t = parseTahun(tahun);
  const b = parseBulan(bulan);
  const cacheKey = `dudukan:list+ringkasan:${t}-${b}:${JSON.stringify(searchParams)}`;
  return cachedQuery(cacheKey, async () => {
    const rows = await queryKramaDudukanBase(searchParams);
    const scoped = hasDudukanListFilter(searchParams);
    const ids = scoped ? rows.map((r) => r.id) : null;

    const [batch, dibayarBulan, keringananBulan] = await Promise.all([
      ids ? loadTunggakanBatchDataForKramaIds(ids) : loadTunggakanBatchData(),
      ids ? getTotalDibayarMapForKramaIds(t, b, ids) : getTotalDibayarMap(t, b),
      ids ? getKeringananMapForBulanForKramaIds(t, b, ids) : getKeringananMapForBulan(t, b),
    ]);

    const list = buildKramaDudukanSearchFromBase(rows, batch, searchParams.punyaTunggakan);
    const dudukanBulan = buildDudukanRowsForBulan(rows, t, b, dibayarBulan, keringananBulan);
    const ringkasanBulan = buildRingkasanBulanFromDudukanRows(dudukanBulan, t, b);

    return { list, ringkasanBulan };
  });
}

export type DudukanEksekutif = {
  /** Urutan sama dengan `periods`. */
  tren: RingkasanBulanDudukan[];
  tunggakan: {
    jumlah_krama: number;
    total_sisa: number;
    jumlah_bulan_telat: number;
  };
};

/** Ringkasan beberapa bulan + total tunggakan dari satu kali muat data pemasih aktif. */
export async function getDudukanEksekutif(
  periods: { tahun: number; bulan: number }[]
): Promise<DudukanEksekutif> {
  const [rows, batch] = await Promise.all([queryKramaDudukanBase(), loadTunggakanBatchData()]);

  const tren = periods.map((p) => {
    const t = parseTahun(p.tahun);
    const b = parseBulan(p.bulan);
    const key = periodeKey(t, b);
    const dibayarMap = new Map<string, number>();
    const keringananMap = new Map<string, number>();
    for (const row of rows) {
      const dibayar = batch.dibayarByKrama.get(row.id)?.get(key);
      if (dibayar) dibayarMap.set(row.id, dibayar);
      const keringanan = batch.keringananByKrama.get(row.id)?.get(key);
      if (keringanan) keringananMap.set(row.id, keringanan);
    }
    const dudukanRows = buildDudukanRowsForBulan(rows, t, b, dibayarMap, keringananMap);
    return buildRingkasanBulanFromDudukanRows(dudukanRows, t, b);
  });

  let jumlah_krama = 0;
  let total_sisa = 0;
  let jumlah_bulan_telat = 0;
  for (const row of rows) {
    if (hitungTagihanDudukan(Number(row.tarif_nominal) || 0) <= 0) continue;
    const bulanTunggakan = hitungTunggakanForBaseRow(row, batch).bulan.filter(
      (b) => b.sisa > 0 && !b.di_muka
    );
    if (bulanTunggakan.length === 0) continue;
    jumlah_krama += 1;
    for (const b of bulanTunggakan) {
      total_sisa += b.sisa;
      if (b.telat) jumlah_bulan_telat += 1;
    }
  }

  return { tren, tunggakan: { jumlah_krama, total_sisa, jumlah_bulan_telat } };
}

function isPeriodePertimbanganKeringanan(b: DudukanTunggakanBulan): boolean {
  if (b.di_muka || b.keringanan !== 0) return false;
  return statusBayarDudukan(b.tagihan, b.dibayar, b.keringanan) === "cicil";
}

async function queryKramaDudukanBase(params?: {
  q?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  rtBtn?: string;
  kramaId?: string;
}): Promise<KramaDudukanBase[]> {
  const db = await getDb();
  let sql = `
    SELECT k.id, k.nomor_kartu, k.tanggal_terdaftar, k.status_krama,
           k.tanggal_tidak_aktif, k.tanggal_berlaku_mulai_pemasih,
           kk.kode as klasifikasi_kode, kk.nama_tampilan as klasifikasi_nama,
           p.nama_lengkap as kepala_nama,
           COALESCE(jkt.nama, jt.nama, '') as jenis_nama,
           COALESCE(jkt.dudukan_nominal, jt.dudukan_nominal, 0) as tarif_nominal,
           COALESCE(jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun,
           k.banjar_id, b.nama as banjar_nama, b.kode as banjar_kode,
           COALESCE(NULLIF(TRIM(k.alamat), ''), '—') as alamat,
           COALESCE(NULLIF(TRIM(k.rt_btn), ''), '—') as rt_btn,
           k.nomor_kontak
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
    JOIN penduduk p ON p.id = k.kepala_penduduk_id
    LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
    LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
    JOIN banjar b ON b.id = k.banjar_id
    WHERE kk.kode IN ('KRAMA_TAMIU', 'TAMIU') AND k.status_krama = 'aktif'
  `;
  const args: unknown[] = [];
  let n = 1;

  if (params?.kramaId) {
    sql += ` AND k.id = $${n++}`;
    args.push(params.kramaId);
  }
  if (params?.klasifikasi) {
    sql += ` AND kk.kode = $${n++}`;
    args.push(params.klasifikasi);
  }
  if (params?.banjarId) {
    sql += ` AND k.banjar_id = $${n++}`;
    args.push(params.banjarId);
  }
  if (params?.jenisKramaTamiuId) {
    sql += ` AND k.jenis_krama_tamiu_id = $${n++}`;
    args.push(params.jenisKramaTamiuId);
  }
  if (params?.jenisTamiuId) {
    sql += ` AND k.jenis_tamiu_id = $${n++}`;
    args.push(params.jenisTamiuId);
  }
  if (params?.rtBtn?.trim()) {
    sql += ` AND TRIM(k.rt_btn) = $${n++}`;
    args.push(params.rtBtn.trim());
  }
  if (params?.q) {
    const q = `%${params.q}%`;
    sql += ` AND (
      k.nomor_kartu LIKE $${n}
      OR p.nama_lengkap LIKE $${n + 1}
      OR COALESCE(k.alamat, '') LIKE $${n + 2}
      OR EXISTS (
        SELECT 1
        FROM anggota_keluarga ak
        JOIN penduduk pm ON pm.id = ak.penduduk_id
        WHERE ak.krama_id = k.id
          AND ak.status = 'aktif'
          AND pm.nama_lengkap LIKE $${n + 3}
      )
    )`;
    args.push(q, q, q, q);
    n += 4;
  }
  sql += ` ORDER BY b.kode ASC, k.nomor_kartu ASC`;
  return db.select<KramaDudukanBase[]>(sql, args);
}

export async function getKramaDudukanDetail(
  kramaId: string
): Promise<DudukanKramaDetail | null> {
  const rows = await queryKramaDudukanBase({ kramaId });
  const row = rows[0];
  if (!row) return null;
  return mapKramaBase(row);
}

export async function getTunggakanDudukanKrama(
  kramaId: string
): Promise<DudukanTunggakanBulan[]> {
  const rows = await queryKramaDudukanBase({ kramaId });
  const row = rows[0];
  if (!row) return [];
  const [dibayarMap, keringananMap, keringananDetailMap] = await Promise.all([
    getDibayarPeriodeMapForKrama(kramaId),
    getKeringananPeriodeMapForKrama(kramaId),
    getKeringananDetailMapForKrama(kramaId),
  ]);
  return hitungTunggakanDariPembayaran(
    Number(row.tarif_nominal) || 0,
    row.tanggal_terdaftar,
    dibayarMap,
    keringananMap,
    keringananDetailMap,
    {
      tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
      masa_berlaku_tahun: row.masa_berlaku_tahun,
    }
  ).bulan;
}

export async function listKramaDudukanSearch(params?: {
  q?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  punyaTunggakan?: boolean;
}): Promise<DudukanKramaSearchRow[]> {
  const rows = await queryKramaDudukanBase(params);
  const scoped = hasDudukanListFilter(params ?? {});
  const batch = scoped
    ? await loadTunggakanBatchDataForKramaIds(rows.map((r) => r.id))
    : await loadTunggakanBatchData();
  return buildKramaDudukanSearchFromBase(rows, batch, params?.punyaTunggakan);
}

export async function listDudukanTunggakanLaporan(params?: {
  q?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  rtBtn?: string;
  minBulanTunggakan?: number;
  /** Filter periode tagihan — hanya baris dengan sisa di bulan/tahun ini (mode periode). */
  tahun?: number;
  bulan?: number;
}): Promise<DudukanTunggakanLaporanRow[]> {
  const cacheKey = `dudukan:tunggakan:${JSON.stringify(params ?? {})}`;
  return cachedQuery(cacheKey, async () => {
    const rows = await queryKramaDudukanBase(params);
    const scoped = hasDudukanListFilter(params ?? {});
    const batch = scoped
      ? await loadTunggakanBatchDataForKramaIds(rows.map((r) => r.id))
      : await loadTunggakanBatchData();
    const result: DudukanTunggakanLaporanRow[] = [];
    const minBulan = Math.max(1, params?.minBulanTunggakan ?? 1);
    const filterPeriode =
      params?.tahun != null &&
      params?.bulan != null &&
      params.tahun > 0 &&
      params.bulan >= 1 &&
      params.bulan <= 12;

    for (const row of rows) {
      const detail = mapKramaBase(row);
      if (detail.tarif_bulanan <= 0) continue;

      const tunggakan = hitungTunggakanForBaseRow(row, batch);
      let bulan_tunggakan = tunggakan.bulan.filter((b) => b.sisa > 0 && !b.di_muka);
      if (bulan_tunggakan.length < minBulan) continue;

      if (filterPeriode) {
        bulan_tunggakan = bulan_tunggakan.filter(
          (b) => b.tahun === params!.tahun && b.bulan === params!.bulan
        );
        if (bulan_tunggakan.length === 0) continue;
      }

      const total_sisa = bulan_tunggakan.reduce((s, b) => s + b.sisa, 0);

      result.push({
        ...detail,
        tunggakan_bulan: bulan_tunggakan.length,
        total_sisa,
        total_sisa_dimuka: tunggakan.total_sisa_dimuka,
        lunas_keringanan_bulan: tunggakan.lunas_keringanan_bulan,
        bulan_tunggakan_aktif: bulan_tunggakan,
        bulan_tunggakan,
      });
    }

    result.sort((a, b) => {
      const alamat = (a.alamat ?? "").localeCompare(b.alamat ?? "", "id", { sensitivity: "base" });
      if (alamat !== 0) return alamat;
      return (a.kepala_nama ?? "").localeCompare(b.kepala_nama ?? "", "id");
    });

    return result;
  });
}

export async function listDudukanPertimbanganKeringananLaporan(params?: {
  q?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  rtBtn?: string;
}): Promise<DudukanPertimbanganKeringananRow[]> {
  const [rows, batch] = await Promise.all([
    queryKramaDudukanBase(params),
    loadTunggakanBatchData(true),
  ]);
  const result: DudukanPertimbanganKeringananRow[] = [];

  for (const row of rows) {
    const detail = mapKramaBase(row);
    if (detail.tarif_bulanan <= 0) continue;

    const tunggakan = hitungTunggakanForBaseRow(row, batch);
    const tanggalMap =
      batch.lastPembayaranTanggalByKrama?.get(row.id) ?? EMPTY_TANGGAL_MAP;

    for (const b of tunggakan.bulan) {
      if (!isPeriodePertimbanganKeringanan(b)) continue;
      result.push({
        ...detail,
        tahun: b.tahun,
        bulan: b.bulan,
        tagihan: b.tagihan,
        dibayar: b.dibayar,
        sisa: b.sisa,
        telat: b.telat,
        tanggal_transaksi: tanggalMap.get(periodeKey(b.tahun, b.bulan)) ?? null,
      });
    }
  }

  result.sort((a, b) => {
    if (a.tahun !== b.tahun) return a.tahun - b.tahun;
    if (a.bulan !== b.bulan) return a.bulan - b.bulan;
    const banjar = compareBanjarRow(a, b);
    if (banjar !== 0) return banjar;
    return a.kepala_nama.localeCompare(b.kepala_nama, "id");
  });

  return result;
}

export { listBanjar };
