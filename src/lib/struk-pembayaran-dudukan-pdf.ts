import { PDFDocument } from "pdf-lib";
import type { DesaAdat } from "./types";
import { formatBulanIndonesia, formatRupiah } from "./dudukan-hitung";
import { COLOR_TEXT, createPdfFonts, MM } from "./pdf-common";
import { formatTanggalLahir } from "./utils";
import {
  drawThermalHeader,
  drawThermalClosingMessage,
  drawThermalInfoField,
  drawThermalSeparator,
  estimateThermalPageHeight,
  getThermalMetrics,
  type StrukThermalWidthMm,
  type ThermalPageCtx,
} from "./struk-thermal-pdf";
import { STRUK_FOOTER_DUDUKAN } from "./struk-thermal-content";

export type { StrukThermalWidthMm };

export type StrukDudukanPeriodeLine = {
  tahun: number;
  bulan: number;
  jumlah: number;
};

export type StrukDudukanPdfPayload = {
  filename: string;
  krama: {
    pengajeg_nama: string;
    nomor_pemasih: string;
    jenis_krama: string;
    alamat_pemasih: string;
  };
  items: StrukDudukanPeriodeLine[];
  total: number;
  tanggal: string;
  petugasNama: string;
};

function drawPeriodeTable(
  ctx: ThermalPageCtx,
  items: StrukDudukanPeriodeLine[],
  total: number
): void {
  const drawRow = (
    left: string,
    right: string,
    bold: boolean,
    underline = false
  ) => {
    const font = bold ? ctx.fonts.bold : ctx.fonts.regular;
    const size = ctx.m.tableSize;
    const yText = ctx.y - size - 1 * MM;

    ctx.page.drawText(left, {
      x: ctx.m.marginX,
      y: yText,
      size,
      font,
      color: COLOR_TEXT,
    });
    const rightW = font.widthOfTextAtSize(right, size);
    ctx.page.drawText(right, {
      x: ctx.m.marginX + ctx.m.contentW - rightW,
      y: yText,
      size,
      font,
      color: COLOR_TEXT,
    });

    if (underline) {
      ctx.page.drawLine({
        start: { x: ctx.m.marginX, y: yText - 1 * MM },
        end: { x: ctx.m.marginX + ctx.m.contentW, y: yText - 1 * MM },
        thickness: 0.35,
        color: COLOR_TEXT,
      });
    }

    ctx.y -= ctx.m.rowH;
  };

  drawRow("Periode", "Jumlah", true, true);

  for (const item of items) {
    drawRow(
      formatBulanIndonesia(item.bulan, item.tahun),
      formatRupiah(item.jumlah),
      false
    );
  }

  drawThermalSeparator(ctx);
  drawRow("TOTAL", formatRupiah(total), true);
}

export async function buildStrukDudukanPdfBytes(
  payload: StrukDudukanPdfPayload,
  desa: DesaAdat | null,
  options?: { widthMm?: StrukThermalWidthMm }
): Promise<Uint8Array> {
  const widthMm = options?.widthMm ?? 80;
  const m = getThermalMetrics(widthMm);
  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);

  const pageH = estimateThermalPageHeight(m, 5, payload.items.length);
  const page = pdf.addPage([m.pageW, pageH]);

  const ctx: ThermalPageCtx = {
    pdf,
    page,
    y: pageH - m.marginY,
    m,
    fonts: bodyFonts,
  };

  drawThermalHeader(ctx, desa, "BUKTI PEMBAYARAN DUDUKAN");

  const k = payload.krama;
  drawThermalInfoField(ctx, "Nama", k.pengajeg_nama);
  drawThermalInfoField(ctx, "No Pemasih", k.nomor_pemasih);
  drawThermalInfoField(ctx, "Jenis", k.jenis_krama);
  drawThermalInfoField(ctx, "Alamat", k.alamat_pemasih);

  ctx.y -= 0.5 * MM;
  drawPeriodeTable(ctx, payload.items, payload.total);

  ctx.y -= 0.5 * MM;
  drawThermalInfoField(ctx, "Tanggal", formatTanggalLahir(payload.tanggal));
  drawThermalInfoField(ctx, "Petugas", payload.petugasNama);
  drawThermalClosingMessage(ctx, STRUK_FOOTER_DUDUKAN);

  return pdf.save();
}

/** Lebar kertas thermal yang didukung (mm). */
export const STRUK_THERMAL_WIDTHS: StrukThermalWidthMm[] = [58, 80];
