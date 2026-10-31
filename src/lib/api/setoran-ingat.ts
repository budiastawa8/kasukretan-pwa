import { lanFetch } from "../lan-client";

export type IngatPetugasSetorResult = {
  ok: true;
  petugas_nama: string;
  target: string;
  detail?: string;
};

export async function fetchSetoranIngatStatus(): Promise<{ configured: boolean }> {
  const res = await lanFetch<{ ok: boolean; configured: boolean }>("/setoran/ingat-status");
  return { configured: Boolean(res.configured) };
}

/** Kirim pengingat setor via Fonnte (server). Hanya admin/keuangan. */
export async function ingatPetugasSetorViaFonnte(
  petugasId: string
): Promise<IngatPetugasSetorResult> {
  return lanFetch<IngatPetugasSetorResult>("/setoran/ingat-petugas", {
    method: "POST",
    body: JSON.stringify({ petugasId }),
  });
}
