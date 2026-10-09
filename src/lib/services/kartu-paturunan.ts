import { formatRupiah } from "../paturunan-hitung";
import type { KramaDetail } from "../types";
import { formatTanggalLahir, formatTanggalSingkat } from "../utils";
import { getKramaDetail } from "./krama";
import { listPembayaranPaturunanByKrama } from "./paturunan-pembayaran";

export type KartuPaturunanRow = {
  no: number;
  iuran: string;
  jenis: string;
  tglBayar: string;
  jumlahBayar: string;
  petugas: string;
};

export type KartuPaturunanData = {
  krama: KramaDetail;
  cardTitle: string;
  jenisLabel: string;
  rows: KartuPaturunanRow[];
};

export const KARTU_PATURUNAN_TITLE = "KARTU PATURUNAN KRAMA MIPIL";

function petugasDisplay(nama: string): string {
  const trimmed = nama.trim();
  if (!trimmed || trimmed === "—") return "";
  return trimmed;
}

function jenisLabel(jenis: string): string {
  return jenis === "punia" ? "Punia" : "Wajib";
}

export async function buildKartuPaturunanData(kramaId: string): Promise<KartuPaturunanData | null> {
  const [krama, pembayaran] = await Promise.all([
    getKramaDetail(kramaId),
    listPembayaranPaturunanByKrama(kramaId),
  ]);
  if (!krama) return null;

  const jenisNama = krama.jenis_nama?.trim() || "";
  const rows: KartuPaturunanRow[] = pembayaran.map((p, idx) => ({
    no: idx + 1,
    iuran: p.iuran_nama?.trim() || "—",
    jenis: jenisLabel(p.jenis),
    tglBayar: formatTanggalSingkat(p.tanggal),
    jumlahBayar: formatRupiah(p.jumlah),
    petugas: petugasDisplay(p.petugas_nama),
  }));

  return {
    krama,
    cardTitle: KARTU_PATURUNAN_TITLE,
    jenisLabel: jenisNama || krama.klasifikasi_nama,
    rows,
  };
}

export function kartuPaturunanMetaFields(data: KartuPaturunanData): {
  banjarAdat: string;
  tempek: string;
  arahan: string;
  nomorPipil: string;
  tglPipil: string;
  nomorKontak: string;
} {
  const { krama } = data;
  const tgl = formatTanggalLahir(krama.tanggal_terdaftar);
  return {
    banjarAdat: krama.banjar_nama?.trim() || "—",
    tempek: krama.tempek_nama?.trim() || "—",
    arahan: krama.arahan_nama?.trim() || "—",
    nomorPipil: krama.nomor_kartu,
    tglPipil: tgl === "—" ? "" : tgl,
    nomorKontak: krama.nomor_kontak?.trim() || "",
  };
}

export function kartuPaturunanTempekArahan(krama: KramaDetail): string {
  const tempek = krama.tempek_nama?.trim();
  const arahan = krama.arahan_nama?.trim();
  const parts: string[] = [];
  if (tempek && tempek !== "—") parts.push(`Tempek ${tempek}`);
  if (arahan && arahan !== "—") parts.push(`Arahan ${arahan}`);
  return parts.length ? parts.join(", ") : "—";
}
