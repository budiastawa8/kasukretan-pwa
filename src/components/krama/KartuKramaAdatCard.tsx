import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../../lib/types";
import { kartuKecamatanTanggal } from "../../lib/kartu-krama-utils";
import { showBerlakuSdPipilCetak } from "../../lib/ilikita-kebijakan";
import { formatBerlakuSdKrama } from "../../lib/masa-berlaku";
import { formatJenisKelamin, formatTempatTanggalLahir } from "../../lib/utils";
import { KartuField } from "./KartuField";
import { KartuKramaFoto } from "./KartuKramaFoto";
import "../../styles/kartu-krama-print.css";

function LogoSlot({ src, alt }: { src?: string | null; alt: string }) {
  if (src?.trim()) {
    return <img className="kartu-header-logo" src={src} alt={alt} />;
  }
  return <div className="kartu-header-logo-placeholder" aria-hidden />;
}

export function KartuKramaAdatCard({
  krama,
  desa,
  anggota,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
  anggota: AnggotaKeluarga;
}) {
  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase() ?? "DESA ADAT";
  const kec = desa?.nama_kecamatan?.trim();
  const kab = desa?.nama_kabupaten?.trim();
  const lokasiHeader =
    kec && kab
      ? `Kecamatan ${kec} Kabupaten ${kab}`
      : kec
        ? `Kecamatan ${kec}`
        : kab
          ? `Kabupaten ${kab}`
          : "";

  const klasifikasi = krama.jenis_nama?.trim() || krama.klasifikasi_nama;
  const ttl = formatTempatTanggalLahir(anggota.tempat_lahir, anggota.tanggal_lahir);

  return (
    <article className="kartu-sheet" aria-label={`Kartu Krama Adat ${anggota.nama_lengkap}`}>
      <header className="kartu-header">
        <LogoSlot src={desa?.logo_url} alt="Logo Desa Adat" />
        <div className="kartu-header-center">
          <div className="line1">KARTU KRAMA ADAT</div>
          <div className="line2">DESA ADAT {desaNama}</div>
          {lokasiHeader ? <div className="line3">{lokasiHeader}</div> : null}
        </div>
        <LogoSlot src={desa?.logo_mda_url} alt="Logo MDA" />
      </header>

      <div className="kartu-body">
        <div className="kartu-fields">
          <KartuField label="NIKA" value={anggota.nika} />
          <KartuField label="Nama" value={anggota.nama_lengkap} />
          <KartuField label="Klasifikasi" value={klasifikasi} />
          <KartuField label="Jenis Kelamin" value={formatJenisKelamin(anggota.jenis_kelamin)} />
          <KartuField label="TTL" value={ttl} wrap />
          <KartuField label="Pekerjaan" value={anggota.pekerjaan} />
          <div className="kartu-alamat-block">
            <KartuField label="Alamat" value={krama.alamat} wrap />
            <KartuField label="Tempek" value={krama.tempek_nama} wrap indent />
            <KartuField label="Banjar" value={krama.banjar_nama} indent />
            {showBerlakuSdPipilCetak(desa) ? (
              <KartuField label="Berlaku S/D" value={formatBerlakuSdKrama(krama, anggota)} />
            ) : null}
          </div>
        </div>

        <aside className="kartu-side">
          <div
            className={
              anggota.foto_url?.trim() ? "kartu-photo kartu-photo--has-foto" : "kartu-photo"
            }
          >
            <KartuKramaFoto fotoUrl={anggota.foto_url} nama={anggota.nama_lengkap} />
          </div>
          <p className="kartu-side-footer">
            {kartuKecamatanTanggal(kec, krama.tanggal_terdaftar)}
          </p>
        </aside>
      </div>
    </article>
  );
}
