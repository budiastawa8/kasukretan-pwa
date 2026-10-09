/** Gaya daftar padat & rapi — standar seluruh aplikasi (referensi: Riwayat Paturunan). */

export const LIST_PAGE = "space-y-2 leading-snug text-sm max-w-6xl";

/** Class tambahan pada `<Card compact>` — filter & kontrol padat. */
export const LIST_CARD =
  "[&_label]:!mb-0 [&_label]:!text-[11px] [&_input]:!h-8 [&_input]:!min-h-8 [&_input]:!text-xs [&_input]:!py-1 [&_select]:!h-8 [&_select]:!min-h-8 [&_select]:!text-xs [&_select]:!py-1";

/** Filter sentuh-friendly untuk HP (`useIsPhoneClient`). */
export const LIST_CARD_PHONE =
  "[&_label]:!mb-1 [&_label]:!text-xs [&_input]:!h-11 [&_input]:!min-h-11 [&_input]:!text-base [&_input]:!py-2 [&_select]:!h-11 [&_select]:!min-h-11 [&_select]:!text-base [&_select]:!py-2";

/** Alias — padding diatur lewat prop `compact` pada Card. */
export const LIST_CARD_BODY = LIST_CARD;

export const LIST_CARD_TITLED = LIST_CARD;

/** Marker tabel daftar — sel & tombol aksi diatur class `list-table` + utilitas di bawah. */
export const LIST_TABLE = "leading-tight";

/**
 * Class tabel daftar padat.
 * `list-table` (globals.css) + utilitas `!` menang atas min-h-10 tombol/IconLink di sel.
 */
export const LIST_TABLE_ELEMENT = [
  "list-table w-full border-collapse text-xs",
  LIST_TABLE,
  "[&_th]:!py-0 [&_td]:!py-0",
  "[&_th]:!text-[11px] [&_th]:font-medium [&_th]:text-muted",
  "[&_td]:align-middle",
  "[&_td_button]:!min-h-7 [&_td_button]:!min-w-7 [&_td_button]:!h-7 [&_td_button]:!p-0.5",
  "[&_td_a]:!min-h-7 [&_td_a]:!min-w-7 [&_td_a]:!h-7 [&_td_a]:!p-0.5",
  "[&_td_button_svg]:!size-3.5 [&_td_a_svg]:!size-3.5",
].join(" ");

export const LIST_HEAD_ROW = "border-b border-copper-200 text-left";

export const LIST_BODY_ROW = "border-b border-copper-100";

export const LIST_FILTER_ROW =
  "flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-2 sm:gap-1.5 mb-2";

export const LIST_FILTER_GRID =
  "grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 flex-1 min-w-0";
