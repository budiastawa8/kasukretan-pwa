import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { listJenisDapukanIds } from "../../lib/dapukan-ketentuan";
import { parseBatasUmurNyada } from "../../lib/nyada-ketentuan";
import { getPengarepWarnings } from "../../lib/pengarep-warnings";
import { isKepalaPenduduk } from "../../lib/status-keluarga";
import type { DesaAdat, JenisKramaMipilRow, KramaDetail } from "../../lib/types";
import { formatStatusKawin } from "../../lib/utils";
import { cn } from "../../lib/utils";

function resolvePengarepFromKrama(krama: KramaDetail) {
  const pengarep =
    krama.anggota_aktif.find((a) => isKepalaPenduduk(a.penduduk_id, krama.kepala.id)) ??
    krama.anggota_aktif.find((a) => a.penduduk_id === krama.kepala.id);

  return {
    statusKawin: pengarep?.status_kawin ?? krama.kepala.status_kawin,
    tanggalLahir: pengarep?.tanggal_lahir ?? krama.kepala.tanggal_lahir,
  };
}

export function PengarepWarningsPanel({
  krama,
  desa,
  jenisMipil,
  className,
}: {
  krama: KramaDetail;
  desa: DesaAdat | null;
  jenisMipil: JenisKramaMipilRow[];
  className?: string;
}) {
  const warnings = useMemo(() => {
    if (krama.klasifikasi_kode !== "MIPIL") return [];
    const pengarep = resolvePengarepFromKrama(krama);
    return getPengarepWarnings({
      klasifikasi: "MIPIL",
      statusKawin: pengarep.statusKawin,
      tanggalLahir: pengarep.tanggalLahir,
      jenisMipilId: krama.jenis_krama_mipil_id,
      ketentuan: {
        batasUmurNyada: parseBatasUmurNyada(desa?.jenis_umur_nyada),
        nyadaBerlakuMulai: desa?.nyada_berlaku_mulai,
        jenisNyadaId: desa?.jenis_krama_mipil_id,
        jenisCeraiMatiId: desa?.jenis_cerai_mati_mipil_id,
        jenisCeraiHidupId: desa?.jenis_cerai_hidup_mipil_id,
        jenisDapukanIds: listJenisDapukanIds(desa),
      },
      jenisNama: (id) => jenisMipil.find((j) => j.id === id)?.nama,
    });
  }, [krama, desa, jenisMipil]);

  if (warnings.length === 0) return null;

  const pengarep = resolvePengarepFromKrama(krama);

  return (
    <div
      role="alert"
      className={cn(
        "print:hidden rounded-lg border-2 border-amber-600 bg-amber-100 shadow-sm",
        className
      )}
    >
      <div className="flex gap-3 px-4 py-3">
        <AlertTriangle
          size={22}
          className="shrink-0 text-amber-800 mt-0.5"
          aria-hidden
        />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-bold text-amber-950 tracking-tight">
            Peringatan Pengarep & Jenis Krama
          </p>
          <ul className="space-y-1.5 text-sm text-amber-950 leading-snug list-none">
            {warnings.map((msg) => (
              <li
                key={msg}
                className="pl-3 border-l-[3px] border-amber-600 font-medium"
              >
                {msg}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-900/90">
            Jenis krama saat ini:{" "}
            <span className="font-semibold">{krama.jenis_nama ?? "—"}</span>
            {" · "}
            Status kawin Pengarep:{" "}
            <span className="font-semibold">
              {formatStatusKawin(pengarep.statusKawin) || "—"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
