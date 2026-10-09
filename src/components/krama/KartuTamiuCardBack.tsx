import {
  KARTU_KRAMA_ADAT_KETENTUAN,
  kartuKramaAdatBandesaJabatan,
  kartuKramaAdatBandesaNama,
  kartuKramaAdatCallCenter,
} from "../../lib/kartu-krama-adat-back";
import type { DesaAdat, KramaDetail } from "../../lib/types";
import { KartuQrImage } from "./KartuQrImage";
import "../../styles/kartu-krama-print.css";

function LogoDesa({ src }: { src?: string | null }) {
  if (src?.trim()) {
    return <img className="kartu-back-logo" src={src} alt="Logo Desa Adat" />;
  }
  return <div className="kartu-back-logo-placeholder" aria-hidden />;
}

export function KartuTamiuCardBack({
  krama,
  desa,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
}) {
  const jabatan = kartuKramaAdatBandesaJabatan(desa);
  const nama = kartuKramaAdatBandesaNama(desa);
  const callCenter = kartuKramaAdatCallCenter(desa);

  return (
    <article
      className="kartu-sheet kartu-sheet--back kartu-sheet--back-tamiu-anggota"
      aria-label="Bagian belakang Kartu Tamiu"
    >
      <div className="kartu-back-top-bar">
        <LogoDesa src={desa?.logo_url} />
      </div>
      <div className="kartu-back-body">
        <div className="kartu-back-left">
          <p className="kartu-back-role">{jabatan}</p>
          <div className="kartu-back-sign-space">
            {desa?.bandesa_ttd_url?.trim() ? (
              <img
                className="kartu-back-sign-img"
                src={desa.bandesa_ttd_url}
                alt="Tanda tangan Bandesa Adat"
              />
            ) : null}
          </div>
          <p className="kartu-back-name">{nama || "\u00A0"}</p>
          <KartuQrImage nomorKartu={krama.nomor_kartu} className="kartu-back-qr" />
          <p className="kartu-back-call">
            Call Center: {callCenter || "\u00A0"}
          </p>
          <p className="kartu-back-support">Support by: Trista Media</p>
        </div>
        <div className="kartu-back-right">
          <h2 className="kartu-back-ketentuan-title">KETENTUAN</h2>
          <ol className="kartu-back-ketentuan-list">
            {KARTU_KRAMA_ADAT_KETENTUAN.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </div>
      <div className="kartu-back-footer-bar" aria-hidden />
    </article>
  );
}
