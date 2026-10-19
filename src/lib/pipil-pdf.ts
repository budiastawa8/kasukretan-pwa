import { PDFDocument } from "pdf-lib";
import { showBerlakuSdPipilCetak } from "./ilikita-kebijakan";
import { formatBerlakuSdKrama } from "./masa-berlaku";
import type { DesaAdat, KramaDetail } from "./types";
import { formatJenisKelamin, formatTanggalLahir, formatTempatTanggalLahir } from "./utils";
import { createPdfFonts, embedDataUrlImage, MM, PAGE_LANDSCAPE_H, PAGE_LANDSCAPE_W } from "./pdf-common";
import { createTableFonts } from "./pdf-table-fonts";
import { buildIlikitaAnggotaTablePages, pipilTableColumns } from "./ilikita-table-columns";
import {
  contentLeft,
  contentWidth,
  drawFullHeader,
  drawPipilField,
  drawSheetTitle,
  drawStyledTable,
  drawThreeColumnFooter,
  drawIlikitaFooterQr,
  loadSheetLogos,
  TABLE_HEADER_SIZE,
  TABLE_SIZE,
} from "./ilikita-pdf-layout";

export function pipilPdfFilename(krama: KramaDetail): string {
  const nomor = krama.nomor_kartu.replace(/[^\w.-]+/g, "-");
  return `pipil-${nomor}.pdf`;
}

export async function generatePipilPdf(
  krama: KramaDetail,
  desa: DesaAdat | null,
  options?: { tampilkanTtdBandesa?: boolean }
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf, { variant: "light" });
  const images = await loadSheetLogos(pdf, desa);
  const showTtd = options?.tampilkanTtdBandesa === true;
  const bandesaTtd = showTtd ? await embedDataUrlImage(pdf, desa?.bandesa_ttd_url) : null;

  const tablePages = buildIlikitaAnggotaTablePages(krama.anggota_aktif);
  const columns = pipilTableColumns();
  const tableOpts = {
    boldHeaders: false as const,
    wrapCells: true,
    fontSize: TABLE_SIZE - 1,
    headerFontSize: TABLE_HEADER_SIZE - 1,
  };

  const tanggalPencatatan = formatTanggalLahir(krama.tanggal_terdaftar);
  const tempatTanda = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const ttd =
    tanggalPencatatan && tanggalPencatatan !== "—"
      ? `${tempatTanda}, ${tanggalPencatatan}`
      : tempatTanda;

  const footerLeftLines: { label: string; value: string }[] = [];
  if (showBerlakuSdPipilCetak(desa)) {
    footerLeftLines.push({ label: "Masa berlaku", value: formatBerlakuSdKrama(krama) });
  }

  const leftX = contentLeft();
  const rightX = contentLeft() + contentWidth() / 2 + 10 * MM;
  const lineH = 4.5 * MM;
  const pengarepTtl = formatTempatTanggalLahir(
    krama.kepala.tempat_lahir,
    krama.kepala.tanggal_lahir
  );

  for (let pageIndex = 0; pageIndex < tablePages.length; pageIndex++) {
    const page = pdf.addPage([PAGE_LANDSCAPE_W, PAGE_LANDSCAPE_H]);
    const isFirst = pageIndex === 0;
    const isLast = pageIndex === tablePages.length - 1;

    let y = drawFullHeader(page, desa, "pipil-red", fonts, images);
    if (isFirst) {
      y = drawSheetTitle(
        page,
        fonts,
        "PIPIL KULAWARGA KRAMA DESA ADAT",
        `NPK. ${krama.nomor_kartu}`,
        y,
        16,
        14
      );

      drawPipilField(page, fonts, "Nama Pengarep", krama.kepala.nama_lengkap, leftX, y);
      drawPipilField(page, fonts, "Banjar Adat", krama.banjar_nama, rightX, y);
      y -= lineH;
      drawPipilField(
        page,
        fonts,
        "Klasifikasi Krama",
        krama.jenis_nama ?? krama.klasifikasi_nama,
        leftX,
        y
      );
      drawPipilField(page, fonts, "Tempekan", krama.tempek_nama, rightX, y);
      y -= lineH;
      drawPipilField(
        page,
        fonts,
        "Jenis Kelamin",
        formatJenisKelamin(krama.kepala.jenis_kelamin),
        leftX,
        y
      );
      drawPipilField(page, fonts, "Arahan", krama.arahan_nama, rightX, y);
      y -= lineH;
      drawPipilField(page, fonts, "Tempat & Tgl. Lahir", pengarepTtl, leftX, y);
      drawPipilField(page, fonts, "Keterangan", krama.keterangan, rightX, y);
      y -= 6 * MM;
    } else {
      y = drawSheetTitle(
        page,
        fonts,
        "PIPIL KULAWARGA KRAMA DESA ADAT (LANJUTAN)",
        `NPK. ${krama.nomor_kartu} · hlm. ${pageIndex + 1}`,
        y,
        16,
        14
      );
      y -= 4 * MM;
    }

    y = drawStyledTable(page, tableFonts, columns, tablePages[pageIndex]!, y, tableOpts);

    if (isLast) {
      drawThreeColumnFooter(
        page,
        fonts,
        y,
        {
          left: {
            lines: footerLeftLines,
          },
          center: { role: "Pengarep", name: krama.kepala.nama_lengkap, hidePlaceLine: true },
          right: {
            placeDate: ttd,
            role: desa?.bandesa_jabatan?.trim() || "Bandesa Adat",
            name: desa?.bandesa_nama?.trim() || "",
            signImage: bandesaTtd,
          },
        },
        true
      );

      await drawIlikitaFooterQr(pdf, page, krama.nomor_kartu, y, footerLeftLines.length);
    }
  }

  return pdf.save();
}
