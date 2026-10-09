import { Navigate, useParams } from "react-router-dom";
import { KramaWizardForm } from "../components/krama/KramaWizardForm";
import type { KlasifikasiKode } from "../lib/types";

const TITLES: Record<KlasifikasiKode, string> = {
  MIPIL: "Daftar Krama Mipil Baru",
  KRAMA_TAMIU: "Daftar Krama Tamiu Baru",
  TAMIU: "Daftar Tamiu Baru",
};

export function KramaNewPage({ klasifikasi }: { klasifikasi: KlasifikasiKode }) {
  return <KramaWizardForm klasifikasi={klasifikasi} title={TITLES[klasifikasi]} />;
}

/** Route wrapper untuk /krama-pemasih/:jenis/baru */
export function KramaPemasihNewRoute() {
  const { jenis } = useParams<{ jenis: string }>();
  if (jenis === "krama-tamiu") return <KramaNewPage klasifikasi="KRAMA_TAMIU" />;
  if (jenis === "tamiu") return <KramaNewPage klasifikasi="TAMIU" />;
  return <Navigate to="/krama-pemasih" replace />;
}
