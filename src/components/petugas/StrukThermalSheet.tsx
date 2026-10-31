import { formatBulanIndonesia, formatRupiah } from "../../lib/dudukan-hitung";
import type { StrukDanaLainPdfPayload } from "../../lib/struk-pembayaran-dana-lain-pdf";
import type { StrukDudukanPdfPayload } from "../../lib/struk-pembayaran-dudukan-pdf";
import type { StrukPaturunanPdfPayload } from "../../lib/struk-pembayaran-paturunan-pdf";
import type { StrukThermalWidthMm } from "../../lib/struk-pembayaran-dudukan-pdf";
import { labelJenisPenerimaanDanaLain } from "../../lib/services/penerimaan-dana-lain";
import {
  STRUK_FOOTER_DANA_LAIN,
  STRUK_FOOTER_DUDUKAN,
  STRUK_FOOTER_PATURUNAN,
} from "../../lib/struk-thermal-content";
import { formatTanggalLahir } from "../../lib/utils";
import "../../styles/struk-thermal-print.css";

export const STRUK_THERMAL_WIDTH_DEFAULT: StrukThermalWidthMm = 58;

function StrukField({ label, value }: { label: string; value: string }) {
  return (
    <div className="struk-field">
      <span className="struk-field__label">{label}</span>
      <span className="struk-field__sep">:</span>
      <span className="struk-field__value">{value || "—"}</span>
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

export function StrukThermalSheetDudukan({
  desaNama,
  payload,
  widthMm,
}: {
  desaNama: string;
  payload: StrukDudukanPdfPayload;
  widthMm: StrukThermalWidthMm;
}) {
  const k = payload.krama;
  const rows = payload.items.map((item) => ({
    left: formatBulanIndonesia(item.bulan, item.tahun),
    right: formatRupiah(item.jumlah),
  }));

  return (
    <article
      className={`struk-sheet struk-sheet--${widthMm}`}
      data-width-mm={widthMm}
      aria-label="Struk pembayaran dudukan"
    >
      <header className="struk-header">
        <p className="struk-header__org">Tim Kasukretan Krama</p>
        <p className="struk-header__desa">Desa Adat {desaNama}</p>
        <p className="struk-header__title">BUKTI PEMBAYARAN DUDUKAN</p>
      </header>
      <hr className="struk-rule" />
      <section className="struk-body">
        <StrukField label="Nama" value={k.pengajeg_nama} />
        <StrukField label="No Pemasih" value={k.nomor_pemasih} />
        <StrukField label="Jenis" value={k.jenis_krama} />
        <StrukField label="Alamat" value={k.alamat_pemasih} />
      </section>
      <StrukTable
        leftHeader="Periode"
        rows={rows}
        totalLabel="TOTAL"
        totalValue={formatRupiah(payload.total)}
      />
      <footer className="struk-footer">
        <StrukField label="Tanggal" value={formatTanggalLahir(payload.tanggal)} />
        <StrukField label="Petugas" value={payload.petugasNama} />
        <p className="struk-footer__closing">{STRUK_FOOTER_DUDUKAN}</p>
        <div className="struk-print-tail" aria-hidden="true" />
      </footer>
    </article>
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
  const k = payload.krama;
  const lokasi = [k.banjar_nama, k.tempek_nama?.trim(), k.arahan_nama?.trim()]
    .filter(Boolean)
    .join(" · ");

  const rows: { left: string; right: string }[] = [];
  if (payload.wajib > 0) rows.push({ left: "Paturunan wajib", right: formatRupiah(payload.wajib) });
  if (payload.punia > 0) rows.push({ left: "Punia (sukarela)", right: formatRupiah(payload.punia) });
  if (!rows.length) rows.push({ left: "Pembayaran", right: formatRupiah(payload.total) });

  return (
    <article
      className={`struk-sheet struk-sheet--${widthMm}`}
      data-width-mm={widthMm}
      aria-label="Struk pembayaran paturunan"
    >
      <header className="struk-header">
        <p className="struk-header__org">Tim Kasukretan Krama</p>
        <p className="struk-header__desa">Desa Adat {desaNama}</p>
        <p className="struk-header__title">BUKTI PEMBAYARAN PATURUNAN</p>
      </header>
      <hr className="struk-rule" />
      <section className="struk-body">
        <StrukField label="Nama" value={k.kepala_nama} />
        <StrukField label="No Pemasih" value={k.nomor_kartu} />
        <StrukField label="Jenis" value={k.jenis_nama?.trim() || "—"} />
        <StrukField label="Alamat" value={lokasi || "—"} />
        <StrukField label="Iuran" value={payload.iuranNama} />
      </section>
      <StrukTable
        leftHeader="Rincian"
        rows={rows}
        totalLabel="TOTAL"
        totalValue={formatRupiah(payload.total)}
      />
      <footer className="struk-footer">
        <StrukField label="Tanggal" value={formatTanggalLahir(payload.tanggal)} />
        <StrukField label="Petugas" value={payload.petugasNama} />
        <p className="struk-footer__closing">{STRUK_FOOTER_PATURUNAN}</p>
        <div className="struk-print-tail" aria-hidden="true" />
      </footer>
    </article>
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
  const title = `BUKTI ${labelJenisPenerimaanDanaLain(payload.jenis).toUpperCase()}`;
  return (
    <article
      className={`struk-sheet struk-sheet--${widthMm}`}
      data-width-mm={widthMm}
      aria-label={title}
    >
      <header className="struk-header">
        <p className="struk-header__org">Tim Kasukretan Krama</p>
        <p className="struk-header__desa">Desa Adat {desaNama}</p>
        <p className="struk-header__title">{title}</p>
      </header>
      <hr className="struk-rule" />
      <section className="struk-body">
        <StrukField label="Nama" value={payload.sumberNama} />
        <StrukField label="Sumber" value={payload.sumberTipeLabel} />
        {payload.nomorKartu ? <StrukField label="No. Kartu" value={payload.nomorKartu} /> : null}
        {payload.kegiatan?.trim() ? (
          <StrukField label="Kegiatan" value={payload.kegiatan.trim()} />
        ) : null}
        {payload.mitraJenis?.trim() ? (
          <StrukField label="Mitra" value={payload.mitraJenis.trim()} />
        ) : null}
      </section>
      <StrukTable
        leftHeader="Rincian"
        rows={[
          {
            left: labelJenisPenerimaanDanaLain(payload.jenis),
            right: formatRupiah(payload.jumlah),
          },
        ]}
        totalLabel="TOTAL"
        totalValue={formatRupiah(payload.total)}
      />
      <footer className="struk-footer">
        <StrukField label="Tanggal" value={formatTanggalLahir(payload.tanggal)} />
        <StrukField label="Petugas" value={payload.petugasNama} />
        <p className="struk-footer__closing">{STRUK_FOOTER_DANA_LAIN}</p>
        <div className="struk-print-tail" aria-hidden="true" />
      </footer>
    </article>
  );
}
