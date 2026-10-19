/**
 * Intent-based search untuk krama: kartu/NIK vs teks nama.
 * Menghindari OR multi-kolom + EXISTS anggota pada setiap ketikan.
 */

export type SearchIntent = "empty" | "kartu" | "teks";

export type ClassifiedSearch = {
  intent: SearchIntent;
  /** Teks asli (trim). */
  raw: string;
  /** Untuk LIKE prefix/contains. */
  q: string;
  /** Nomor kartu tanpa strip/huruf kecil. */
  norm: string;
};

/** Normalisasi nomor kartu: buang non-alfanumerik, lower-case. */
export function normalizeKartuSearchKey(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/**
 * Digit-like jika ≥70% karakter alfanumerik adalah digit, panjang norm ≥2
 * (atau seluruhnya digit).
 */
export function classifySearchQuery(raw?: string | null): ClassifiedSearch {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { intent: "empty", raw: "", q: "", norm: "" };

  const norm = normalizeKartuSearchKey(trimmed);
  if (!norm) {
    if (trimmed.length < 2) return { intent: "empty", raw: trimmed, q: trimmed, norm: "" };
    return { intent: "teks", raw: trimmed, q: trimmed, norm: "" };
  }

  const digits = (norm.match(/\d/g) ?? []).length;
  const mostlyDigits = digits / norm.length >= 0.7;

  if (mostlyDigits && (norm.length >= 2 || /^\d+$/.test(norm))) {
    return { intent: "kartu", raw: trimmed, q: trimmed, norm };
  }

  if (trimmed.length < 2) return { intent: "empty", raw: trimmed, q: trimmed, norm };

  return { intent: "teks", raw: trimmed, q: trimmed, norm };
}

export type KramaSearchAliases = {
  /** Alias kolom nomor kartu, mis. `k.nomor_kartu`. */
  kartu: string;
  /** Alias kolom norm (opsional); fallback SQL replace jika null. */
  kartuNorm?: string | null;
  /** Alias nama kepala, mis. `p.nama_lengkap`. */
  namaKepala: string;
  /** Alias alamat (opsional). */
  alamat?: string | null;
  /** Alias tabel krama untuk EXISTS anggota (default `k`). */
  kramaAlias?: string;
  /** Cari juga di anggota aktif (nama). Default true untuk intent teks. */
  includeAnggota?: boolean;
  /** Cari NIK kepala (dan anggota bila includeAnggota). */
  includeNik?: boolean;
  /** Alias penduduk kepala untuk NIK, mis. `p`. */
  pendudukAlias?: string;
};

export type SearchWhereResult = {
  /** Fragmen `AND (...)` atau string kosong. */
  sql: string;
  args: unknown[];
  /** Index placeholder berikutnya untuk gaya `$n` (1-based next). */
  nextN: number;
};

function kartuNormExpr(aliases: KramaSearchAliases): string {
  if (aliases.kartuNorm) {
    return `COALESCE(NULLIF(TRIM(${aliases.kartuNorm}), ''), lower(replace(${aliases.kartu}, '-', '')))`;
  }
  return `lower(replace(${aliases.kartu}, '-', ''))`;
}

function ph(style: "numbered" | "qmark", n: number): string {
  return style === "numbered" ? `$${n}` : `?`;
}

/**
 * Bangun predikat pencarian krama.
 * `startN` = nomor placeholder berikutnya (untuk `$n`); diabaikan jika `qmark`.
 */
export function buildKramaSearchSql(
  rawQ: string | undefined | null,
  aliases: KramaSearchAliases,
  opts?: {
    placeholderStyle?: "numbered" | "qmark";
    /** Nomor `$n` berikutnya (default 1). */
    startN?: number;
  }
): SearchWhereResult {
  const style = opts?.placeholderStyle ?? "numbered";
  let n = opts?.startN ?? 1;
  const classified = classifySearchQuery(rawQ);
  if (classified.intent === "empty") {
    return { sql: "", args: [], nextN: n };
  }

  const includeAnggota = aliases.includeAnggota !== false;
  const includeNik = Boolean(aliases.includeNik);
  const krama = aliases.kramaAlias ?? "k";
  const penduduk = aliases.pendudukAlias ?? "p";
  const normExpr = kartuNormExpr(aliases);
  const parts: string[] = [];
  const args: unknown[] = [];

  if (classified.intent === "kartu") {
    const rawPrefix = `${classified.raw}%`;
    const normPrefix = `${classified.norm}%`;

    parts.push(`${aliases.kartu} LIKE ${ph(style, n++)}`);
    args.push(rawPrefix);

    parts.push(`${normExpr} LIKE ${ph(style, n++)}`);
    args.push(normPrefix);

    parts.push(`${normExpr} = ${ph(style, n++)}`);
    args.push(classified.norm);

    if (includeNik) {
      parts.push(`COALESCE(${penduduk}.nik_kependudukan, '') LIKE ${ph(style, n++)}`);
      args.push(normPrefix);
      parts.push(`COALESCE(${penduduk}.nik_atau_nika, '') LIKE ${ph(style, n++)}`);
      args.push(normPrefix);
    }

    return { sql: ` AND (${parts.join(" OR ")})`, args, nextN: n };
  }

  // Teks: nama kepala (+ alamat) (+ NIK) (+ anggota)
  const like = `%${classified.q}%`;

  parts.push(`${aliases.namaKepala} LIKE ${ph(style, n++)}`);
  args.push(like);

  if (aliases.alamat) {
    parts.push(`COALESCE(${aliases.alamat}, '') LIKE ${ph(style, n++)}`);
    args.push(like);
  }

  if (includeNik) {
    parts.push(`COALESCE(${penduduk}.nik_kependudukan, '') LIKE ${ph(style, n++)}`);
    args.push(like);
    parts.push(`COALESCE(${penduduk}.nik_atau_nika, '') LIKE ${ph(style, n++)}`);
    args.push(like);
  }

  if (includeAnggota) {
    const anggotaParts = [`pm.nama_lengkap LIKE ${ph(style, n++)}`];
    args.push(like);
    if (includeNik) {
      anggotaParts.push(`COALESCE(pm.nik_kependudukan, '') LIKE ${ph(style, n++)}`);
      args.push(like);
      anggotaParts.push(`COALESCE(pm.nik_atau_nika, '') LIKE ${ph(style, n++)}`);
      args.push(like);
      anggotaParts.push(`COALESCE(ak.nika, '') LIKE ${ph(style, n++)}`);
      args.push(like);
      anggotaParts.push(`COALESCE(ak.nrkt, '') LIKE ${ph(style, n++)}`);
      args.push(like);
      anggotaParts.push(`COALESCE(ak.nrt, '') LIKE ${ph(style, n++)}`);
      args.push(like);
    }
    parts.push(`EXISTS (
      SELECT 1
      FROM anggota_keluarga ak
      JOIN penduduk pm ON pm.id = ak.penduduk_id
      WHERE ak.krama_id = ${krama}.id
        AND ak.status = 'aktif'
        AND (${anggotaParts.join(" OR ")})
    )`);
  }

  return { sql: ` AND (${parts.join(" OR ")})`, args, nextN: n };
}
