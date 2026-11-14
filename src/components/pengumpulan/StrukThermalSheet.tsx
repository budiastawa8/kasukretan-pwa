import type { StrukDanaLainPdfPayload } from "../../lib/struk-pembayaran-dana-lain-pdf";
import type { StrukDudukanPdfPayload } from "../../lib/struk-pembayaran-dudukan-pdf";
import type { StrukPaturunanPdfPayload } from "../../lib/struk-pembayaran-paturunan-pdf";
import type { StrukThermalWidthMm } from "../../lib/struk-pembayaran-dudukan-pdf";
import {
  buildStrukThermalContent,
  type StrukThermalContent,
} from "../../lib/struk-thermal-content";
import type { PetugasStrukPreviewState } from "../../lib/petugas-struk-preview";
import "../../styles/struk-thermal-print.css";

export const STRUK_THERMAL_WIDTH_DEFAULT: StrukThermalWidthMm = 58;

function StrukField({ label, value }: { label: string; value: string }) {
  return (
    <div className="struk-field">
      <span className="struk-field__label">{label}</span>
      <span className="struk-field__sep">:</span>
      <span className="struk-field__value">{value.trim() ? value : "-"}</span>
    </div>
  );
}

function StrukTable({
  leftHeader,
  rows,
  totalLabel,
  totalValue,
}: {
  leftHeader: string;
  rows: { left: string; right: string }[];
  totalLabel: string;
  totalValue: string;
}) {
  return (
    <table className="struk-table">
      <thead>
        <tr>
          <th>{leftHeader}</th>
          <th>Jumlah</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td>{row.left}</td>
            <td>{row.right}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>{totalLabel}</td>
          <td>{totalValue}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function StrukThermalSheetFromContent({
  content,
  widthMm,
  ariaLabel,
}: {
  content: StrukThermalContent;
  widthMm: StrukThermalWidthMm;
  ariaLabel: string;
}) {
  return (
    <article
      className={`struk-sheet struk-sheet--${widthMm}`}
      data-width-mm={widthMm}
      aria-label={ariaLabel}
    >
      <header className="struk-header">
        <p className="struk-header__org">Tim Kasukretan Krama</p>
        <p className="struk-header__desa">Desa Adat {content.desaNama}</p>
        <p className="struk-header__title">{content.docTitle}</p>
      </header>
      <hr className="struk-rule" />
      <section className="struk-body">
        {content.fields.map((f) => (
          <StrukField key={f.label} label={f.label} value={f.value} />
        ))}
      </section>
      <StrukTable
        leftHeader={content.tableLeftHeader}
        rows={content.tableRows}
        totalLabel="TOTAL"
        totalValue={content.total}
      />
      <footer className="struk-footer">
        <StrukField label="Tanggal" value={content.tanggal} />
        <StrukField label="Petugas" value={content.petugas} />
        <p className="struk-footer__closing">{content.footer}</p>
        <div className="struk-print-tail" aria-hidden="true" />
      </footer>
    </article>
  );
}

function sheetFromState(
  state: PetugasStrukPreviewState,
  desaNama: string,
  widthMm: StrukThermalWidthMm,
  ariaLabel: string
) {
  const content = buildStrukThermalContent(state, desaNama);
  return <StrukThermalSheetFromContent content={content} widthMm={widthMm} ariaLabel={ariaLabel} />;
}

export function StrukThermalSheetDudukan({
  desaNama,
  payload,
  widthMm,
}: {
  desaNama: string;
  payload: StrukDudukanPdfPayload;
  widthMm: StrukThermalWidthMm;
}) {
  return sheetFromState(
    {
      kind: "dudukan",
      payload,
      backTo: "/pengumpulan",
      backLabel: "Pengumpulan",
    },
    desaNama,
    widthMm,
    "Struk pembayaran dudukan"
  );
}

export function StrukThermalSheetPaturunan({
  desaNama,
  payload,
  widthMm,
}: {
  desaNama: string;
  payload: StrukPaturunanPdfPayload;
  widthMm: StrukThermalWidthMm;
}) {
  return sheetFromState(
    {
      kind: "paturunan",
      payload,
      backTo: "/pengumpulan",
      backLabel: "Pengumpulan",
    },
    desaNama,
    widthMm,
    "Struk pembayaran paturunan"
  );
}

export function StrukThermalSheetDanaLain({
  desaNama,
  payload,
  widthMm,
}: {
  desaNama: string;
  payload: StrukDanaLainPdfPayload;
  widthMm: StrukThermalWidthMm;
}) {
  return sheetFromState(
    {
      kind: "dana_lain",
      payload,
      backTo: "/pengumpulan",
      backLabel: "Pengumpulan",
    },
    desaNama,
    widthMm,
    "Struk pembayaran dana lain"
  );
}
