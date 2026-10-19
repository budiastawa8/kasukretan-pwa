import { useCallback, useEffect, useState } from "react";
import { RefreshCw, SquarePen } from "lucide-react";
import { useParams, useLocation } from "react-router-dom";
import { getKramaDetail } from "../lib/services/krama";
import { DESA_ADAT_UPDATED_EVENT, getDesaAdatWithMedia } from "../lib/services/desa";
import { kramaEditPath, kramaListPath } from "../lib/krama-routes";
import type { DesaAdat, KramaDetail } from "../lib/types";
import { isAutoPerpanjangPemasihUntuk } from "../lib/ilikita-kebijakan";
import { formatBerlakuSdKrama, hasMasaBerlakuTahun } from "../lib/masa-berlaku";
import {
  formatStatusIlikitaEfektif,
  isIlikitaPerpanjanganRelevan,
  isKramaNonaktifTotal,
  statusIlikitaEfektif,
} from "../lib/status-ilikita";
import { isPemasihAkanHabis, PEMASIH_PERINGATAN_HARI } from "../lib/pemasih-perhatian";
import { KramaPrintPreviewView } from "../components/krama/KramaPrintPreviewView";
import { PemasihPerpanjangDialog } from "../components/krama/PemasihPerpanjangDialog";
import { useAuth } from "../context/AuthContext";
import { canEditKrama } from "../lib/auth-roles";
import { BackLink } from "../components/ui/BackLink";
import { Button } from "../components/ui/Button";
import { IconLink } from "../components/ui/IconLink";
import { AnggotaImportExportPanel } from "../components/krama/AnggotaImportExportPanel";
import { PemasihAnggotaImportExportPanel } from "../components/krama/PemasihAnggotaImportExportPanel";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { cn } from "../lib/utils";

export function KramaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();
  const [krama, setKrama] = useState<KramaDetail | null>(null);
  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [error, setError] = useState("");
  const [importFlash, setImportFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [perpanjangOpen, setPerpanjangOpen] = useState(false);
  const canEdit = canEditKrama(user?.peran);
  const isPemasih =
    krama?.klasifikasi_kode === "KRAMA_TAMIU" || krama?.klasifikasi_kode === "TAMIU";
  const kramaNonaktifTotal = krama ? isKramaNonaktifTotal(krama) : false;
  const ilikitaRelevan = krama ? isIlikitaPerpanjanganRelevan(krama) : false;
  const pemasihTidakAktif =
    isPemasih &&
    krama &&
    ilikitaRelevan &&
    statusIlikitaEfektif(krama.klasifikasi_kode, krama) === "tidak_aktif";
  const pemasihAkanHabis =
    krama && isPemasih && ilikitaRelevan ? isPemasihAkanHabis(krama) : false;

  const load = useCallback(() => {
    if (!id) return;
    getKramaDetail(id)
      .then(setKrama)
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load, location.key]);

  useEffect(() => {
    void getDesaAdatWithMedia().then(setDesa);
    const onDesaUpdated = () => void getDesaAdatWithMedia().then(setDesa);
    window.addEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
    return () => window.removeEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
  }, []);

  if (error && !krama) return <p className="text-red-600">{error}</p>;
  if (!krama) return <p className="text-muted">Memuat...</p>;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex gap-2",
          isPhone ? "flex-col items-stretch" : "flex-wrap items-center justify-between"
        )}
      >
        <BackLink
          to={kramaListPath(krama.klasifikasi_kode)}
          className={cn(isPhone && "h-11 w-full justify-center text-sm")}
        >
          Kembali ke daftar
        </BackLink>
        <div className={cn("flex gap-2", isPhone ? "flex-col" : "flex-wrap")}>
          {canEdit && pemasihTidakAktif && (
            <Button
              type="button"
              icon={RefreshCw}
              className={cn(isPhone && "h-11 w-full justify-center")}
              onClick={() => setPerpanjangOpen(true)}
            >
              Perpanjang Pemasih
            </Button>
          )}
          {canEdit && (
            <IconLink
              to={kramaEditPath(krama.klasifikasi_kode, krama.id)}
              variant="secondary"
              icon={SquarePen}
              className={cn(isPhone && "h-11 w-full justify-center")}
            >
              Edit data krama
            </IconLink>
          )}
        </div>
      </div>
      {kramaNonaktifTotal && (
        <div className="rounded-lg border border-copper-300 bg-copper-50 px-4 py-3 text-sm text-copper-900">
          <p className="font-medium">Krama nonaktif (meninggal/pindah/pawanengan)</p>
          <p className="mt-1">
            Status Pipil dan Status Pemasih tidak aktif total. Peringatan perpanjangan dan
            perpanjangan Pemasih tidak berlaku.
          </p>
        </div>
      )}
      {isPemasih && ilikitaRelevan && (pemasihAkanHabis || pemasihTidakAktif) && (
        <div
          className={
            pemasihTidakAktif
              ? "rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              : "rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900"
          }
        >
          <p className="font-medium">
            Status Pemasih: {formatStatusIlikitaEfektif(krama.klasifikasi_kode, krama)}
            {hasMasaBerlakuTahun(krama.masa_berlaku_tahun) && (
              <>
                {" "}
                · Berlaku S/D {formatBerlakuSdKrama(krama) || "—"}
              </>
            )}
          </p>
          {pemasihAkanHabis && !pemasihTidakAktif && (
            <p className="mt-1">
              Masa berlaku akan habis dalam {PEMASIH_PERINGATAN_HARI} hari.
              {isAutoPerpanjangPemasihUntuk(krama, desa)
                ? " Pemasih akan diperpanjang otomatis pada tanggal berlaku akhir sesuai pengaturan jenis ini."
                : " Pemasih tidak diperpanjang otomatis untuk jenis ini."}
            </p>
          )}
          {pemasihTidakAktif && (
            <p className="mt-1">Lakukan perpanjangan untuk mengaktifkan kembali masa berlaku.</p>
          )}
        </div>
      )}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {krama && (
        <PemasihPerpanjangDialog
          kramaId={krama.id}
          nomorKartu={krama.nomor_kartu}
          open={perpanjangOpen}
          onClose={() => setPerpanjangOpen(false)}
          onSuccess={load}
        />
      )}
      <KramaPrintPreviewView krama={krama} />
      {importFlash && (
        <p
          className={
            importFlash.kind === "ok"
              ? "text-sm rounded-lg px-4 py-1.5 border leading-snug text-copper-900 bg-copper-100 border-copper-300"
              : "text-sm rounded-lg px-4 py-1.5 border leading-snug text-red-600 bg-red-50 border-red-100"
          }
        >
          {importFlash.text}
        </p>
      )}
      {!kramaNonaktifTotal &&
        (krama.klasifikasi_kode === "MIPIL" ? (
          <AnggotaImportExportPanel
            kramaId={krama.id}
            nomorKartu={krama.nomor_kartu}
            canEdit={canEdit}
            onRefresh={async () => {
              load();
            }}
            onSaved={(msg) => {
              setImportFlash({ kind: "ok", text: msg });
              setTimeout(() => setImportFlash(null), 4000);
            }}
            onError={(msg) => {
              setImportFlash({ kind: "err", text: msg });
            }}
          />
        ) : (
          <PemasihAnggotaImportExportPanel
            kramaId={krama.id}
            nomorKartu={krama.nomor_kartu}
            canEdit={canEdit}
            onRefresh={async () => {
              load();
            }}
            onSaved={(msg) => {
              setImportFlash({ kind: "ok", text: msg });
              setTimeout(() => setImportFlash(null), 4000);
            }}
            onError={(msg) => {
              setImportFlash({ kind: "err", text: msg });
            }}
          />
        ))}
    </div>
  );
}
