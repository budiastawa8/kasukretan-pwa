import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, FileText, LogOut, ScrollText } from "lucide-react";
import { getDesaAdat, getDesaAdatWithMedia } from "../../lib/services/desa";
import { listJenisMipil } from "../../lib/services/master";
import { isPemasihPrintKlasifikasi, pemasihPrintMeta } from "../../lib/pemasih-print";
import { normalizeKramaStatus } from "../../lib/krama-status";
import type { DesaAdat, JenisKramaMipilRow, KramaDetail } from "../../lib/types";
import { Button } from "../ui/Button";
import { SuratKeteranganKramaDialog } from "./SuratKeteranganKramaDialog";
import { SuratKeteranganPindahDialog } from "./SuratKeteranganPindahDialog";
import { PengarepWarningsPanel } from "./PengarepWarningsPanel";
import { IlikitaPdfInlinePreview } from "./IlikitaPdfInlinePreview";
import { KartuA4Grid, kartuA4GridHint } from "./KartuA4Grid";
import { KartuKramaAdatPair } from "./KartuKramaAdatPair";
import { KartuKramaTamiuPair } from "./KartuKramaTamiuPair";
import { KartuTamiuPair } from "./KartuTamiuPair";
import "../../styles/kartu-krama-print.css";

export function KramaPrintPreviewView({ krama }: { krama: KramaDetail }) {
  const isPipil = krama.klasifikasi_kode === "MIPIL";
  const isKramaTamiu = krama.klasifikasi_kode === "KRAMA_TAMIU";
  const isTamiu = krama.klasifikasi_kode === "TAMIU";
  const isPemasihSheet = isPemasihPrintKlasifikasi(krama.klasifikasi_kode);
  const pemasihMeta = pemasihPrintMeta(krama.klasifikasi_kode);
  const [desaCore, setDesaCore] = useState<DesaAdat | null>(null);
  const [desaMedia, setDesaMedia] = useState<DesaAdat | null>(null);
  const [desaMediaReady, setDesaMediaReady] = useState(false);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [skkOpen, setSkkOpen] = useState(false);
  const [skpOpen, setSkpOpen] = useState(false);
  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(false);
  const [hasTtdImage, setHasTtdImage] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [showKartuPreview, setShowKartuPreview] = useState(false);

  useEffect(() => {
    void getDesaAdat().then(setDesaCore);
    if (isPipil) void listJenisMipil().then(setJenisMipil);
  }, [isPipil]);

  const ensureDesaMedia = useCallback(() => {
    if (desaMedia) {
      setDesaMediaReady(true);
      return;
    }
    void getDesaAdatWithMedia()
      .then((d) => {
        setDesaMedia(d);
        const has = !!d?.bandesa_ttd_url?.trim()?.startsWith("data:image/");
        setHasTtdImage(has);
        if (!has) setTampilkanTtdBandesa(false);
      })
      .finally(() => setDesaMediaReady(true));
  }, [desaMedia]);

  const openPdfPreview = () => {
    setShowPdfPreview(true);
    ensureDesaMedia();
  };

  const openKartuPreview = () => {
    setShowKartuPreview(true);
    ensureDesaMedia();
  };

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
  const desaForKartu = desaMedia ?? desaCore;

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

      {isPipil && <PengarepWarningsPanel krama={krama} desa={desaCore} jenisMipil={jenisMipil} />}

      {showIlikitaSheet && (
        <section className="space-y-2 rounded-lg border border-copper-200 bg-copper-50/40 px-3 py-3">
          {!showPdfPreview ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-copper-900">
                Pratinjau PDF {label} tidak dimuat otomatis agar halaman lebih cepat.
              </p>
              <Button type="button" variant="secondary" icon={Eye} onClick={openPdfPreview}>
                Tampilkan pratinjau PDF
              </Button>
            </div>
          ) : (
            <>
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
                {desaMediaReady && !hasTtdImage && (
                  <p className="text-[11px] text-copper-600">
                    Unggah gambar TTD Bandesa di Master Data → Profil Desa Adat.
                  </p>
                )}
              </div>
              <IlikitaPdfInlinePreview
                key={`${isPipil ? "pipil" : "pemasih"}-${krama.id}`}
                doc={isPipil ? "pipil" : "pemasih"}
                krama={krama}
                desa={desaMedia}
                desaReady={desaMediaReady}
                tampilkanTtdBandesa={tampilkanTtdBandesa && hasTtdImage}
              />
            </>
          )}
        </section>
      )}

      {isPipil && showKartu && (
        <section className="space-y-2">
          {!showKartuPreview ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-copper-200 px-3 py-3">
              <p className="text-sm text-copper-900">
                Pratinjau kartu anggota ({krama.anggota_aktif.length}) dimuat saat diminta.
              </p>
              <Button type="button" variant="secondary" icon={Eye} onClick={openKartuPreview}>
                Tampilkan pratinjau kartu
              </Button>
            </div>
          ) : (
            <>
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
                        <KartuKramaAdatPair krama={krama} desa={desaForKartu} anggota={a} />
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
            </>
          )}
        </section>
      )}

      {isPemasihSheet && pemasihMeta && isKramaTamiu && showKartu && (
        <section className="space-y-2">
          {!showKartuPreview ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-copper-200 px-3 py-3">
              <p className="text-sm text-copper-900">
                Pratinjau kartu anggota ({krama.anggota_aktif.length}) dimuat saat diminta.
              </p>
              <Button type="button" variant="secondary" icon={Eye} onClick={openKartuPreview}>
                Tampilkan pratinjau kartu
              </Button>
            </div>
          ) : (
            <>
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
                        <KartuKramaTamiuPair krama={krama} desa={desaForKartu} anggota={a} />
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
            </>
          )}
        </section>
      )}

      {isPemasihSheet && pemasihMeta && isTamiu && showKartu && (
        <section className="space-y-2">
          {!showKartuPreview ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-copper-200 px-3 py-3">
              <p className="text-sm text-copper-900">
                Pratinjau kartu anggota ({krama.anggota_aktif.length}) dimuat saat diminta.
              </p>
              <Button type="button" variant="secondary" icon={Eye} onClick={openKartuPreview}>
                Tampilkan pratinjau kartu
              </Button>
            </div>
          ) : (
            <>
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
                        <KartuTamiuPair krama={krama} desa={desaForKartu} anggota={a} />
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
            </>
          )}
        </section>
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
