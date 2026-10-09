import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument } from "pdf-lib";
import { StandardFonts } from "pdf-lib";
import type { PdfFonts } from "./pdf-common";

import barlowRegularWoff2 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-400-normal.woff2?arraybuffer";
import barlowBoldWoff2 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2?arraybuffer";
import barlowRegularWoff from "@fontsource/barlow-condensed/files/barlow-condensed-latin-400-normal.woff?arraybuffer";
import barlowBoldWoff from "@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff?arraybuffer";
import barlowLightWoff2 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-300-normal.woff2?arraybuffer";
import barlowLightWoff from "@fontsource/barlow-condensed/files/barlow-condensed-latin-300-normal.woff?arraybuffer";
import barlowMediumWoff2 from "@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff2?arraybuffer";
import barlowMediumWoff from "@fontsource/barlow-condensed/files/barlow-condensed-latin-500-normal.woff?arraybuffer";

function toBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/** Daftarkan fontkit sekali sebelum embed font kustom (Barlow Condensed). */
export function registerPdfFontkit(pdf: PDFDocument): void {
  pdf.registerFontkit(fontkit);
}

type BarlowTableVariant = "default" | "light";

const BARLOW_VARIANT_SOURCES: Record<
  BarlowTableVariant,
  { regular: ArrayBuffer[]; bold: ArrayBuffer[] }
> = {
  default: {
    regular: [barlowRegularWoff2, barlowRegularWoff],
    bold: [barlowBoldWoff2, barlowBoldWoff],
  },
  light: {
    regular: [barlowLightWoff2, barlowLightWoff],
    bold: [barlowMediumWoff2, barlowMediumWoff],
  },
};

async function embedBarlowPair(
  pdf: PDFDocument,
  variant: BarlowTableVariant = "default"
): Promise<PdfFonts> {
  const { regular: regularSources, bold: boldSources } = BARLOW_VARIANT_SOURCES[variant];

  let regularError: unknown;
  for (const src of regularSources) {
    try {
      const regular = await pdf.embedFont(toBytes(src));
      let boldError: unknown;
      for (const boldSrc of boldSources) {
        try {
          const bold = await pdf.embedFont(toBytes(boldSrc));
          return { regular, bold };
        } catch (e) {
          boldError = e;
        }
      }
      throw boldError;
    } catch (e) {
      regularError = e;
    }
  }
  throw regularError;
}

export type TableFontOptions = {
  /** `light` = Barlow Condensed 300 (untuk tabel Pipil dan cetak padat). */
  variant?: BarlowTableVariant;
};

/** Font isi tabel PDF — Barlow Condensed (ramping, cocok untuk laporan tabular). */
export async function createTableFonts(
  pdf: PDFDocument,
  options?: TableFontOptions
): Promise<PdfFonts> {
  registerPdfFontkit(pdf);

  try {
    return await embedBarlowPair(pdf, options?.variant ?? "default");
  } catch {
    return {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    };
  }
}
