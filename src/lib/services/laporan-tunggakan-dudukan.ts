import type { KlasifikasiKode } from "../types";
import {
  listDudukanTunggakanLaporan,
  type DudukanTunggakanLaporanRow,
} from "./dudukan";

export type LaporanTunggakanDudukanFilter = {
  banjarId?: string;
  klasifikasi?: KlasifikasiKode;
  jenisKramaTamiuId?: string;
  jenisTamiuId?: string;
  rtBtn?: string;
  q?: string;
  minBulanTunggakan?: number;
};

export type LaporanTunggakanDudukanRingkasan = {
  total_krama: number;
  total_bulan_tunggakan: number;
  total_sisa: number;
  jumlah_telat: number;
};

function hitungRingkasan(rows: DudukanTunggakanLaporanRow[]): LaporanTunggakanDudukanRingkasan {
  let total_bulan_tunggakan = 0;
  let jumlah_telat = 0;

  for (const r of rows) {
    total_bulan_tunggakan += r.tunggakan_bulan;
    jumlah_telat += r.bulan_tunggakan.filter((b) => b.telat).length;
  }

  return {
    total_krama: rows.length,
    total_bulan_tunggakan,
    total_sisa: rows.reduce((s, r) => s + r.total_sisa, 0),
    jumlah_telat,
  };
}

export async function getLaporanTunggakanDudukan(
  filter: LaporanTunggakanDudukanFilter
): Promise<{
  ringkasan: LaporanTunggakanDudukanRingkasan;
  rows: DudukanTunggakanLaporanRow[];
}> {
  const rows = await listDudukanTunggakanLaporan({
    banjarId: filter.banjarId,
    klasifikasi: filter.klasifikasi,
    jenisKramaTamiuId: filter.jenisKramaTamiuId,
    jenisTamiuId: filter.jenisTamiuId,
    rtBtn: filter.rtBtn,
    q: filter.q,
    minBulanTunggakan: filter.minBulanTunggakan,
  });

  return { ringkasan: hitungRingkasan(rows), rows };
}
