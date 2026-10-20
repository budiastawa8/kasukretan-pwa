import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { PenerimaanBanjarCard } from "../components/pengumpulan/PenerimaanBanjarCard";
import { PembayaranSayaCard } from "../components/pengumpulan/PembayaranSayaCard";
import { RiwayatSetoranCard } from "../components/pengumpulan/RiwayatSetoranCard";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { IconLink } from "../components/ui/IconLink";
import {
  getPetugasLapanganSaya,
  type ModePengumpulan,
  type PetugasLapangan,
} from "../lib/services/pengumpulan";
import { cn } from "../lib/utils";

const MODE_STORAGE_KEY = "kasukretan.pengumpulan_mode.v1";
const MODE_STORAGE_KEY_LEGACY = "kasukretan.pungut_mode.v1";

function readMode(): ModePengumpulan {
  try {
    const v =
      localStorage.getItem(MODE_STORAGE_KEY) ?? localStorage.getItem(MODE_STORAGE_KEY_LEGACY);
    return v === "dudukan" ? "dudukan" : "paturunan";
  } catch {
    return "paturunan";
  }
}

export function PengumpulanRekapPage() {
  const { user } = useAuth();
  const [petugas, setPetugas] = useState<PetugasLapangan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ModePengumpulan>(readMode);

  useEffect(() => {
    if (!user) {
      setLoaded(true);
      return;
    }
    void getPetugasLapanganSaya(user.id)
      .then((p) => {
        setPetugas(p);
        if (p?.is_tim_bantuan) setMode("dudukan");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoaded(true));
  }, [user]);

  function pilihMode(m: ModePengumpulan) {
    if (petugas?.is_tim_bantuan && m !== "dudukan") return;
    setMode(m);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }

  if (!loaded) {
    return <p className="text-sm text-muted">Memuat…</p>;
  }

  if (!petugas) {
    return (
      <Card title="Rekap & Riwayat Saya">
        <p className="text-sm text-amber-900">
          Akun Anda belum dihubungkan ke nama di Tim Kasukretan. Minta admin membuka Pengaturan →
          Pengguna, lalu memilih nama petugas untuk akun ini.
        </p>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        <IconLink to="/pengumpulan" icon={ArrowLeft} variant="secondary" className="mt-3">
          Kembali ke Pengumpulan
        </IconLink>
      </Card>
    );
  }

  const isBantuan = petugas.is_tim_bantuan;

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-bold text-copper-950">
            <ClipboardList className="shrink-0 text-copper-700" size={20} />
            Rekap &amp; Riwayat Saya
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {petugas.nama} · {petugas.jabatan}
            {isBantuan ? " · Tim Bantuan" : ""} ·{" "}
            {petugas.semua_banjar ? "semua banjar" : `Banjar ${petugas.banjar_nama}`}
          </p>
        </div>
        <IconLink to="/pengumpulan" icon={ArrowLeft} variant="secondary">
          Pengumpulan
        </IconLink>
      </div>

      {isBantuan ? (
        <PembayaranSayaCard petugasId={petugas.id} />
      ) : (
        <RiwayatSetoranCard petugasId={petugas.id} petugasJabatan={petugas.jabatan} />
      )}

      {!isBantuan && (
        <>
          <Card title="Jenis penerimaan">
            <p className="mb-2 text-xs text-muted">
              Pilih jenis iuran untuk melihat penerimaan banjar pada periode yang dipilih.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "paturunan" ? "primary" : "secondary"}
                className={cn("h-11", mode === "paturunan" && "ring-1 ring-copper-700")}
                onClick={() => pilihMode("paturunan")}
              >
                Paturunan
              </Button>
              <Button
                type="button"
                variant={mode === "dudukan" ? "primary" : "secondary"}
                className={cn("h-11", mode === "dudukan" && "ring-1 ring-copper-700")}
                onClick={() => pilihMode("dudukan")}
              >
                Dudukan
              </Button>
            </div>
          </Card>

          <PenerimaanBanjarCard petugas={petugas} mode={mode} />
        </>
      )}

      {isBantuan && (
        <RiwayatSetoranCard petugasId={petugas.id} petugasJabatan={petugas.jabatan} />
      )}

      <p className="px-1 text-center text-[11px] text-muted">
        Untuk mencatat pembayaran baru, buka{" "}
        <Link to="/pengumpulan" className="font-medium text-copper-800 underline">
          Pengumpulan
        </Link>
        .
      </p>
    </div>
  );
}
