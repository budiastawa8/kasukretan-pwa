import { getDb } from "../db/client";
import {
  bulanSaatIni,
  formatBulanIndonesia,
  parseBulan,
  parseTahun,
  tahunSaatIni,
} from "../dudukan-hitung";
import { getPemasihPerhatianRingkasan } from "./krama";
import { listIuranPaturunan } from "./iuran-paturunan";
import { getRingkasanBulanDudukan, listDudukanTunggakanLaporan, type RingkasanBulanDudukan } from "./dudukan";
import { getRingkasanIuran } from "./paturunan";
import { getLaporanTunggakanPaturunan } from "./laporan-tunggakan-paturunan";
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

async function getTrenDudukan(jumlahBulan: number): Promise<TrenDudukanBulan[]> {
  const periods = iterBulanTerakhir(jumlahBulan);
  const ringkasan = await Promise.all(
    periods.map((p) => getRingkasanBulanDudukan(p.tahun, p.bulan))
  );
  return periods.map((p, i) => {
    const r = ringkasan[i];
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
  const [mipilRows, kramaTamiuRows, tamiuRows, totalRow] = await Promise.all([
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
    db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM krama WHERE status_krama = 'aktif'`
    ),
  ]);

  const sum = (rows: LaporanEksekutifJenisKrama[]) =>
    rows.reduce((s, r) => s + r.jumlah_krama, 0);
  const mipil = sum(mipilRows);
  const krama_tamiu = sum(kramaTamiuRows);
  const tamiu = sum(tamiuRows);

  return {
    total_krama: totalRow[0]?.c ?? mipil + krama_tamiu + tamiu,
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

export async function getLaporanEksekutif(jumlahBulanTren = 6): Promise<LaporanEksekutif> {
  const bulanTren = Math.max(6, Math.min(12, Math.round(jumlahBulanTren)));
  const tahunIni = tahunSaatIni();
  const bulanIni = bulanSaatIni();

  const [demografi, iuranList, dudukanBulanIni, pemasihAlert, trenPaturunan, trenDudukan, dudukanTunggakan] =
    await Promise.all([
      getDemografiKramaEksekutif(),
      listIuranPaturunan(),
      getRingkasanBulanDudukan(tahunIni, bulanIni),
      getPemasihPerhatianRingkasan(),
      getPaturunanTrenBulanan(bulanTren),
      getTrenDudukan(bulanTren),
      listDudukanTunggakanLaporan(),
    ]);

  const perIuran: LaporanEksekutifPaturunanIuran[] = [];
  let total_wajib = 0;
  let total_punia = 0;
  let total_sisa = 0;
  let jumlah_tunggakan = 0;
  let jumlah_telat = 0;

  for (const iuran of iuranList) {
    const [ringkasan, tunggakan] = await Promise.all([
      getRingkasanIuran(iuran.id),
      getLaporanTunggakanPaturunan({ iuranId: iuran.id }),
    ]);
    if (!ringkasan) continue;

    total_wajib += ringkasan.total_dibayar_wajib;
    total_punia += ringkasan.total_punia;
    total_sisa += ringkasan.total_sisa;
    jumlah_tunggakan += tunggakan.ringkasan?.total_krama_tunggakan ?? 0;
    jumlah_telat += tunggakan.ringkasan?.jumlah_telat ?? 0;

    perIuran.push({
      iuran_id: iuran.id,
      iuran_nama: iuran.nama,
      total_dibayar_wajib: ringkasan.total_dibayar_wajib,
      total_punia: ringkasan.total_punia,
      total_sisa: ringkasan.total_sisa,
      jumlah_tunggakan: tunggakan.ringkasan?.total_krama_tunggakan ?? 0,
      jumlah_telat: tunggakan.ringkasan?.jumlah_telat ?? 0,
    });
  }

  let jumlah_bulan_telat = 0;
  for (const r of dudukanTunggakan) {
    jumlah_bulan_telat += r.bulan_tunggakan.filter((b) => b.telat).length;
  }

  return {
    demografi,
    paturunan: {
      per_iuran: perIuran,
      total_wajib,
      total_punia,
      total_sisa,
      jumlah_tunggakan,
      jumlah_telat,
    },
    dudukan_bulan_ini: dudukanBulanIni,
    tunggakan_dudukan: {
      jumlah_krama: dudukanTunggakan.length,
      total_sisa: dudukanTunggakan.reduce((s, r) => s + r.total_sisa, 0),
      jumlah_bulan_telat,
    },
    perhatian_pemasih: {
      tidak_aktif: pemasihAlert.tidakAktif,
      akan_habis: pemasihAlert.akanHabis,
    },
    tren_dudukan: trenDudukan,
    tren_paturunan: trenPaturunan,
  };
}
