import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { BackLink } from "../components/ui/BackLink";
import { KramaWizardForm } from "../components/krama/KramaWizardForm";
import { getKramaDetail } from "../lib/services/krama";
import { kramaListPath } from "../lib/krama-routes";
import type { KlasifikasiKode } from "../lib/types";

const EDIT_TITLES: Record<KlasifikasiKode, string> = {
  MIPIL: "Edit Krama Mipil",
  KRAMA_TAMIU: "Edit Krama Tamiu",
  TAMIU: "Edit Tamiu",
};

export function KramaEditPage({ klasifikasi }: { klasifikasi: KlasifikasiKode }) {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to={kramaListPath(klasifikasi)} replace />;

  return (
    <div className="space-y-2.5">
      <BackLink
        guarded
        to={`${kramaListPath(klasifikasi)}/${id}`}
        className="h-11 gap-1.5 border px-3 py-2 text-sm shadow-none md:h-9 md:px-2.5 md:py-1.5 md:text-xs [&_span:first-child]:size-7 md:[&_span:first-child]:size-6 [&_svg]:size-4 md:[&_svg]:size-3.5"
      >
        Pratinjau
      </BackLink>
      <KramaWizardForm
        kramaId={id}
        klasifikasi={klasifikasi}
        title={EDIT_TITLES[klasifikasi]}
      />
    </div>
  );
}

/** Edit Krama Tamiu / Tamiu — klasifikasi dari data */
export function KramaPemasihEditRoute() {
  const { id } = useParams<{ id: string }>();
  const [kode, setKode] = useState<KlasifikasiKode | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    getKramaDetail(id)
      .then((k) => {
        if (!k) {
          setError("Krama tidak ditemukan");
          return;
        }
        if (k.klasifikasi_kode === "MIPIL") {
          setError("Gunakan menu Krama Mipil untuk mengedit data ini");
          return;
        }
        setKode(k.klasifikasi_kode);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!kode || !id) return <p className="text-muted">Memuat...</p>;

  return <KramaEditPage klasifikasi={kode} />;
}
