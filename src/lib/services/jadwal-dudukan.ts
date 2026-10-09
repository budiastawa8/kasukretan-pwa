import { formatBulanIndonesiaSingkat, periodeKey } from "../dudukan-hitung";
import { formatRupiah } from "../paturunan-hitung";
import type { KlasifikasiKode, KramaDetail } from "../types";
import { formatTanggalLahir, formatTanggalSingkat } from "../utils";
import { getKramaDudukanDetail, getTunggakanDudukanKrama, type DudukanKramaDetail } from "./dudukan";
import { getLastPembayaranInfoPeriodeMapForKrama } from "./dudukan-pembayaran";
import { getKramaDetail } from "./krama";

export type JadwalDudukanRow = {
  no: number;
  bulan: string;
  nominal: string;
  tglBayar: string;
  jumlahBayar: string;
  petugas: string;
};

export type JadwalDudukanData = {
  detail: DudukanKramaDetail;
  krama: KramaDetail;
  cardTitle: string;
  jenisLabel: string;
  rows: JadwalDudukanRow[];
};

export function kartuDudukanTitle(kode: KlasifikasiKode): string {
  if (kode === "KRAMA_TAMIU") return "KARTU DUDUKAN KRAMA TAMIU";
  if (kode === "TAMIU") return "KARTU DUDUKAN TAMIU";
  return "KARTU DUDUKAN";
}

function petugasDisplay(nama: string): string {
  const trimmed = nama.trim();
  if (!trimmed || trimmed === "—") return "";
  return trimmed;
}

export async function buildJadwalDudukanData(kramaId: string): Promise<JadwalDudukanData | null> {
  const [krama, detail, bulan, lastBayar] = await Promise.all([
    getKramaDetail(kramaId),
    getKramaDudukanDetail(kramaId),
    getTunggakanDudukanKrama(kramaId),
    getLastPembayaranInfoPeriodeMapForKrama(kramaId),
  ]);
  if (!krama || !detail) return null;

  const jenisNama = detail.jenis_nama?.trim() || krama.jenis_nama?.trim() || "";
  const jenisLabel = jenisNama || krama.klasifikasi_nama;

  const rows: JadwalDudukanRow[] = bulan.map((b, idx) => {
    const key = periodeKey(b.tahun, b.bulan);
    const bayar = lastBayar.get(key);
    let tglBayar = "";
    let jumlahBayar = "";
    let petugas = "";

    if (b.lunas_keringanan && b.dibayar <= 0) {
      petugas = "Keringanan";
    } else if (bayar && b.dibayar > 0) {
      tglBayar = formatTanggalSingkat(bayar.tanggal);
      jumlahBayar = formatRupiah(b.dibayar);
      petugas = petugasDisplay(bayar.petugas_nama);
    }

    return {
      no: idx + 1,
      bulan: formatBulanIndonesiaSingkat(b.bulan, b.tahun),
      nominal: formatRupiah(b.tagihan),
      tglBayar,
      jumlahBayar,
      petugas,
    };
  });

  return {
    detail,
    krama,
    cardTitle: kartuDudukanTitle(krama.klasifikasi_kode),
    jenisLabel,
    rows,
  };
}

export function kartuDudukanMetaFields(data: JadwalDudukanData): {
  banjarAdat: string;
  tempek: string;
  rtBtn: string;
  nomorPemasih: string;
  tglPemasih: string;
  nomorKontak: string;
} {
  const { detail, krama } = data;
  const tgl = formatTanggalLahir(krama.tanggal_terdaftar);
  return {
    banjarAdat: detail.banjar_nama?.trim() || "—",
    tempek: krama.tempek_nama?.trim() || "—",
    rtBtn: detail.rt_btn?.trim() || "—",
    nomorPemasih: detail.nomor_kartu,
    tglPemasih: tgl === "—" ? "" : tgl,
    nomorKontak: krama.nomor_kontak?.trim() || "",
  };
}

/** Maksimal kartu dudukan per cetak massal. */
export const KARTU_DUDUKAN_BATCH_MAX = 200;

const BATCH_BUILD_CONCURRENCY = 5;

/** Bangun data kartu dudukan untuk banyak krama (batch kecil). */
export async function buildJadwalDudukanDataBatch(
  kramaIds: string[]
): Promise<JadwalDudukanData[]> {
  const out: JadwalDudukanData[] = [];
  for (let i = 0; i < kramaIds.length; i += BATCH_BUILD_CONCURRENCY) {
    const chunk = kramaIds.slice(i, i + BATCH_BUILD_CONCURRENCY);
    const results = await Promise.all(chunk.map((id) => buildJadwalDudukanData(id)));
    for (const data of results) {
      if (data) out.push(data);
    }
  }
  return out;
}
