import { MM } from "./pdf-common";

/** Jarak tabel → blok footer (pt) — sama dengan pratinjau HTML. */
export const ILIKITA_FOOTER_GAP_AFTER_TABLE_PT = 20;

/** Tinggi satu baris field footer kiri (pt). */
export const ILIKITA_FOOTER_LINE_STEP_PT = 4.5 * MM;

/** Blok tanda tangan (pengarep/pengajeg dan bandesa) turun satu baris dari kolom kiri. */
export const ILIKITA_FOOTER_SIGN_DROP_PT = ILIKITA_FOOTER_LINE_STEP_PT;

/** Jarak baris terakhir → atas QR (pt). */
export const ILIKITA_FOOTER_QR_GAP_BEFORE_PT = 2 * MM;

export const ILIKITA_FOOTER_QR_SIZE_PT = 18 * MM + 10;

/** Geser QR footer: kanan +X, atas +Y (pt). */
export const ILIKITA_FOOTER_QR_OFFSET_X_PT = 0;
export const ILIKITA_FOOTER_QR_OFFSET_Y_PT = 5;
