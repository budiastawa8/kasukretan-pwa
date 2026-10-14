import { pdfSafeText } from "./pdf-common";
import type { StrukThermalContent } from "./struk-thermal-content";
import { thermalCharWidth } from "./struk-thermal-content";
import type { StrukThermalWidthMm } from "./struk-pembayaran-dudukan-pdf";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/**
 * Printer thermal murah sering dalam mode huruf Cina: byte di atas 0x7F dibaca berpasangan
 * sebagai satu huruf Cina. Karena itu semua teks dikirim sebagai ASCII murni, satu byte per huruf.
 */
export function escPosAscii(text: string): string {
  return pdfSafeText(text.replace(/[\u00B7\u2022]/g, "-"))
    .replace(/\u00A0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function enc(text: string): Uint8Array {
  const ascii = escPosAscii(text);
  const out = new Uint8Array(ascii.length);
  for (let i = 0; i < ascii.length; i++) out[i] = ascii.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function cmd(...bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

function line(text = ""): Uint8Array {
  return concat(enc(text), cmd(LF));
}

function wrapWords(text: string, maxLen: number): string[] {
  const safe = pdfSafeText(text.trim()) || "-";
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length <= maxLen) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > maxLen ? `${w.slice(0, maxLen - 1)}.` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ["-"];
}

function fieldLines(label: string, value: string, width: number): string[] {
  const prefix = `${label}: `;
  const maxVal = Math.max(8, width - prefix.length);
  const valLines = wrapWords(value, maxVal);
  return valLines.map((v, i) => (i === 0 ? `${prefix}${v}` : v.padStart(width).trimStart() || v));
}

function twoCol(left: string, right: string, width: number): string {
  const r = pdfSafeText(right);
  const maxLeft = Math.max(4, width - r.length - 1);
  let l = pdfSafeText(left);
  if (l.length > maxLeft) l = `${l.slice(0, maxLeft - 1)}.`;
  return `${l.padEnd(maxLeft)} ${r}`;
}

function dashedRule(width: number): string {
  return "-".repeat(width);
}

export function buildEscPosReceipt(
  content: StrukThermalContent,
  widthMm: StrukThermalWidthMm
): Uint8Array {
  const w = thermalCharWidth(widthMm);
  const chunks: Uint8Array[] = [];

  chunks.push(cmd(ESC, 0x40)); // init
  chunks.push(cmd(ESC, 0x61, 1)); // center
  chunks.push(line("Tim Kasukretan Krama"));
  chunks.push(line(`Desa Adat ${content.desaNama}`));
  chunks.push(line(content.docTitle));
  chunks.push(cmd(ESC, 0x61, 0)); // left
  chunks.push(line(dashedRule(w)));

  for (const f of content.fields) {
    for (const ln of fieldLines(f.label, f.value, w)) {
      chunks.push(line(ln));
    }
  }

  chunks.push(line());
  chunks.push(line(twoCol(content.tableLeftHeader, "Jumlah", w)));
  chunks.push(line(dashedRule(w)));

  for (const row of content.tableRows) {
    chunks.push(line(twoCol(row.left, row.right, w)));
  }

  chunks.push(line(dashedRule(w)));
  chunks.push(cmd(ESC, 0x45, 1)); // bold on
  chunks.push(line(twoCol("TOTAL", content.total, w)));
  chunks.push(cmd(ESC, 0x45, 0)); // bold off
  chunks.push(line());

  for (const ln of fieldLines("Tanggal", content.tanggal, w)) {
    chunks.push(line(ln));
  }
  for (const ln of fieldLines("Petugas", content.petugas, w)) {
    chunks.push(line(ln));
  }

  chunks.push(cmd(ESC, 0x61, 1)); // center
  for (const ln of wrapWords(content.footer, w)) {
    chunks.push(line(ln));
  }
  chunks.push(cmd(ESC, 0x61, 0)); // left

  chunks.push(line());
  chunks.push(line());
  chunks.push(cmd(ESC, 0x64, 1)); // feed 1 baris sebelum potong
  chunks.push(cmd(GS, 0x56, 0)); // partial cut

  return concat(...chunks);
}
