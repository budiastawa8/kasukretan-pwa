import { Navigate, useParams } from "react-router-dom";
import { KramaWizardForm } from "../components/krama/KramaWizardForm";
import type { KlasifikasiKode } from "../lib/types";

const TITLES: Record<KlasifikasiKode, string> = {
  MIPIL: "Daftar Krama Mipil Baru",
  KRAMA_TAMIU: "Daftar Pemasih Baru",
  TAMIU: "Daftar Pemasih Baru",
};

export function KramaNewPage({ klasifikasi }: { klasifikasi: KlasifikasiKode }) {
  return <KramaWizardForm klasifikasi={klasifikasi} title={TITLES[klasifikasi]} />;
}

/** Route tunggal /krama-pemasih/baru — status KT/Tamiu dari agama pengajeg. */
export function KramaPemasihNewPage() {
  return <KramaNewPage klasifikasi="TAMIU" />;
}

/** Route lama /krama-pemasih/:jenis/baru → redirect ke /krama-pemasih/baru */
export function KramaPemasihNewRoute() {
  const { jenis } = useParams<{ jenis: string }>();
  if (jenis === "krama-tamiu" || jenis === "tamiu") {
    return <Navigate to="/krama-pemasih/baru" replace />;
  }
  return <Navigate to="/krama-pemasih" replace />;
}
