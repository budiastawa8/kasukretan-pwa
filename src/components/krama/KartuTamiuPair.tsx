import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../../lib/types";
import { KartuTamiuCard } from "./KartuTamiuCard";
import { KartuTamiuCardBack } from "./KartuTamiuCardBack";

export function KartuTamiuPair({
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
      <KartuTamiuCard krama={krama} desa={desa} anggota={anggota} />
      <KartuTamiuCardBack krama={krama} desa={desa} />
    </div>
  );
}
