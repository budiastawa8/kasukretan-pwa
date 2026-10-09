import type { KlasifikasiKode } from "../types";
import {
  listDudukanPertimbanganKeringananLaporan,
  type DudukanPertimbanganKeringananRow,
} from "./dudukan";

export type LaporanPertimbanganKeringananDudukanFilter = {
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  rtBtn?: string;
  q?: string;
};

export type LaporanPertimbanganKeringananDudukanRingkasan = {
  total_periode: number;
  total_krama: number;
  total_tagihan: number;
  total_dibayar: number;
  total_sisa: number;
  jumlah_telat: number;
};

function hitungRingkasan(
  rows: DudukanPertimbanganKeringananRow[]
): LaporanPertimbanganKeringananDudukanRingkasan {
  const kramaIds = new Set<string>();
  let total_tagihan = 0;
  let total_dibayar = 0;
  let jumlah_telat = 0;

  for (const r of rows) {
    kramaIds.add(r.id);
    total_tagihan += r.tagihan;
    total_dibayar += r.dibayar;
    if (r.telat) jumlah_telat += 1;
  }

  return {
    total_periode: rows.length,
    total_krama: kramaIds.size,
    total_tagihan,
    total_dibayar,
    total_sisa: rows.reduce((s, r) => s + r.sisa, 0),
    jumlah_telat,
  };
}

export async function getLaporanPertimbanganKeringananDudukan(
  filter: LaporanPertimbanganKeringananDudukanFilter
): Promise<{
  ringkasan: LaporanPertimbanganKeringananDudukanRingkasan;
  rows: DudukanPertimbanganKeringananRow[];
}> {
  const rows = await listDudukanPertimbanganKeringananLaporan({
    banjarId: filter.banjarId,
    klasifikasi: filter.klasifikasi,
    jenisKramaTamiuId: filter.jenisKramaTamiuId,
    jenisTamiuId: filter.jenisTamiuId,
    rtBtn: filter.rtBtn,
    q: filter.q,
  });

  return { ringkasan: hitungRingkasan(rows), rows };
}
