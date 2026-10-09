import { formatBerlakuSdKrama, hasMasaBerlakuTahun } from "../../lib/masa-berlaku";
import type { PemasihPrintMeta } from "../../lib/pemasih-print";
import { formatStatusKeluargaAnggota } from "../../lib/status-keluarga";
import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../../lib/types";
import {
  formatStatusKawin,
  formatTanggalLahir,
  formatTempatTanggalLahir,
} from "../../lib/utils";
import { KartuQrImage } from "./KartuQrImage";
import "../../styles/krama-tamiu-print.css";

function PrintField({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  const text = value?.trim() || "";
  const lab = label.replace(/\s*:\s*$/, "").trim();
  return (
    <div className={className ? `kt-field ${className}` : "kt-field"}>
      <span className="kt-field-label">{lab}</span>
      <span className="kt-field-colon" aria-hidden>
        :
      </span>
      <span className="kt-field-value">{text || "\u00A0"}</span>
    </div>
  );
}

function LogoSlot({ src, alt }: { src?: string | null; alt: string }) {
  if (src?.trim()) {
    return <img src={src} alt={alt} />;
  }
  return <div className="kt-header-logo-placeholder" aria-hidden />;
}

function SheetHeader({ desa }: { desa: DesaAdat | null }) {
  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase() ?? "DESA ADAT";
  const kecKab = [desa?.nama_kecamatan, desa?.nama_kabupaten].filter(Boolean).join(" Kabupaten ");
  const lokasiHeader = kecKab ? `Kecamatan ${kecKab}` : "";

  return (
    <>
      <header className="kt-header">
        <LogoSlot src={desa?.logo_mda_url} alt="Logo MDA" />
        <div className="kt-header-center">
          <div className="line1">MAJELIS DESA ADAT (MDA) BALI</div>
          <div className="line2">DESA ADAT {desaNama}</div>
          {lokasiHeader ? <div className="line3">{lokasiHeader}</div> : null}
        </div>
        <LogoSlot src={desa?.logo_url} alt="Logo Desa Adat" />
      </header>
      <hr className="kt-kop-rule" aria-hidden="true" />
    </>
  );
}

export function KramaTamiuPrintSheet({
  krama,
  desa,
  meta,
  tampilkanTtdBandesa = false,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
  meta: PemasihPrintMeta;
  /** Tampilkan gambar tanda tangan Bandesa dari profil desa. */
  tampilkanTtdBandesa?: boolean;
}) {
  if (meta.layout === "classic") {
    return (
      <KramaTamiuClassicSheet
        krama={krama}
        desa={desa}
        meta={meta}
        tampilkanTtdBandesa={tampilkanTtdBandesa}
      />
    );
  }
  return (
    <TamiuOfficialSheet
      krama={krama}
      desa={desa}
      meta={meta}
      tampilkanTtdBandesa={tampilkanTtdBandesa}
    />
  );
}

/** Pemasih Krama Tamiu — layout sebelum perubahan formulir Tamiu */
function KramaTamiuClassicSheet({
  krama,
  desa,
  meta,
  tampilkanTtdBandesa = false,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
  meta: Extract<PemasihPrintMeta, { layout: "classic" }>;
  tampilkanTtdBandesa?: boolean;
}) {
  const anggota = krama.anggota_aktif;

  const tanggalTerbit = formatTanggalLahir(krama.tanggal_terdaftar);
  const berlakuSampai = formatBerlakuSdKrama(krama);
  const tempatTanda = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const jabatanBandesa = desa?.bandesa_jabatan?.trim() || "Bandesa";
  const namaBandesa = desa?.bandesa_nama?.trim() || "";
  const bandesaTtdUrl = desa?.bandesa_ttd_url?.trim() || "";
  const showBandesaTtd = tampilkanTtdBandesa && Boolean(bandesaTtdUrl);

  return (
    <article className="kt-sheet kt-sheet--classic">
      <SheetHeader desa={desa} />

      <div className="kt-body">
        <h1 className="kt-title">{meta.sheetTitle}</h1>
        <p className="kt-npkt">
          {meta.nomorPrefix} . {krama.nomor_kartu}
        </p>

        <div className="kt-grid-2">
          <PrintField
            label="Nama Pengajeg"
            value={krama.kepala.nama_lengkap}
            className="kt-field--nama-pengajeg"
          />
          <div className="kt-grid-col">
            <PrintField label="Alamat" value={krama.alamat} />
            <PrintField label="RT/BTN" value={krama.rt_btn} />
            <PrintField label="Tempek" value={krama.tempek_nama} />
            <PrintField label="Banjar Adat" value={krama.banjar_nama} />
          </div>
          <div className="kt-grid-col">
            <PrintField
              label="Klasifikasi"
              value={krama.jenis_nama ?? krama.klasifikasi_nama}
            />
            <PrintField label="Desa Adat Asal" value={krama.asal_desa_adat} />
            <PrintField label="Kecamatan Asal" value={krama.asal_kecamatan} />
            <PrintField label="Kabupaten Asal" value={krama.asal_kabupaten} />
          </div>
        </div>

        <table className="kt-table">
          <colgroup>
            <col className="col-no" />
            <col className="col-nama" />
            <col className="col-lp" />
            <col className="col-nika" />
            <col className="col-ttl" />
            <col className="col-kawin" />
            <col className="col-kerja" />
            <col className="col-status" />
          </colgroup>
          <thead>
            <tr>
              <th className="num">No</th>
              <th className="nama">Nama</th>
              <th className="lp">L/P</th>
              <th>NIKA</th>
              <th>Tempat &amp; Tgl.Lahir</th>
              <th>Status Perkawinan</th>
              <th>Pekerjaan</th>
              <th>Status Keluarga</th>
            </tr>
          </thead>
          <tbody>
            {anggota.map((a, i) => (
              <tr key={a.anggota_id}>
                <td className="num">{i + 1}</td>
                <td className="nama">{a.nama_lengkap}</td>
                <td className="lp">{a.jenis_kelamin}</td>
                <td>{a.nik_atau_nika?.trim() || a.nika?.trim() || ""}</td>
                <td>{formatTempatTanggalLahir(a.tempat_lahir, a.tanggal_lahir)}</td>
                <td>{formatStatusKawin(a.status_kawin)}</td>
                <td>{a.pekerjaan ?? ""}</td>
                <td>{a.status_keluarga}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="kt-below-table ilikita-footer-below-table">
          <div className="kt-below-col">
            {hasMasaBerlakuTahun(krama.masa_berlaku_tahun) && (
              <PrintField label="Berlaku Sampai" value={berlakuSampai} />
            )}
            <KartuQrImage nomorKartu={krama.nomor_kartu} className="ilikita-qr" />
          </div>
          <div className="kt-below-col kt-below-col--center">
            <p className="kt-below-line kt-below-line--align" aria-hidden="true">
              &nbsp;
            </p>
            <p className="kt-below-role">Pengajeg</p>
            <div className="kt-below-sign-space" aria-hidden="true" />
            <p className="kt-below-name">{krama.kepala.nama_lengkap}</p>
          </div>
          <div className="kt-below-col kt-below-col--right">
            <p className="kt-below-line">
              {tempatTanda}
              {tanggalTerbit && tanggalTerbit !== "—" ? `, ${tanggalTerbit}` : ""}
            </p>
            <p className="kt-below-role">{jabatanBandesa}</p>
            <div className="kt-below-sign-space">
              {showBandesaTtd ? (
                <img
                  className="kt-below-sign-img"
                  src={bandesaTtdUrl}
                  alt="Tanda tangan Bandesa"
                />
              ) : null}
            </div>
            <p className="kt-below-name">{namaBandesa || "\u00A0"}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Pemasih Tamiu — formulir ILIKITA (gambar referensi) */
function TamiuOfficialSheet({
  krama,
  desa,
  meta,
  tampilkanTtdBandesa = false,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
  meta: Extract<PemasihPrintMeta, { layout: "tamiu-official" }>;
  tampilkanTtdBandesa?: boolean;
}) {
  const anggota = krama.anggota_aktif;

  const tanggalTerbit = formatTanggalLahir(krama.tanggal_terdaftar);
  const berlakuSampai = formatBerlakuSdKrama(krama);
  const tempatTanda = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const jabatanBandesa = desa?.bandesa_jabatan?.trim() || "Bandesa";
  const namaBandesa = desa?.bandesa_nama?.trim() || "";
  const bandesaTtdUrl = desa?.bandesa_ttd_url?.trim() || "";
  const showBandesaTtd = tampilkanTtdBandesa && Boolean(bandesaTtdUrl);

  const tanggalTanda =
    tanggalTerbit && tanggalTerbit !== "—" ? tanggalTerbit : "";
  const tempatTanggalTanda = tanggalTanda
    ? `${tempatTanda}, ${tanggalTanda}`
    : `${tempatTanda},`;

  return (
    <article className="kt-sheet kt-sheet--tamiu-official">
      <SheetHeader desa={desa} />

      <div className="kt-body">
        <h1 className="kt-title">{meta.sheetTitle}</h1>
        <p className="kt-nomor">
          <span className="kt-nomor-prefix">{meta.nomorPrefix}</span>
          <span className="kt-nomor-sep"> : </span>
          <span className="kt-nomor-value">{krama.nomor_kartu}</span>
        </p>

        <div className="kt-grid-2">
          <PrintField
            label="Nama Pengajeg"
            value={krama.kepala.nama_lengkap}
            className="kt-field--nama-pengajeg"
          />
          <div className="kt-grid-col">
            <PrintField label="Alamat" value={krama.alamat} />
            <PrintField label="RT/BTN" value={krama.rt_btn} />
            <PrintField label={meta.labelTempek} value={krama.tempek_nama} />
            <PrintField label="Banjar Adat" value={krama.banjar_nama} />
            {meta.showAgamaPengajeg && (
              <PrintField label="Agama" value={krama.kepala.agama} />
            )}
          </div>
          <div className="kt-grid-col">
            <PrintField
              label="Klasifikasi"
              value={krama.jenis_nama ?? krama.klasifikasi_nama}
            />
            <PrintField label={meta.labelAsalDesa} value={krama.asal_desa_adat} />
            <PrintField label="Kecamatan Asal" value={krama.asal_kecamatan} />
            <PrintField label="Kabupaten Asal" value={krama.asal_kabupaten} />
            {meta.showProvinsiAsal && (
              <PrintField label="Provinsi Asal" value={krama.asal_provinsi} />
            )}
          </div>
        </div>

        <table className="kt-table">
          <colgroup>
            <col className="col-no" />
            <col className="col-nama" />
            <col className="col-lp" />
            <col className="col-nik" />
            <col className="col-ttl" />
            <col className="col-kawin" />
            <col className="col-kerja" />
            <col className="col-status" />
          </colgroup>
          <thead>
            <tr>
              <th className="num">No</th>
              <th className="nama">Nama</th>
              <th className="lp">L/P</th>
              <th>{meta.nikColumnHeader}</th>
              <th>Tempat &amp; Tgl.Lahir</th>
              <th>Status Perkawinan</th>
              <th>Pekerjaan</th>
              <th>Status Keluarga</th>
            </tr>
          </thead>
          <tbody>
            {anggota.map((a, i) => (
              <TamiuTableRow
                key={a.anggota_id}
                no={i + 1}
                anggota={a}
                klasifikasi={krama.klasifikasi_kode}
              />
            ))}
          </tbody>
        </table>

        <div className="kt-below-table ilikita-footer-below-table">
          <div className="kt-below-col">
            {hasMasaBerlakuTahun(krama.masa_berlaku_tahun) && (
              <PrintField label="Berlaku Sampai" value={berlakuSampai} />
            )}
            <KartuQrImage nomorKartu={krama.nomor_kartu} className="ilikita-qr" />
          </div>
          <div className="kt-below-col kt-below-col--center">
            <p className="kt-below-place-date kt-below-place-date--align" aria-hidden="true">
              {tempatTanggalTanda}
            </p>
            <p className="kt-below-role">Pengajeg</p>
            <div className="kt-below-sign-space" aria-hidden="true" />
            <p className="kt-below-name">{krama.kepala.nama_lengkap || "\u00A0"}</p>
          </div>
          <div className="kt-below-col kt-below-col--right">
            <p className="kt-below-place-date">{tempatTanggalTanda}</p>
            <p className="kt-below-role">{jabatanBandesa}</p>
            <div className="kt-below-sign-space">
              {showBandesaTtd ? (
                <img
                  className="kt-below-sign-img"
                  src={bandesaTtdUrl}
                  alt="Tanda tangan Bandesa"
                />
              ) : null}
            </div>
            <p className="kt-below-name">{namaBandesa || "\u00A0"}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function TamiuTableRow({
  no,
  anggota: a,
  klasifikasi,
}: {
  no: number;
  anggota: AnggotaKeluarga;
  klasifikasi: KramaDetail["klasifikasi_kode"];
}) {
  const nik = a.nik_atau_nika?.trim() || a.nika?.trim() || "";
  return (
    <tr>
      <td className="num">{no}</td>
      <td className="nama">{a.nama_lengkap}</td>
      <td className="lp">{a.jenis_kelamin}</td>
      <td>{nik}</td>
      <td>{formatTempatTanggalLahir(a.tempat_lahir, a.tanggal_lahir)}</td>
      <td>{formatStatusKawin(a.status_kawin)}</td>
      <td>{a.pekerjaan ?? ""}</td>
      <td>{formatStatusKeluargaAnggota(a.status_keluarga, klasifikasi)}</td>
    </tr>
  );
}
