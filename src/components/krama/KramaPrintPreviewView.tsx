import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ScrollText, LogOut } from "lucide-react";
import { getDesaAdat } from "../../lib/services/desa";
import { listJenisMipil } from "../../lib/services/master";
import { isPemasihPrintKlasifikasi, pemasihPrintMeta } from "../../lib/pemasih-print";
import { normalizeKramaStatus } from "../../lib/krama-status";
import type { DesaAdat, JenisKramaMipilRow, KramaDetail } from "../../lib/types";
import { Button } from "../ui/Button";
import { SuratKeteranganKramaDialog } from "./SuratKeteranganKramaDialog";
import { SuratKeteranganPindahDialog } from "./SuratKeteranganPindahDialog";
import { PengarepWarningsPanel } from "./PengarepWarningsPanel";
import { PipilPrintSheet } from "./PipilPrintSheet";
import { KartuA4Grid, kartuA4GridHint } from "./KartuA4Grid";
import { KartuKramaAdatPair } from "./KartuKramaAdatPair";
import { KartuKramaTamiuPair } from "./KartuKramaTamiuPair";
import { KartuTamiuPair } from "./KartuTamiuPair";
import { KramaTamiuPrintSheet } from "./KramaTamiuPrintSheet";
import "../../styles/pipil-print.css";
import "../../styles/krama-tamiu-print.css";
import "../../styles/kartu-krama-print.css";

export function KramaPrintPreviewView({ krama }: { krama: KramaDetail }) {
  const isPipil = krama.klasifikasi_kode === "MIPIL";
  const isKramaTamiu = krama.klasifikasi_kode === "KRAMA_TAMIU";
  const isTamiu = krama.klasifikasi_kode === "TAMIU";
  const isPemasihSheet = isPemasihPrintKlasifikasi(krama.klasifikasi_kode);
  const pemasihMeta = pemasihPrintMeta(krama.klasifikasi_kode);
  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [skkOpen, setSkkOpen] = useState(false);
  const [skpOpen, setSkpOpen] = useState(false);
  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(false);
  const [hasTtdImage, setHasTtdImage] = useState(false);

  useEffect(() => {
    void getDesaAdat().then((d) => {
      setDesa(d);
      const has = !!d?.bandesa_ttd_url?.trim()?.startsWith("data:image/");
      setHasTtdImage(has);
      if (!has) setTampilkanTtdBandesa(false);
    });
    if (isPipil) void listJenisMipil().then(setJenisMipil);
  }, [isPipil]);

  const label = isPipil ? "Pipil" : "Pemasih";
  const showIlikitaSheet = isPipil || (isPemasihSheet && !!pemasihMeta);
  const cetakPath = isPipil
    ? `/krama-mipil/${krama.id}/cetak`
    : isPemasihSheet
      ? `/krama-pemasih/${krama.id}/cetak`
      : null;
  const cetakKartuPath = isPipil
    ? `/krama-mipil/${krama.id}/cetak-kartu`
    : isKramaTamiu
      ? `/krama-pemasih/${krama.id}/cetak-kartu`
      : isTamiu
        ? `/krama-pemasih/${krama.id}/cetak-kartu-tamiu`
        : null;
  const showKartu = (isPipil || isKramaTamiu || isTamiu) && krama.anggota_aktif.length > 0;
  const kartuPdfLabel = isPipil
    ? "Kartu Krama Adat"
    : isKramaTamiu
      ? "Kartu Krama Tamiu"
      : "Kartu Tamiu";
  const kramaAktif = normalizeKramaStatus(krama.status_krama) === "aktif";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <h2 className="text-2xl font-bold">Pratinjau {label}</h2>
          <p className="text-muted text-sm">
            {krama.klasifikasi_nama} · {krama.nomor_kartu}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {kramaAktif && (
            <Button type="button" variant="secondary" icon={ScrollText} onClick={() => setSkkOpen(true)}>
              Surat Keterangan
            </Button>
          )}
          {isPipil && kramaAktif && (
            <Button type="button" variant="secondary" icon={LogOut} onClick={() => setSkpOpen(true)}>
              Surat Pindah
            </Button>
          )}
          {cetakPath && (
            <Link
              to={
                tampilkanTtdBandesa && hasTtdImage
                  ? `${cetakPath}?ttd=1`
                  : cetakPath
              }
            >
              <Button type="button" variant="secondary" icon={FileText}>
                Buka PDF {label}
              </Button>
            </Link>
          )}
          {showKartu && cetakKartuPath && (
            <Link to={cetakKartuPath}>
              <Button type="button" variant="secondary" icon={FileText}>
                Buka PDF {kartuPdfLabel}
              </Button>
            </Link>
          )}
        </div>
      </div>
      {showIlikitaSheet && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm text-copper-900 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-copper-300"
              checked={tampilkanTtdBandesa}
              onChange={(e) => setTampilkanTtdBandesa(e.target.checked)}
              disabled={!hasTtdImage}
            />
            Tampilkan tanda tangan Bandesa
          </label>
          {!hasTtdImage && (
            <p className="text-[11px] text-copper-600">
              Unggah gambar TTD Bandesa di Master Data → Profil Desa Adat.
            </p>
          )}
        </div>
      )}
      {isPipil && (
        <>
          <PengarepWarningsPanel krama={krama} desa={desa} jenisMipil={jenisMipil} />
          <div className="pipil-print-stage">
            <div className="pipil-print-wrapper">
              <PipilPrintSheet
                krama={krama}
                desa={desa}
                tampilkanTtdBandesa={tampilkanTtdBandesa}
              />
            </div>
          </div>

          {krama.anggota_aktif.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-copper-900">
                Kartu Krama Adat (8,5 × 5 cm) — {kartuA4GridHint(krama.anggota_aktif.length)}
              </h3>
              <p className="text-xs text-copper-700">
                Depan dan belakang berdampingan · 4 pasang per lembar A4 portrait (8,5 × 5 cm
                per sisi).
              </p>
              <div className="kartu-print-stage">
                <div className="kartu-print-wrapper kartu-print-wrapper--a4-grid">
                  <KartuA4Grid>
                    {krama.anggota_aktif.map((a) => (
                      <div key={a.anggota_id} className="relative group kartu-pair-wrap">
                        <KartuKramaAdatPair krama={krama} desa={desa} anggota={a} />
                        <Link
                          to={`${cetakKartuPath}?anggota=${a.anggota_id}`}
                          className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-xs py-0.5 px-2 shadow-sm bg-white"
                          >
                            PDF
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </KartuA4Grid>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {isPemasihSheet && pemasihMeta && (
        <>
          <div className="kt-print-stage">
            <div className="kt-print-wrapper">
              <KramaTamiuPrintSheet
                krama={krama}
                desa={desa}
                meta={pemasihMeta}
                tampilkanTtdBandesa={tampilkanTtdBandesa}
              />
            </div>
          </div>

          {isKramaTamiu && showKartu && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-copper-900">
                Kartu Krama Tamiu (8,5 × 5 cm) — {kartuA4GridHint(krama.anggota_aktif.length)}
              </h3>
              <p className="text-xs text-copper-700">
                Depan dan belakang berdampingan · 4 pasang per lembar A4 portrait (8,5 × 5 cm
                per sisi).
              </p>
              <div className="kartu-print-stage">
                <div className="kartu-print-wrapper kartu-print-wrapper--a4-grid">
                  <KartuA4Grid>
                    {krama.anggota_aktif.map((a) => (
                      <div key={a.anggota_id} className="relative group kartu-pair-wrap">
                        <KartuKramaTamiuPair krama={krama} desa={desa} anggota={a} />
                        <Link
                          to={`${cetakKartuPath}?anggota=${a.anggota_id}`}
                          className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-xs py-0.5 px-2 shadow-sm bg-white"
                          >
                            PDF
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </KartuA4Grid>
                </div>
              </div>
            </section>
          )}

          {isTamiu && showKartu && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-copper-900">
                Kartu Tamiu (8,5 × 5 cm) — {kartuA4GridHint(krama.anggota_aktif.length)}
              </h3>
              <p className="text-xs text-copper-700">
                Depan dan belakang berdampingan · 4 pasang per lembar A4 portrait (8,5 × 5 cm
                per sisi).
              </p>
              <div className="kartu-print-stage">
                <div className="kartu-print-wrapper kartu-print-wrapper--a4-grid">
                  <KartuA4Grid>
                    {krama.anggota_aktif.map((a) => (
                      <div key={a.anggota_id} className="relative group kartu-pair-wrap">
                        <KartuTamiuPair krama={krama} desa={desa} anggota={a} />
                        <Link
                          to={`${cetakKartuPath}?anggota=${a.anggota_id}`}
                          className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-xs py-0.5 px-2 shadow-sm bg-white"
                          >
                            PDF
                          </Button>
                        </Link>
                      </div>
                    ))}
                  </KartuA4Grid>
                </div>
              </div>
            </section>
          )}
        </>
      )}
      <SuratKeteranganKramaDialog open={skkOpen} onClose={() => setSkkOpen(false)} krama={krama} />
      {isPipil && (
        <SuratKeteranganPindahDialog
          open={skpOpen}
          onClose={() => setSkpOpen(false)}
          krama={krama}
          jenis="keluarga"
        />
      )}
    </div>
  );
}
