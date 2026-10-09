import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../../lib/types";
import {
  kartuDaerahAsal,
  kartuKecamatanTanggal,
  kartuNikAnggota,
  kartuTempekBanjar,
} from "../../lib/kartu-krama-utils";
import { formatBerlakuSdKrama, hasMasaBerlakuTahun } from "../../lib/masa-berlaku";
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

export function KartuTamiuCard({
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
    <article
      className="kartu-sheet kartu-sheet--tamiu"
      aria-label={`Kartu Tamiu ${anggota.nama_lengkap}`}
    >
      <header className="kartu-header">
        <LogoSlot src={desa?.logo_url} alt="Logo Desa Adat" />
        <div className="kartu-header-center">
          <div className="line1">KARTU TAMIU</div>
          <div className="line2">DESA ADAT {desaNama}</div>
          {lokasiHeader ? <div className="line3">{lokasiHeader}</div> : null}
        </div>
        <LogoSlot src={desa?.logo_mda_url} alt="Logo MDA" />
      </header>

      <div className="kartu-body">
        <div className="kartu-fields">
          <KartuField label="NRT" value={anggota.nrt} />
          <KartuField label="Nama" value={anggota.nama_lengkap} compact />
          <KartuField label="Klasifikasi" value={klasifikasi} compact />
          <KartuField label="NIK/NIKA" value={kartuNikAnggota(anggota)} />
          <KartuField label="Jenis Kel." value={formatJenisKelamin(anggota.jenis_kelamin)} />
          <KartuField label="Agama" value={anggota.agama} />
          <KartuField label="TTL" value={ttl} wrap multiline />
          <KartuField label="Pekerjaan" value={anggota.pekerjaan} compact />
          <KartuField label="Daerah Asal" value={kartuDaerahAsal(krama)} wrap multiline />
          <KartuField label="Alamat Tinggal" value={krama.alamat} wrap multiline />
          <KartuField label="Tempek/Banjar" value={kartuTempekBanjar(krama)} compact />
          {hasMasaBerlakuTahun(krama.masa_berlaku_tahun) && (
            <KartuField label="Berlaku S/D" value={formatBerlakuSdKrama(krama, anggota)} />
          )}
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
