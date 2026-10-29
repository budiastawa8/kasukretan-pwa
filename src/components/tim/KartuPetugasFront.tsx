import { formatNomorPengenalDisplay } from "../../lib/penomoran-petugas";
import type { DesaAdat, TimKasukretan } from "../../lib/types";
import "../../styles/kartu-petugas-print.css";

function LogoSlot({ src, alt }: { src?: string | null; alt: string }) {
  if (src?.trim()) {
    return <img className="kartu-petugas-logo" src={src} alt={alt} />;
  }
  return <div className="kartu-petugas-logo-placeholder" aria-hidden />;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="kartu-petugas-field">
      <span className="kartu-petugas-field-label">{label}</span>
      <span className="kartu-petugas-field-value">{value || "—"}</span>
    </div>
  );
}

export function KartuPetugasFront({
  tim,
  desa,
}: {
  tim: TimKasukretan;
  desa: DesaAdat | null;
}) {
  const desaNama = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const nomor = formatNomorPengenalDisplay(tim.nomor_pengenal);
  const foto = tim.foto_url?.trim();

  return (
    <article className="kartu-petugas-sheet" aria-label={`Kartu Petugas ${tim.nama}`}>
      <div className="kartu-petugas-logo-slot">
        <LogoSlot src={desa?.logo_url} alt="Logo Desa Adat" />
      </div>
      <p className="kartu-petugas-desa-overlay">{desaNama}</p>
      <div className="kartu-petugas-inner">
        <div className="kartu-petugas-mid">
          <div className="kartu-petugas-photo">
            {foto ? (
              <img src={foto} alt={tim.nama} />
            ) : (
              <span className="kartu-petugas-photo-ph">Foto</span>
            )}
          </div>
          <div className="kartu-petugas-identity">
            <div className="kartu-petugas-nama">{tim.nama}</div>
            <div className="kartu-petugas-jabatan">{tim.jabatan || "Anggota Tim Kasukretan"}</div>
          </div>
          <div className="kartu-petugas-fields">
            <Field label="No. Anggota" value={nomor} />
            <Field label="Banjar" value={tim.banjar_nama} />
            <Field label="Desa Adat" value={desaNama} />
          </div>
        </div>
      </div>
    </article>
  );
}
