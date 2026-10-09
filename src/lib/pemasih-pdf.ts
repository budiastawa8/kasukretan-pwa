import { PDFDocument, type PDFPage } from "pdf-lib";
import type { PemasihPrintMeta } from "./pemasih-print";
import { formatBerlakuSdKrama, hasMasaBerlakuTahun } from "./masa-berlaku";
import type { DesaAdat, KramaDetail } from "./types";
import { formatTanggalLahir } from "./utils";
import {
  createPdfFonts,
  embedDataUrlImage,
  MM,
  PAGE_LANDSCAPE_H,
  PAGE_LANDSCAPE_W,
  type PdfFonts,
} from "./pdf-common";
import { createTableFonts } from "./pdf-table-fonts";
import { pemasihTableColumns } from "./ilikita-table-columns";
import {
  contentLeft,
  contentWidth,
  drawFullHeader,
  drawKtField,
  KT_FIELD_COLON_W,
  KT_FIELD_LABEL_W,
  drawSheetTitle,
  drawStyledTable,
  drawThreeColumnFooter,
  drawIlikitaFooterQr,
  loadSheetLogos,
  TABLE_HEADER_SIZE,
  TABLE_SIZE,
  type HeaderVariant,
} from "./ilikita-pdf-layout";

export function pemasihPdfFilename(krama: KramaDetail): string {
  const nomor = krama.nomor_kartu.replace(/[^\w.-]+/g, "-");
  if (krama.klasifikasi_kode === "KRAMA_TAMIU") {
    return `pemasih-krama-tamiu-${nomor}.pdf`;
  }
  return `pemasih-tamiu-${nomor}.pdf`;
}

export async function generatePemasihPdf(
  krama: KramaDetail,
  desa: DesaAdat | null,
  meta: PemasihPrintMeta,
  options?: { tampilkanTtdBandesa?: boolean }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_LANDSCAPE_W, PAGE_LANDSCAPE_H]);
  const fonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf);
  const images = await loadSheetLogos(pdf, desa);
  const showTtd = options?.tampilkanTtdBandesa === true;
  const bandesaTtd = showTtd ? await embedDataUrlImage(pdf, desa?.bandesa_ttd_url) : null;

  const headerVariant: HeaderVariant =
    meta.layout === "tamiu-official" ? "tamiu-black" : "classic-yellow";

  let y = drawFullHeader(page, desa, headerVariant, fonts, images);
  const nomorLine = `${meta.nomorPrefix} . ${krama.nomor_kartu}`;
  const titlePt =
    meta.layout === "classic" ? 14 : meta.layout === "tamiu-official" ? 14 : 12;
  const nomorPt =
    meta.layout === "classic" ? 13 : meta.layout === "tamiu-official" ? 13 : 11;
  y = drawSheetTitle(page, fonts, meta.sheetTitle, nomorLine, y, titlePt, nomorPt);

  if (meta.layout === "classic") {
    y = drawClassicGrid(page, krama, fonts, y);
  } else {
    y = drawTamiuOfficialGrid(page, krama, meta, fonts, y);
  }

  const nikHeader = meta.layout === "tamiu-official" ? meta.nikColumnHeader : "NIKA";
  y = drawStyledTable(
    page,
    tableFonts,
    pemasihTableColumns(nikHeader, krama.klasifikasi_kode),
    krama.anggota_aktif,
    y,
    {
      boldHeaders: false,
      wrapCells: true,
      fontSize: TABLE_SIZE - 1,
      headerFontSize: TABLE_HEADER_SIZE - 1,
    }
  );

  const tanggalTerbit = formatTanggalLahir(krama.tanggal_terdaftar);
  const tempatTanda = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const ttd =
    tanggalTerbit && tanggalTerbit !== "—" ? `${tempatTanda}, ${tanggalTerbit}` : `${tempatTanda},`;

  const footerLeftLines: { label: string; value: string }[] = [];
  if (hasMasaBerlakuTahun(krama.masa_berlaku_tahun)) {
    footerLeftLines.push({ label: "Berlaku Sampai", value: formatBerlakuSdKrama(krama) });
  }

  drawThreeColumnFooter(page, fonts, y, {
    left: {
      lines: footerLeftLines,
    },
    center: {
      role: "Pengajeg",
      name: krama.kepala.nama_lengkap,
      placeDate: meta.layout === "tamiu-official" ? ttd : undefined,
      hidePlaceLine: meta.layout === "classic",
    },
    right: {
      placeDate: ttd,
      role: desa?.bandesa_jabatan?.trim() || "Bandesa",
      name: desa?.bandesa_nama?.trim() || "",
      signImage: bandesaTtd,
    },
  });

  await drawIlikitaFooterQr(pdf, page, krama.nomor_kartu, y, footerLeftLines.length);

  return pdf.save();
}

/** Jarak blok field klasik → tabel (pt). */
const CLASSIC_GRID_TABLE_GAP_PT = 3;
/** Kolom kiri klasik lebih lebar dari setengah lebar isi (pt). */
const CLASSIC_LEFT_COL_EXTRA_PT = 10;

function drawClassicGrid(page: PDFPage, krama: KramaDetail, fonts: PdfFonts, y: number): number {
  const totalW = contentWidth();
  const leftColW = totalW / 2 + CLASSIC_LEFT_COL_EXTRA_PT;
  const colGap = 10 * MM;
  const xLeft = contentLeft();
  const xRight = xLeft + leftColW + colGap;
  const lineH = 4.5 * MM;
  const wLeft = KT_FIELD_LABEL_W.classicLeft;
  const wRight = KT_FIELD_LABEL_W.classicRight;
  const klasifikasi = krama.jenis_nama ?? krama.klasifikasi_nama;

  const namaValueW = contentWidth() - wLeft - KT_FIELD_COLON_W;
  let yRow = y;
  drawKtField(
    page,
    fonts,
    "Nama Pengajeg",
    krama.kepala.nama_lengkap,
    xLeft,
    yRow,
    wLeft,
    36,
    namaValueW
  );
  yRow -= lineH;

  const rows: {
    left: { label: string; value: string | null | undefined; max: number };
    right: { label: string; value: string | null | undefined; max: number };
  }[] = [
    {
      left: { label: "Alamat", value: krama.alamat, max: 36 },
      right: { label: "Klasifikasi", value: klasifikasi, max: 32 },
    },
    {
      left: { label: "RT/BTN", value: krama.rt_btn, max: 36 },
      right: { label: "Desa Adat Asal", value: krama.asal_desa_adat, max: 28 },
    },
    {
      left: { label: "Tempek", value: krama.tempek_nama, max: 32 },
      right: { label: "Kecamatan Asal", value: krama.asal_kecamatan, max: 28 },
    },
    {
      left: { label: "Banjar Adat", value: krama.banjar_nama, max: 32 },
      right: { label: "Kabupaten Asal", value: krama.asal_kabupaten, max: 28 },
    },
  ];

  let yLeft = yRow;
  let yRight = yRow;
  for (const row of rows) {
    if (row.left.label) {
      drawKtField(page, fonts, row.left.label, row.left.value, xLeft, yLeft, wLeft, row.left.max);
    }
    drawKtField(page, fonts, row.right.label, row.right.value, xRight, yRight, wRight, row.right.max);
    yLeft -= lineH;
    yRight -= lineH;
  }

  return Math.min(yLeft, yRight) - CLASSIC_GRID_TABLE_GAP_PT;
}

function drawTamiuOfficialGrid(
  page: PDFPage,
  krama: KramaDetail,
  meta: Extract<PemasihPrintMeta, { layout: "tamiu-official" }>,
  fonts: PdfFonts,
  y: number
): number {
  const totalW = contentWidth();
  const leftColW = totalW / 2 + CLASSIC_LEFT_COL_EXTRA_PT;
  const colGap = 10 * MM;
  const xLeft = contentLeft();
  const xRight = xLeft + leftColW + colGap;
  const lineH = 4.5 * MM;
  const wLeft = KT_FIELD_LABEL_W.classicLeft;
  const wRight = 48 * MM;
  const klasifikasi = krama.jenis_nama ?? krama.klasifikasi_nama;

  const namaValueW = contentWidth() - wLeft - KT_FIELD_COLON_W;
  let yRow = y;
  drawKtField(
    page,
    fonts,
    "Nama Pengajeg",
    krama.kepala.nama_lengkap,
    xLeft,
    yRow,
    wLeft,
    36,
    namaValueW
  );
  yRow -= lineH;

  const rows: {
    left: { label: string; value: string | null | undefined; max: number };
    right: { label: string; value: string | null | undefined; max: number };
  }[] = [
    {
      left: { label: "Alamat", value: krama.alamat, max: 36 },
      right: { label: "Klasifikasi", value: klasifikasi, max: 32 },
    },
    {
      left: { label: "RT/BTN", value: krama.rt_btn, max: 36 },
      right: { label: meta.labelAsalDesa, value: krama.asal_desa_adat, max: 26 },
    },
    {
      left: { label: meta.labelTempek, value: krama.tempek_nama, max: 32 },
      right: { label: "Kecamatan Asal", value: krama.asal_kecamatan, max: 26 },
    },
    {
      left: { label: "Banjar Adat", value: krama.banjar_nama, max: 32 },
      right: { label: "Kabupaten Asal", value: krama.asal_kabupaten, max: 26 },
    },
    {
      left: { label: "Agama", value: krama.kepala.agama, max: 32 },
      right: { label: "Provinsi Asal", value: krama.asal_provinsi, max: 26 },
    },
  ];

  let yLeft = yRow;
  let yRight = yRow;
  for (const row of rows) {
    if (row.left.label !== "Agama" || meta.showAgamaPengajeg) {
      drawKtField(page, fonts, row.left.label, row.left.value, xLeft, yLeft, wLeft, row.left.max);
    }
    if (row.right.label !== "Provinsi Asal" || meta.showProvinsiAsal) {
      drawKtField(page, fonts, row.right.label, row.right.value, xRight, yRight, wRight, row.right.max);
    }
    yLeft -= lineH;
    yRight -= lineH;
  }

  return Math.min(yLeft, yRight) - CLASSIC_GRID_TABLE_GAP_PT;
}
