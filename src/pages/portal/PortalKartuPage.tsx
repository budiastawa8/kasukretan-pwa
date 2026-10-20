import { useEffect, useMemo, useState } from "react";
import { fetchPortalKartu, type PortalKartuData } from "../../lib/api/portal";
import { pemasihPrintMeta } from "../../lib/pemasih-print";
import type { AnggotaKeluarga, DesaAdat, KlasifikasiKode, KramaDetail } from "../../lib/types";
import { KartuKramaAdatCard } from "../../components/krama/KartuKramaAdatCard";
import { KartuKramaTamiuCard } from "../../components/krama/KartuKramaTamiuCard";
import { KartuTamiuCard } from "../../components/krama/KartuTamiuCard";
import { PipilPrintSheet } from "../../components/krama/PipilPrintSheet";
import { KramaTamiuPrintSheet } from "../../components/krama/KramaTamiuPrintSheet";
import "../../styles/kartu-krama-print.css";
import "../../styles/pipil-print.css";
import "../../styles/krama-tamiu-print.css";
import "../../styles/portal-kartu.css";

function toDesa(data: PortalKartuData): DesaAdat | null {
  if (!data.desa) return null;
  return {
    id: "portal",
    kode_kabupaten: "",
    nama_kabupaten: data.desa.nama_kabupaten ?? "",
    kode_kecamatan: "",
    nama_kecamatan: data.desa.nama_kecamatan ?? "",
    kode_desa_adat: "",
    nama_desa_adat: data.desa.nama_desa_adat,
    logo_url: data.desa.logo_url,
    logo_mda_url: data.desa.logo_mda_url,
    bandesa_nama: data.desa.bandesa_nama,
    bandesa_jabatan: data.desa.bandesa_jabatan,
    bandesa_ttd_url: data.desa.bandesa_ttd_url,
    enforce_masa_berlaku_pipil: data.desa.enforce_masa_berlaku_pipil,
  };
}

function toKramaDetail(data: PortalKartuData): KramaDetail {
  const k = data.krama;
  const anggota: AnggotaKeluarga[] = data.anggota.map((a) => ({
    id: a.penduduk_id,
    anggota_id: a.anggota_id,
    penduduk_id: a.penduduk_id,
    status_keluarga: a.status_keluarga,
    nika: a.nika,
    nrkt: a.nrkt,
    nrt: a.nrt,
    tanggal_pencatatan: a.tanggal_pencatatan,
    masuk_pada: a.masuk_pada,
    nama_lengkap: a.nama_lengkap,
    jenis_kelamin: a.jenis_kelamin,
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir,
    status_kawin: a.status_kawin,
    pekerjaan: a.pekerjaan,
    nama_ibu: a.nama_ibu,
    nama_ayah: a.nama_ayah,
    agama: a.agama,
    nik_kependudukan: a.nik_kependudukan,
    nik_atau_nika: a.nik_atau_nika,
    foto_url: a.foto_url,
  }));

  const kepala =
    anggota.find((a) => a.penduduk_id === k.kepala_penduduk_id) ??
    anggota[0] ??
    ({
      id: k.kepala_penduduk_id,
      nama_lengkap: "—",
      jenis_kelamin: "",
    } as AnggotaKeluarga);

  return {
    id: k.id,
    nomor_kartu: k.nomor_kartu,
    jenis_kartu: data.kind === "mipil" ? "NPK" : data.kind === "krama_tamiu" ? "NPKT" : "NPT",
    klasifikasi_kode: k.klasifikasi_kode as KlasifikasiKode,
    klasifikasi_nama: k.klasifikasi_nama,
    gelar_kepala: "",
    banjar_id: "",
    banjar_nama: k.banjar_nama,
    banjar_kode: "",
    tempek_nama: k.tempek_nama,
    arahan_nama: k.arahan_nama,
    alamat: k.alamat,
    keterangan: k.keterangan,
    asal_desa_adat: k.asal_desa_adat,
    asal_kecamatan: k.asal_kecamatan,
    asal_kabupaten: k.asal_kabupaten,
    asal_provinsi: k.asal_provinsi,
    jenis_nama: k.jenis_nama,
    masa_berlaku_tahun: k.masa_berlaku_tahun,
    tanggal_terdaftar: k.tanggal_terdaftar,
    tanggal_berlaku_mulai_pemasih: k.tanggal_berlaku_mulai_pemasih,
    status_krama: "aktif",
    kepala,
    anggota_aktif: anggota,
  };
}

function renderKartuAnggota(
  kind: PortalKartuData["kind"],
  krama: KramaDetail,
  desa: DesaAdat | null,
  anggota: AnggotaKeluarga
) {
  if (kind === "mipil") {
    return <KartuKramaAdatCard krama={krama} desa={desa} anggota={anggota} />;
  }
  if (kind === "krama_tamiu") {
    return <KartuKramaTamiuCard krama={krama} desa={desa} anggota={anggota} />;
  }
  return <KartuTamiuCard krama={krama} desa={desa} anggota={anggota} />;
}

function LembarKeluarga({
  kind,
  krama,
  desa,
}: {
  kind: PortalKartuData["kind"];
  krama: KramaDetail;
  desa: DesaAdat | null;
}) {
  if (kind === "mipil") {
    return <PipilPrintSheet krama={krama} desa={desa} />;
  }
  const meta = pemasihPrintMeta(krama.klasifikasi_kode);
  if (!meta) return null;
  return <KramaTamiuPrintSheet krama={krama} desa={desa} meta={meta} />;
}

export function PortalKartuPage() {
  const [data, setData] = useState<PortalKartuData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortalKartu()
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const desa = useMemo(() => (data ? toDesa(data) : null), [data]);
  const krama = useMemo(() => (data ? toKramaDetail(data) : null), [data]);

  if (loading) return <p className="text-sm text-muted">Memuat…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data || !krama) return null;

  const anggotaList = krama.anggota_aktif;
  const lembarLabel =
    data.kind === "mipil"
      ? "Pipil Kulawarga"
      : data.kind === "krama_tamiu"
        ? "Ilikita Pemasih Krama Tamiu"
        : "Ilikita Pemasih Tamiu";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-copper-900">{data.title}</h1>
        <p className="text-sm text-muted">
          {data.krama.nomor_kartu}
          {data.krama.jenis_nama ? ` · ${data.krama.jenis_nama}` : ""}
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-copper-900">{lembarLabel}</h2>
        <p className="text-[11px] text-muted">Lembar keluarga (mirip Kartu Keluarga).</p>
        <div className="portal-pipil-frame">
          <div className="portal-pipil-scale">
            <LembarKeluarga kind={data.kind} krama={krama} desa={desa} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-copper-900">Kartu anggota</h2>
        <p className="text-[11px] text-muted">Kartu identitas per anggota aktif.</p>
        {anggotaList.length === 0 ? (
          <p className="text-xs text-muted">Belum ada anggota aktif untuk ditampilkan di kartu.</p>
        ) : (
          <div className="space-y-4">
            {anggotaList.map((anggota) => (
              <div key={anggota.anggota_id} className="portal-kartu-frame">
                <div className="portal-kartu-scale">
                  {renderKartuAnggota(data.kind, krama, desa, anggota)}
                </div>
                <p className="text-[11px] text-muted text-center mt-2">
                  {anggota.nama_lengkap}
                  {anggota.status_keluarga ? ` · ${anggota.status_keluarga}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-muted text-center px-2">
        Tampilan digital hanya untuk dilihat — cetak resmi tetap melalui kantor desa adat.
      </p>
    </div>
  );
}
