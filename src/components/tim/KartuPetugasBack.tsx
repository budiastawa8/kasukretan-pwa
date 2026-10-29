import type { DesaAdat, TimKasukretan } from "../../lib/types";
import { KartuPetugasQrImage } from "./KartuPetugasQrImage";
import "../../styles/kartu-petugas-print.css";

function LogoSlot({ src }: { src?: string | null }) {
  if (src?.trim()) {
    return <img className="kartu-petugas-logo" src={src} alt="Logo Desa Adat" />;
  }
  return <div className="kartu-petugas-logo-placeholder" aria-hidden />;
}

/** Belakang: logo di atas judul template + QR (teks scan/motto sudah di gambar). */
export function KartuPetugasBack({
  tim,
  desa,
}: {
  tim: TimKasukretan;
  desa?: DesaAdat | null;
}) {
  const nomor = tim.nomor_pengenal?.trim() || "";

  return (
    <article
      className="kartu-petugas-sheet kartu-petugas-sheet--back"
      aria-label={`Belakang kartu ${tim.nama}`}
    >
      <div className="kartu-petugas-back-logo">
        <LogoSlot src={desa?.logo_url} />
      </div>
      <div className="kartu-petugas-inner">
        <div className="kartu-petugas-back-body">
          <div className="kartu-petugas-qr-frame">
            {nomor ? (
              <KartuPetugasQrImage nomorPengenal={nomor} size={140} />
            ) : (
              <span className="kartu-petugas-photo-ph">QR</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
