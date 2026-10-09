import { showBerlakuSdPipilCetak } from "../../lib/ilikita-kebijakan";
import { formatBerlakuSdKrama } from "../../lib/masa-berlaku";
import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../../lib/types";
import {
  formatJenisKelamin,
  formatStatusKawin,
  formatTanggalLahir,
  formatTempatTanggalLahir,
} from "../../lib/utils";
import { KartuQrImage } from "./KartuQrImage";
import "../../styles/pipil-print.css";

function PrintField({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim() || "";
  return (
    <div className="pipil-field">
      <span className="pipil-field-label">{label}</span>
      <span className="pipil-field-colon" aria-hidden>
        :
      </span>
      <span className="pipil-field-value">{text || "\u00A0"}</span>
    </div>
  );
}

function LogoSlot({ src, alt }: { src?: string | null; alt: string }) {
  if (src?.trim()) {
    return <img src={src} alt={alt} />;
  }
  return <div className="pipil-header-logo-placeholder bg-white/20 rounded" aria-hidden />;
}

export function PipilPrintSheet({
  krama,
  desa,
  tampilkanTtdBandesa = false,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
  /** Tampilkan gambar tanda tangan Bandesa dari profil desa. */
  tampilkanTtdBandesa?: boolean;
}) {
  const anggota = krama.anggota_aktif;
  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase() ?? "DESA ADAT";
  const kecKab = [desa?.nama_kecamatan, desa?.nama_kabupaten].filter(Boolean).join(" Kabupaten ");
  const lokasiHeader = kecKab ? `Kecamatan ${kecKab}` : "";

  const pengarepTtl = formatTempatTanggalLahir(
    krama.kepala.tempat_lahir,
    krama.kepala.tanggal_lahir
  );

  const tanggalPencatatan = formatTanggalLahir(krama.tanggal_terdaftar);
  const tempatTanda = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const jabatanBandesa = desa?.bandesa_jabatan?.trim() || "Bandesa Adat";
  const namaBandesa = desa?.bandesa_nama?.trim() || "";
  const bandesaTtdUrl = desa?.bandesa_ttd_url?.trim() || "";
  const showBandesaTtd = tampilkanTtdBandesa && Boolean(bandesaTtdUrl);

  return (
    <article className="pipil-sheet">
      <header className="pipil-header">
        <LogoSlot src={desa?.logo_mda_url} alt="Logo MDA" />
        <div className="pipil-header-center">
          <div className="line1">MAJELIS DESA ADAT (MDA) BALI</div>
          <div className="line2">DESA ADAT {desaNama}</div>
          {lokasiHeader ? <div className="line3">{lokasiHeader}</div> : null}
        </div>
        <LogoSlot src={desa?.logo_url} alt="Logo Desa Adat" />
      </header>

      <div className="pipil-body">
        <h1 className="pipil-title">PIPIL KULAWARGA KRAMA DESA ADAT</h1>
        <p className="pipil-npk">NPK. {krama.nomor_kartu}</p>

        <div className="pipil-grid-2">
          <div>
            <PrintField label="Nama Pengarep" value={krama.kepala.nama_lengkap} />
            <PrintField
              label="Klasifikasi Krama"
              value={krama.jenis_nama ?? krama.klasifikasi_nama}
            />
            <PrintField
              label="Jenis Kelamin"
              value={formatJenisKelamin(krama.kepala.jenis_kelamin)}
            />
            <PrintField label="Tempat & Tgl. Lahir" value={pengarepTtl} />
          </div>
          <div>
            <PrintField label="Banjar Adat" value={krama.banjar_nama} />
            <PrintField label="Tempekan" value={krama.tempek_nama} />
            <PrintField label="Arahan" value={krama.arahan_nama} />
            <PrintField label="Keterangan" value={krama.keterangan} />
          </div>
        </div>

        <table className="pipil-table">
          <colgroup>
            <col className="col-no" />
            <col className="col-nama" />
            <col className="col-lp" />
            <col className="col-nika" />
            <col className="col-ttl" />
            <col className="col-kawin" />
            <col className="col-kerja" />
            <col className="col-status" />
            <col className="col-ibu" />
            <col className="col-ayah" />
          </colgroup>
          <thead>
            <tr>
              <th className="num">No</th>
              <th className="nama">Nama</th>
              <th className="lp">L/P</th>
              <th className="nika">NIKA</th>
              <th className="ttl">Tempat & Tgl. Lahir</th>
              <th className="kawin">Status Kawin</th>
              <th className="kerja">Pekerjaan</th>
              <th className="status-keluarga">Status Keluarga</th>
              <th className="ibu">Nama Ibu</th>
              <th className="ayah">Nama Bapak</th>
            </tr>
          </thead>
          <tbody>
            {anggota.map((a, i) => (
              <PipilTableRow key={a.anggota_id} no={i + 1} anggota={a} />
            ))}
          </tbody>
        </table>

        <div className="pipil-below-table ilikita-footer-below-table">
          <div className="pipil-below-col">
            {showBerlakuSdPipilCetak(desa) ? (
              <PrintField label="Masa berlaku" value={formatBerlakuSdKrama(krama)} />
            ) : null}
            <KartuQrImage nomorKartu={krama.nomor_kartu} className="ilikita-qr" />
          </div>
          <div className="pipil-below-col pipil-below-col--center">
            <p className="pipil-below-line pipil-below-line--align" aria-hidden="true">
              &nbsp;
            </p>
            <p className="pipil-below-role">Pengarep</p>
            <div className="pipil-below-sign-space" aria-hidden="true" />
            <p className="pipil-below-name">{krama.kepala.nama_lengkap}</p>
          </div>
          <div className="pipil-below-col pipil-below-col--right">
            <p className="pipil-below-line">
              {tempatTanda}
              {tanggalPencatatan && tanggalPencatatan !== "—"
                ? `, ${tanggalPencatatan}`
                : ""}
            </p>
            <p className="pipil-below-role">{jabatanBandesa}</p>
            <div className="pipil-below-sign-space">
              {showBandesaTtd ? (
                <img
                  className="pipil-below-sign-img"
                  src={bandesaTtdUrl}
                  alt="Tanda tangan Bandesa"
                />
              ) : null}
            </div>
            <p className="pipil-below-name">{namaBandesa || "\u00A0"}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function PipilTableRow({ no, anggota: a }: { no: number; anggota: AnggotaKeluarga }) {
  return (
    <tr>
      <td className="num">{no}</td>
      <td className="nama">{a.nama_lengkap}</td>
      <td className="lp">{a.jenis_kelamin}</td>
      <td className="nika">{a.nika ?? ""}</td>
      <td>{formatTempatTanggalLahir(a.tempat_lahir, a.tanggal_lahir)}</td>
      <td>{formatStatusKawin(a.status_kawin)}</td>
      <td>{a.pekerjaan ?? ""}</td>
      <td className="status-keluarga">{a.status_keluarga}</td>
      <td>{a.nama_ibu ?? ""}</td>
      <td>{a.nama_ayah ?? ""}</td>
    </tr>
  );
}
