import { useEffect, useState } from "react";
import { generateKartuQrDataUrl } from "../../lib/kartu-qr";

type Props = {
  nomorKartu: string;
  className?: string;
  alt?: string;
};

export function KartuQrImage({ nomorKartu, className, alt = "QR nomor kartu" }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void generateKartuQrDataUrl(nomorKartu, 140).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [nomorKartu]);

  if (!src) {
    return <div className={className} aria-hidden />;
  }

  return <img className={className} src={src} alt={alt} />;
}
