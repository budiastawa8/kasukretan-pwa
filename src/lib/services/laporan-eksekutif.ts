import { getDb } from "../db/client";
import {
  bulanSaatIni,
  formatBulanIndonesia,
  parseBulan,
  parseTahun,
  tahunSaatIni,
} from "../dudukan-hitung";
import { cachedQuery } from "../query-cache";
import { getPemasihPerhatianRingkasan } from "./krama";
import { listIuranPaturunan } from "./iuran-paturunan";
import { getDudukanEksekutif, type RingkasanBulanDudukan } from "./dudukan";
import { getRingkasanIuran } from "./paturunan";
import { readRingkasanCache, writeRingkasanCache } from "./ringkasan-cache";
export type PeriodeBulanTahun = { tahun: number; bulan: number };

export function iterBulanTerakhir(jumlah: number): PeriodeBulanTahun[] {
  const n = Math.max(1, Math.min(24, Math.round(jumlah)));
  let tahun = tahunSaatIni();
  let bulan = bulanSaatIni();
  const items: PeriodeBulanTahun[] = [];
  for (let i = 0; i < n; i++) {
    items.push({ tahun, bulan });
    bulan -= 1;
    if (bulan < 1) {
      bulan = 12;
      tahun -= 1;
    }
  }
  return items.reverse();
}

export type TrenDudukanBulan = PeriodeBulanTahun & {
  label: string;
  label_pendek: string;
  tagihan: number;
  dibayar: number;
  keringanan: number;
  sisa: number;
};

export type TrenPaturunanBulan = PeriodeBulanTahun & {
  label: string;
  label_pendek: string;
  wajib: number;
  punia: number;
};

export type LaporanEksekutifPaturunanIuran = {
  iuran_id: string;
  iuran_nama: string;
  total_dibayar_wajib: number;
  total_punia: number;
  total_sisa: number;
  jumlah_tunggakan: number;
  jumlah_telat: number;
};

export type LaporanEksekutifJenisKrama = {
  jenis_id: string;
  jenis_nama: string;
  jumlah_krama: number;
};

export type LaporanEksekutifDemografi = {
  total_krama: number;
  mipil: number;
  krama_tamiu: number;
  tamiu: number;
  /** Krama Tamiu + Tamiu */
  pemasih: number;
  per_jenis: {
    mipil: LaporanEksekutifJenisKrama[];
    krama_tamiu: LaporanEksekutifJenisKrama[];
    tamiu: LaporanEksekutifJenisKrama[];
  };
};

export type LaporanEksekutif = {
  demografi: LaporanEksekutifDemografi;
  paturunan: {
    per_iuran: LaporanEksekutifPaturunanIuran[];
    total_wajib: number;
    total_punia: number;
    total_sisa: number;
    jumlah_tunggakan: number;
    jumlah_telat: number;
  };
  dudukan_bulan_ini: RingkasanBulanDudukan;
  tunggakan_dudukan: {
    jumlah_krama: number;
    total_sisa: number;
    jumlah_bulan_telat: number;
  };
  perhatian_pemasih: {
    tidak_aktif: number;
    akan_habis: number;
  };
  tren_dudukan: TrenDudukanBulan[];
  tren_paturunan: TrenPaturunanBulan[];
};

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function labelPendek(bulan: number, tahun: number): string {
  return `${BULAN_PENDEK[parseBulan(bulan) - 1]} '${String(parseTahun(tahun)).slice(-2)}`;
}

async function getPaturunanTrenBulanan(jumlahBulan: number): Promise<TrenPaturunanBulan[]> {
  const db = await getDb();
  const periods = iterBulanTerakhir(jumlahBulan);
  const start = periods[0];
  const startIso = `${parseTahun(start.tahun)}-${String(parseBulan(start.bulan)).padStart(2, "0")}-01`;

  const rows = await db.select<{ tahun: number; bulan: number; wajib: number; punia: number }[]>(
    `SELECT CAST(strftime('%Y', tanggal) AS INTEGER) as tahun,
            CAST(strftime('%m', tanggal) AS INTEGER) as bulan,
            COALESCE(SUM(CASE WHEN jenis = 'wajib' THEN jumlah ELSE 0 END), 0) as wajib,
            COALESCE(SUM(CASE WHEN jenis = 'punia' THEN jumlah ELSE 0 END), 0) as punia
     FROM paturunan_pembayaran
     WHERE tanggal >= $1
     GROUP BY tahun, bulan`,
    [startIso]
  );

  const map = new Map<string, { wajib: number; punia: number }>();
  for (const r of rows) {
    map.set(`${r.tahun}-${r.bulan}`, {
      wajib: Math.round(Number(r.wajib) || 0),
      punia: Math.round(Number(r.punia) || 0),
    });
  }

  return periods.map((p) => {
    const cur = map.get(`${p.tahun}-${p.bulan}`) ?? { wajib: 0, punia: 0 };
    return {
      ...p,
      label: formatBulanIndonesia(p.bulan, p.tahun),
      label_pendek: labelPendek(p.bulan, p.tahun),
      wajib: cur.wajib,
      punia: cur.punia,
    };
  });
}

type DudukanEksekutifBagian = {
  tren: TrenDudukanBulan[];
  bulan_ini: RingkasanBulanDudukan;
  tunggakan: LaporanEksekutif["tunggakan_dudukan"];
};

/**
 * Periode tren selalu diakhiri bulan berjalan, jadi ringkasan bulan ini = elemen terakhir.
 * `tanpaTren`: hanya bulan berjalan (hemat untuk Dashboard HP).
 */
async function getDudukanBagian(
  jumlahBulan: number,
  tanpaTren = false
): Promise<DudukanEksekutifBagian> {
  const periods = tanpaTren
    ? [{ tahun: tahunSaatIni(), bulan: bulanSaatIni() }]
    : iterBulanTerakhir(jumlahBulan);
  const { tren, tunggakan } = await getDudukanEksekutif(periods);
  const trenMapped = periods.map((p, i) => {
    const r = tren[i];
    return {
      ...p,
      label: formatBulanIndonesia(p.bulan, p.tahun),
      label_pendek: labelPendek(p.bulan, p.tahun),
      tagihan: r.total_tagihan,
      dibayar: r.total_dibayar,
      keringanan: r.total_keringanan,
      sisa: r.total_sisa,
    };
  });
  return {
    tren: tanpaTren ? [] : trenMapped,
    bulan_ini: tren[tren.length - 1],
    tunggakan,
  };
}

/** Agregasi SQL per iuran — tanpa load daftar krama penuh. */
async function getPaturunanPerIuran(): Promise<LaporanEksekutifPaturunanIuran[]> {
  const iuranList = await listIuranPaturunan();
  return Promise.all(
    iuranList.map(async (iuran) => {
      const r = await getRingkasanIuran(iuran.id);
      if (!r) {
        return {
          iuran_id: iuran.id,
          iuran_nama: iuran.nama,
          total_dibayar_wajib: 0,
          total_punia: 0,
          total_sisa: 0,
          jumlah_tunggakan: 0,
          jumlah_telat: 0,
        };
      }
      return {
        iuran_id: r.iuran_id,
        iuran_nama: r.iuran_nama,
        total_dibayar_wajib: r.total_dibayar_wajib,
        total_punia: r.total_punia,
        total_sisa: r.total_sisa,
        jumlah_tunggakan: r.jumlah_tunggakan,
        jumlah_telat: r.jumlah_belum_lunas_telat,
      };
    })
  );
}

type JenisKramaQuery = {
  jenisTable: "jenis_krama_mipil" | "jenis_krama_tamiu" | "jenis_tamiu";
  fkColumn: "jenis_krama_mipil_id" | "jenis_krama_tamiu_id" | "jenis_tamiu_id";
  klasifikasiKode: "MIPIL" | "KRAMA_TAMIU" | "TAMIU";
};

async function getJenisKramaCountsForKlasifikasi(
  db: Awaited<ReturnType<typeof getDb>>,
  { jenisTable, fkColumn, klasifikasiKode }: JenisKramaQuery
): Promise<LaporanEksekutifJenisKrama[]> {
  const rows = await db.select<LaporanEksekutifJenisKrama[]>(
    `SELECT j.id as jenis_id, j.nama as jenis_nama,
            (SELECT COUNT(*) FROM krama k
             INNER JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = $1
             WHERE k.${fkColumn} = j.id AND k.status_krama = 'aktif') as jumlah_krama
     FROM ${jenisTable} j
     WHERE j.aktif = 1
     ORDER BY j.nama ASC`,
    [klasifikasiKode]
  );

  const result = rows.map((r) => ({
    jenis_id: r.jenis_id,
    jenis_nama: r.jenis_nama,
    jumlah_krama: Number(r.jumlah_krama) || 0,
  }));

  const unassigned = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = $1
     WHERE k.status_krama = 'aktif' AND k.${fkColumn} IS NULL`,
    [klasifikasiKode]
  );
  const unassignedCount = unassigned[0]?.c ?? 0;
  if (unassignedCount > 0) {
    result.push({
      jenis_id: "",
      jenis_nama: "Belum diisi",
      jumlah_krama: unassignedCount,
    });
  }

  return result;
}

async function getDemografiKramaEksekutif(): Promise<LaporanEksekutifDemografi> {
  const db = await getDb();
  const [mipilRows, kramaTamiuRows, tamiuRows, perKodeRows] = await Promise.all([
    getJenisKramaCountsForKlasifikasi(db, {
      jenisTable: "jenis_krama_mipil",
      fkColumn: "jenis_krama_mipil_id",
      klasifikasiKode: "MIPIL",
    }),
    getJenisKramaCountsForKlasifikasi(db, {
      jenisTable: "jenis_krama_tamiu",
      fkColumn: "jenis_krama_tamiu_id",
      klasifikasiKode: "KRAMA_TAMIU",
    }),
    getJenisKramaCountsForKlasifikasi(db, {
      jenisTable: "jenis_tamiu",
      fkColumn: "jenis_tamiu_id",
      klasifikasiKode: "TAMIU",
    }),
    db.select<{ kode: string; c: number }[]>(
      `SELECT kk.kode, COUNT(*) as c
       FROM krama k
       JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       WHERE k.status_krama = 'aktif'
       GROUP BY kk.kode`
    ),
  ]);

  const perKode = new Map(perKodeRows.map((r) => [r.kode, Number(r.c) || 0]));
  const mipil = perKode.get("MIPIL") ?? 0;
  const krama_tamiu = perKode.get("KRAMA_TAMIU") ?? 0;
  const tamiu = perKode.get("TAMIU") ?? 0;

  return {
    total_krama: [...perKode.values()].reduce((s, c) => s + c, 0),
    mipil,
    krama_tamiu,
    tamiu,
    pemasih: krama_tamiu + tamiu,
    per_jenis: {
      mipil: mipilRows,
      krama_tamiu: kramaTamiuRows,
      tamiu: tamiuRows,
    },
  };
}

/** Bagian yang tidak bergantung pada panjang tren — dipakai bersama Dashboard dan Ringkasan Eksekutif. */
async function getIntiEksekutif() {
  const [demografi, perIuran, pemasihAlert] = await Promise.all([
    getDemografiKramaEksekutif(),
    getPaturunanPerIuran(),
    getPemasihPerhatianRingkasan(),
  ]);
  return { demografi, perIuran, pemasihAlert };
}

/** `paksaMuatUlang` mengabaikan cache. `tanpaTren` skip grafik tren (Dashboard HP). */
export async function getLaporanEksekutif(
  jumlahBulanTren = 6,
  opts?: { paksaMuatUlang?: boolean; tanpaTren?: boolean }
): Promise<LaporanEksekutif> {
  const bulanTren = Math.max(6, Math.min(12, Math.round(jumlahBulanTren)));
  const ttl = opts?.paksaMuatUlang ? 0 : undefined;
  const tanpaTren = Boolean(opts?.tanpaTren);
  const snapshotKey = `laporan-eksekutif:v3:${bulanTren}:${tanpaTren ? "notiren" : "tren"}`;

  if (!opts?.paksaMuatUlang) {
    const snap = await readRingkasanCache<LaporanEksekutif>(snapshotKey);
    if (snap) return snap;
  }

  const dudukanKey = tanpaTren
    ? "eksekutif:dudukan:bulan-ini"
    : `eksekutif:dudukan:${bulanTren}`;
  const [inti, dudukan, trenPaturunan] = await Promise.all([
    cachedQuery("eksekutif:inti", getIntiEksekutif, ttl),
    cachedQuery(dudukanKey, () => getDudukanBagian(bulanTren, tanpaTren), ttl),
    tanpaTren
      ? Promise.resolve<TrenPaturunanBulan[]>([])
      : cachedQuery(
          `eksekutif:tren-paturunan:${bulanTren}`,
          () => getPaturunanTrenBulanan(bulanTren),
          ttl
        ),
  ]);
  const { demografi, perIuran, pemasihAlert } = inti;

  const result: LaporanEksekutif = {
    demografi,
    paturunan: {
      per_iuran: perIuran,
      total_wajib: perIuran.reduce((s, i) => s + i.total_dibayar_wajib, 0),
      total_punia: perIuran.reduce((s, i) => s + i.total_punia, 0),
      total_sisa: perIuran.reduce((s, i) => s + i.total_sisa, 0),
      jumlah_tunggakan: perIuran.reduce((s, i) => s + i.jumlah_tunggakan, 0),
      jumlah_telat: perIuran.reduce((s, i) => s + i.jumlah_telat, 0),
    },
    dudukan_bulan_ini: dudukan.bulan_ini,
    tunggakan_dudukan: dudukan.tunggakan,
    perhatian_pemasih: {
      tidak_aktif: pemasihAlert.tidakAktif,
      akan_habis: pemasihAlert.akanHabis,
    },
    tren_dudukan: dudukan.tren,
    tren_paturunan: trenPaturunan,
  };

  if (!opts?.paksaMuatUlang) {
    void writeRingkasanCache(snapshotKey, result);
  }
  return result;
}
