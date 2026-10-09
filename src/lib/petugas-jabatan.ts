/**
 * Ketua, Sekretaris, dan Bendahara boleh menerima Paturunan/Dudukan
 * dari semua banjar (bukan hanya banjar penugasan).
 */
export function isJabatanPenerimaSemuaBanjar(jabatan: string): boolean {
  const j = jabatan.trim().toLowerCase().replace(/\s+/g, " ");
  if (!j) return false;
  return (["ketua", "sekretaris", "bendahara"] as const).some(
    (role) => j === role || j.startsWith(`${role} `)
  );
}
