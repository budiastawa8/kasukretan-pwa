import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../../lib/types";
import { KartuKramaAdatCard } from "./KartuKramaAdatCard";
import { KartuKramaAdatCardBack } from "./KartuKramaAdatCardBack";

export function KartuKramaAdatPair({
  krama,
  desa,
  anggota,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
  anggota: AnggotaKeluarga;
}) {
  return (
    <div className="kartu-pair">
      <KartuKramaAdatCard krama={krama} desa={desa} anggota={anggota} />
      <KartuKramaAdatCardBack krama={krama} desa={desa} />
    </div>
  );
}
