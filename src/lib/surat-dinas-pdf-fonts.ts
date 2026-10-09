import type { PDFDocument } from "pdf-lib";
import { StandardFonts } from "pdf-lib";
import type { PdfFonts } from "./pdf-common";
import { registerPdfFontkit } from "./pdf-table-fonts";

import bookmanRegular from "../assets/fonts/bookman/URWBookman-Light.otf?arraybuffer";
import bookmanBold from "../assets/fonts/bookman/URWBookman-Demi.otf?arraybuffer";
import bookmanItalic from "../assets/fonts/bookman/URWBookman-LightItalic.otf?arraybuffer";

export type SuratDinasPdfFonts = PdfFonts & {
  italic: Awaited<ReturnType<PDFDocument["embedFont"]>>;
};

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/** Font surat dinas — URW Bookman (substitusi terbuka untuk Bookman Old Style). */
export async function createSuratDinasFonts(pdf: PDFDocument): Promise<SuratDinasPdfFonts> {
  registerPdfFontkit(pdf);
  try {
    const regular = await pdf.embedFont(toBytes(bookmanRegular));
    const bold = await pdf.embedFont(toBytes(bookmanBold));
    const italic = await pdf.embedFont(toBytes(bookmanItalic));
    return { regular, bold, italic };
  } catch {
    return {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    };
  }
}
