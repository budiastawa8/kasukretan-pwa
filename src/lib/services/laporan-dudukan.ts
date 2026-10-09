import {
  hitungSisaDudukan,
  isLunasDudukan,
  isLunasKeringananDudukan,
  parseBulan,
  parseTahun,
  statusBayarDudukan,
  type DudukanStatusBayar,
} from "../dudukan-hitung";
import type { KlasifikasiKode } from "../types";
import {
  listKramaDudukan,
  type DudukanKramaRow,
} from "./dudukan";
import { getDiterimaTanggalRangeMap } from "./dudukan-pembayaran";

export type LaporanDudukanFilter = {
  dari?: string;
  sampai?: string;
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  q?: string;
  statusBayar?: DudukanStatusBayar | "telat";
};

export type LaporanDudukanRingkasan = {
  dari?: string;
  sampai?: string;
  total_krama: number;
  total_tagihan: number;
  total_dibayar: number;
  /** Total uang diterima berdasar tanggal transaksi dalam rentang laporan. */
  total_diterima: number;
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

function parseMonthFromIso(iso: string): { tahun: number; bulan: number } {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  return { tahun: parseTahun(y), bulan: parseBulan(m) };
}

function enumerateMonthsForFilter(
  dari?: string,
  sampai?: string
): { tahun: number; bulan: number }[] {
  const now = new Date();
  const defaultMonth = { tahun: now.getFullYear(), bulan: now.getMonth() + 1 };

  if (!dari?.trim() && !sampai?.trim()) {
    return [defaultMonth];
  }

  const start = parseMonthFromIso(dari?.trim() || sampai!.trim());
  const end = parseMonthFromIso(sampai?.trim() || dari!.trim());
  const out: { tahun: number; bulan: number }[] = [];

  let y = start.tahun;
  let m = start.bulan;
  while (y < end.tahun || (y === end.tahun && m <= end.bulan)) {
    out.push({ tahun: y, bulan: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  return out.length ? out : [defaultMonth];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Rentang tanggal efektif — bila dari/sampai kosong, pakai awal/akhir bulan laporan. */
function effectiveDateRange(
  months: { tahun: number; bulan: number }[],
  dari?: string,
  sampai?: string
): { dari: string; sampai: string } {
  const first = months[0]!;
  const last = months[months.length - 1]!;
  const lastDay = new Date(last.tahun, last.bulan, 0).getDate();
  return {
    dari: dari?.trim() || `${first.tahun}-${pad2(first.bulan)}-01`,
    sampai: sampai?.trim() || `${last.tahun}-${pad2(last.bulan)}-${pad2(lastDay)}`,
  };
}

function mergeDudukanRow(existing: DudukanKramaRow, row: DudukanKramaRow): DudukanKramaRow {
  const tarif = existing.tarif + row.tarif;
  const dibayar = existing.dibayar + row.dibayar;
  const keringanan = (existing.keringanan ?? 0) + (row.keringanan ?? 0);
  const sisa = hitungSisaDudukan(tarif, dibayar, keringanan);
  const lunas = isLunasDudukan(tarif, dibayar, keringanan);
  const lunas_keringanan = isLunasKeringananDudukan(tarif, dibayar, keringanan);
  const peringatan_telat = existing.peringatan_telat || row.peringatan_telat;

  return {
    ...existing,
    tarif,
    dibayar,
    keringanan,
    sisa,
    lunas,
    lunas_keringanan,
    peringatan_telat,
  };
}

function filterByStatus(
  rows: DudukanKramaRow[],
  status?: LaporanDudukanFilter["statusBayar"]
): DudukanKramaRow[] {
  if (!status) return rows;
  if (status === "telat") return rows.filter((r) => r.peringatan_telat);
  return rows.filter((r) => {
    const keringanan = r.keringanan ?? 0;
    return statusBayarDudukan(r.tarif, r.dibayar, keringanan) === status;
  });
}

export function hitungRingkasanDudukanDariRows(
  rows: DudukanKramaRow[],
  opts?: { dari?: string; sampai?: string }
): LaporanDudukanRingkasan {
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

  for (const r of rows) {
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
    dari: opts?.dari?.trim() || undefined,
    sampai: opts?.sampai?.trim() || undefined,
    total_krama: rows.length,
    total_tagihan: rows.reduce((s, r) => s + r.tarif, 0),
    total_dibayar: rows.reduce((s, r) => s + r.dibayar, 0),
    total_diterima: rows.reduce((s, r) => s + (r.diterima_periode ?? 0), 0),
    total_keringanan: rows.reduce((s, r) => s + (r.keringanan ?? 0), 0),
    total_sisa: rows.reduce((s, r) => s + r.sisa, 0),
    jumlah_belum_lunas: rows.filter((r) => r.tarif > 0 && !r.lunas).length,
    jumlah_telat: rows.filter((r) => r.peringatan_telat).length,
    jumlah_lunas_keringanan: rows.filter((r) =>
      isLunasKeringananDudukan(r.tarif, r.dibayar, r.keringanan ?? 0)
    ).length,
    perJenis: [...perJenisMap.values()].sort(
      (a, b) =>
        a.klasifikasi_kode.localeCompare(b.klasifikasi_kode) ||
        a.jenis_nama.localeCompare(b.jenis_nama)
    ),
  };
}

export async function getLaporanDudukan(filter: LaporanDudukanFilter): Promise<{
  ringkasan: LaporanDudukanRingkasan;
  rows: DudukanKramaRow[];
}> {
  const months = enumerateMonthsForFilter(filter.dari, filter.sampai);
  const byId = new Map<string, DudukanKramaRow>();

  for (const { tahun, bulan } of months) {
    const monthRows = await listKramaDudukan({
      tahun,
      bulan,
      banjarId: filter.banjarId,
      klasifikasi: filter.klasifikasi,
      jenisKramaTamiuId: filter.jenisKramaTamiuId,
      jenisTamiuId: filter.jenisTamiuId,
      q: filter.q,
      includeNonaktifPernahBayar: true,
    });

    for (const row of monthRows) {
      const prev = byId.get(row.id);
      byId.set(row.id, prev ? mergeDudukanRow(prev, row) : row);
    }
  }

  const range = effectiveDateRange(months, filter.dari, filter.sampai);
  const diterimaMap = await getDiterimaTanggalRangeMap(range.dari, range.sampai);

  const rows = filterByStatus(
    [...byId.values()].map((r) => ({
      ...r,
      diterima_periode: diterimaMap.get(r.id) ?? 0,
    })),
    filter.statusBayar
  ).sort((a, b) => a.nomor_kartu.localeCompare(b.nomor_kartu));
  const ringkasan = hitungRingkasanDudukanDariRows(rows, {
    dari: filter.dari,
    sampai: filter.sampai,
  });

  return { ringkasan, rows };
}
