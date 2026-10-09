import type { PDFDocument, PDFPage } from "pdf-lib";
import { generateKartuQrPngBytes } from "./kartu-qr";

/** Gambar QR nomor kartu di PDF kartu pemasih. */
export async function drawKartuQrOnPage(
  pdf: PDFDocument,
  page: PDFPage,
  nomorKartu: string,
  x: number,
  y: number,
  sizePt: number
): Promise<void> {
  const bytes = await generateKartuQrPngBytes(nomorKartu, 180);
  const img = await pdf.embedPng(bytes);
  page.drawImage(img, { x, y, width: sizePt, height: sizePt });
}
