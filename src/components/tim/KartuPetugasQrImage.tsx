import { useEffect, useState } from "react";
import { generatePetugasKartuQrDataUrl } from "../../lib/petugas-kartu-qr";

export function KartuPetugasQrImage({
  nomorPengenal,
  className,
  size = 180,
}: {
  nomorPengenal: string;
  className?: string;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void generatePetugasKartuQrDataUrl(nomorPengenal, size).then((dataUrl) => {
      if (!cancelled) setUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [nomorPengenal, size]);

  if (!url) {
    return <div className={className} aria-hidden style={{ background: "#f5f5f5" }} />;
  }
  return <img className={className} src={url} alt={`QR ${nomorPengenal}`} />;
}
