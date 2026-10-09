import type { ApiSessionUser } from "./api/petugas";

type TimOption = { id: string; nama: string };

/** Pilih petugas di form dari akun login (ID tim, lalu cocokkan nama). */
export function pickPetugasIdForTim(tim: TimOption[], user: ApiSessionUser | null): string {
  if (!tim.length) return "";
  if (user?.tim_kasukretan_id) {
    const byId = tim.find((x) => x.id === user.tim_kasukretan_id);
    if (byId) return byId.id;
  }
  const namaLogin = user?.nama?.trim();
  if (namaLogin) {
    const byNama = tim.find((x) => x.nama.trim() === namaLogin);
    if (byNama) return byNama.id;
  }
  return tim[0]?.id ?? "";
}
