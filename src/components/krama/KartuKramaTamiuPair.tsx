import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "../../lib/types";

import { KartuKramaTamiuCard } from "./KartuKramaTamiuCard";

import { KartuKramaTamiuCardBack } from "./KartuKramaTamiuCardBack";



export function KartuKramaTamiuPair({

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

      <KartuKramaTamiuCard krama={krama} desa={desa} anggota={anggota} />

      <KartuKramaTamiuCardBack krama={krama} desa={desa} />

    </div>

  );

}


