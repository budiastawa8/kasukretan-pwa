import { KartuQrScanner } from "../KartuQrScanner";
import "../../styles/petugas-module.css";

type Props = {
  onScan: (raw: string) => void;
  onClose: () => void;
};

export function PetugasKartuQrScanner({ onScan, onClose }: Props) {
  return (
    <KartuQrScanner
      onScan={onScan}
      onClose={onClose}
      hint="Arahkan kamera ke QR di kartu Krama Tamiu / Tamiu."
      className="max-w-sm petugas-module [&>div:last-child]:p-0"
    />
  );
}
