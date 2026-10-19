/**
 * RBAC staf desktop:
 * - admin    — semua hak
 * - operator — input/edit/hapus krama + lihat laporan
 * - keuangan — menu keuangan (+ paturunan/dudukan) + edit krama + laporan
 * - prajuru  — hanya lihat laporan
 * - petugas  — mengumpulkan paturunan/dudukan di banjarnya (scan QR kartu)
 */

export type StaffRole = "admin" | "operator" | "keuangan" | "prajuru" | "petugas";

export const STAFF_ROLES: StaffRole[] = ["admin", "operator", "keuangan", "prajuru", "petugas"];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrator",
  operator: "Operator",
  keuangan: "Keuangan",
  prajuru: "Prajuru",
  petugas: "Petugas Lapangan",
};

/** Map peran lama (viewer) → prajuru. */
export function normalizeStaffRole(value: string | undefined | null): StaffRole | null {
  if (!value) return null;
  if (value === "viewer") return "prajuru";
  if (isStaffRole(value)) return value;
  return null;
}

export function isStaffRole(value: string | undefined | null): value is StaffRole {
  return (
    value === "admin" ||
    value === "operator" ||
    value === "keuangan" ||
    value === "prajuru" ||
    value === "petugas"
  );
}

export function isPetugasLapangan(peran: string | undefined | null): boolean {
  return normalizeStaffRole(peran) === "petugas";
}

export function isAdmin(peran: string | undefined | null): boolean {
  return normalizeStaffRole(peran) === "admin";
}

/** Input / edit krama (bukan hapus). */
export function canEditKrama(peran: string | undefined | null): boolean {
  const r = normalizeStaffRole(peran);
  return r === "admin" || r === "operator" || r === "keuangan";
}

/** Hapus krama — admin & operator. */
export function canDeleteKrama(peran: string | undefined | null): boolean {
  const r = normalizeStaffRole(peran);
  return r === "admin" || r === "operator";
}

/** Paturunan, dudukan, buku kas / keuangan. */
export function canEditKeuangan(peran: string | undefined | null): boolean {
  const r = normalizeStaffRole(peran);
  return r === "admin" || r === "keuangan";
}

/** Hapus transaksi keuangan — admin & keuangan. */
export function canDeleteFinancialTransaction(peran: string | undefined | null): boolean {
  const r = normalizeStaffRole(peran);
  return r === "admin" || r === "keuangan";
}

/** Master data, lembaga/badan, pengaturan sensitif. */
export function canEditMaster(peran: string | undefined | null): boolean {
  return isAdmin(peran);
}

export function canDeleteArsipIpma(peran: string | undefined | null): boolean {
  return isAdmin(peran);
}

/** Lihat laporan (semua peran staf kecuali petugas lapangan). */
export function canViewLaporan(peran: string | undefined | null): boolean {
  const r = normalizeStaffRole(peran);
  return r != null && r !== "petugas";
}

/**
 * @deprecated Gunakan canEditKrama / canEditKeuangan.
 * True jika boleh mengubah data operasional (bukan prajuru).
 */
export function canEditData(peran: string | undefined | null): boolean {
  const r = normalizeStaffRole(peran);
  return r === "admin" || r === "operator" || r === "keuangan";
}

export function defaultHomePath(peran: string | undefined | null): string {
  const r = normalizeStaffRole(peran);
  if (r === "prajuru") return "/laporan";
  if (r === "petugas") return "/pengumpulan";
  return "/";
}

function pathStarts(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Apakah peran boleh membuka path (menu + RouteGuard).
 */
export function canAccessPath(peran: string | undefined | null, pathname: string): boolean {
  const r = normalizeStaffRole(peran);
  if (!r) return false;

  // Halaman pengumpulan bergantung pada akun yang terhubung ke Tim Kasukretan.
  // /pungut* = alias lama (redirect ke /pengumpulan*).
  if (pathStarts(pathname, "/pengumpulan") || pathStarts(pathname, "/pungut")) {
    return r === "petugas";
  }
  if (r === "petugas") return false;

  if (r === "admin") return true;

  // Laporan — semua peran
  if (pathStarts(pathname, "/laporan")) return true;

  // Pengaturan: semua staf (tab sensitif tetap di-gate di UI)
  if (pathStarts(pathname, "/pengaturan")) return true;

  // Print kartu / preview terkait krama (bukan prajuru)
  const kramaPrint =
    pathStarts(pathname, "/pipil") ||
    pathStarts(pathname, "/kartu") ||
    pathStarts(pathname, "/krama-tamiu-print") ||
    pathStarts(pathname, "/jadwal-dudukan") ||
    pathname.includes("pdf-preview") ||
    pathname.includes("print");

  if (r === "prajuru") {
    return false;
  }

  // Operator: dashboard + krama (+ print) — tanpa keuangan/paturunan/dudukan/master/lembaga
  if (r === "operator") {
    if (pathname === "/" || pathname === "") return true;
    if (pathStarts(pathname, "/krama-mipil")) return true;
    if (pathStarts(pathname, "/krama-pemasih")) return true;
    if (pathStarts(pathname, "/krama")) return true;
    if (kramaPrint) return true;
    return false;
  }

  // Keuangan: dashboard + krama (edit, tanpa hapus di UI) + paturunan/dudukan/keuangan + print
  if (r === "keuangan") {
    if (pathname === "/" || pathname === "") return true;
    if (pathStarts(pathname, "/krama-mipil")) return true;
    if (pathStarts(pathname, "/krama-pemasih")) return true;
    if (pathStarts(pathname, "/krama")) return true;
    if (pathStarts(pathname, "/paturunan")) return true;
    if (pathStarts(pathname, "/dudukan")) return true;
    if (pathStarts(pathname, "/keuangan")) return true;
    if (kramaPrint) return true;
    // Form baru/edit krama
    if (pathname.endsWith("/baru") || pathname.includes("/edit")) {
      return (
        pathStarts(pathname, "/krama") ||
        pathStarts(pathname, "/krama-mipil") ||
        pathStarts(pathname, "/krama-pemasih")
      );
    }
    return false;
  }

  return false;
}

export function staffRoleLabel(peran: string | undefined | null): string {
  const r = normalizeStaffRole(peran);
  if (r) return STAFF_ROLE_LABELS[r];
  return peran?.trim() || "Petugas";
}
