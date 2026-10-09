import { getDb } from "./db/client";
import { pad2, pad4, uuid } from "./utils";

export interface DesaKode {
  kode_kabupaten: string;
  kode_kecamatan: string;
  kode_desa_adat: string;
}

/** Hilangkan pemisah minus dari nomor kartu / induk anggota. */
export function stripPenomoranDash(value: string): string {
  return value.trim().replace(/-/g, "");
}

/** Normalisasi nomor kartu untuk penyimpanan atau pencocokan. */
export function normalizeNomorKartu(input: string): string {
  return stripPenomoranDash(input);
}

export function nomorKartuLookupKey(input: string): string {
  return normalizeNomorKartu(input).toLowerCase();
}

export function formatNomorKartu(
  desa: DesaKode,
  banjarKode: string,
  urut: number
): string {
  return `${pad2(desa.kode_kabupaten)}${pad2(desa.kode_kecamatan)}${pad4(desa.kode_desa_adat)}${pad2(banjarKode)}${pad4(urut)}`;
}

export async function generateNomorKartu(
  desaAdatId: string,
  banjarId: string,
  banjarKode: string
): Promise<string> {
  const db = await getDb();
  const desa = await db.select<DesaKode[]>(
    `SELECT kode_kabupaten, kode_kecamatan, kode_desa_adat FROM desa_adat WHERE id = ?`,
    [desaAdatId]
  );
  if (!desa[0]) throw new Error("Konfigurasi desa adat belum lengkap");

  const existing = await db.select<{ urutan_terakhir: number }[]>(
    `SELECT urutan_terakhir FROM penomoran_kartu_counter WHERE banjar_id = ?`,
    [banjarId]
  );

  let urut: number;
  if (existing[0]) {
    urut = existing[0].urutan_terakhir + 1;
    if (urut > 9999) throw new Error("Kuota nomor kartu banjar penuh");
    await db.execute(
      `UPDATE penomoran_kartu_counter SET urutan_terakhir = ? WHERE banjar_id = ?`,
      [urut, banjarId]
    );
  } else {
    urut = 1;
    await db.execute(
      `INSERT INTO penomoran_kartu_counter (id, desa_adat_id, banjar_id, urutan_terakhir) VALUES (?, ?, ?, ?)`,
      [uuid(), desaAdatId, banjarId, urut]
    );
  }

  return formatNomorKartu(desa[0], banjarKode, urut);
}

export function formatNika(nomorKartu: string, urut: number): string {
  return `${normalizeNomorKartu(nomorKartu)}${pad2(urut)}`;
}

/**
 * Cari slot NIKA berikutnya mulai dari urut preferensi.
 * @param startAfterUrut mulai cek dari urut (startAfterUrut + 1); mis. 2 anggota aktif → pass 2 untuk dapat urut 3.
 */
export function resolveNextNikaSlot(
  nomorKartu: string,
  startAfterUrut: number | null | undefined,
  takenNikias: Iterable<string>
): { nika: string; urut: number } {
  const taken = new Set(
    [...takenNikias].map((n) => normalizeNomorKartu(n))
  );
  let urut = (startAfterUrut ?? 0) + 1;
  while (urut <= 99) {
    const nika = formatNika(nomorKartu, urut);
    if (!taken.has(nika)) return { nika, urut };
    urut += 1;
  }
  throw new Error("Maksimal 99 anggota per Krama Mipil atau nomor NIKA sudah penuh");
}

/** Penomoran NIKA anggota baru: urut = jumlah anggota aktif + 1, lewati slot yang masih di-reserve. */
export function resolveNikaForNewAnggota(
  nomorKartu: string,
  activeMemberCount: number,
  takenNikias: Iterable<string>
): { nika: string; urut: number } {
  return resolveNextNikaSlot(nomorKartu, activeMemberCount, takenNikias);
}

export async function generateNika(
  kramaId: string,
  nomorKartu: string
): Promise<{ nika: string; urut: number }> {
  const db = await getDb();
  const active = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM anggota_keluarga WHERE krama_id = ? AND status = 'aktif'`,
    [kramaId]
  );
  const prefix = normalizeNomorKartu(nomorKartu);
  const taken = await db.select<{ nika: string }[]>(
    `SELECT nika FROM anggota_keluarga WHERE krama_id = ? AND nika IS NOT NULL AND nika LIKE ?`,
    [kramaId, `${prefix}__`]
  );
  return resolveNikaForNewAnggota(
    nomorKartu,
    active[0]?.c ?? 0,
    taken.map((r) => r.nika)
  );
}

export async function generateNomorIndukTahunan(
  desaAdatId: string,
  tanggalPencatatan: string,
  jenis: "NRKT" | "NRT"
): Promise<string> {
  const db = await getDb();
  const d = new Date(tanggalPencatatan);
  const tahun = d.getFullYear();
  const bulan = pad2(d.getMonth() + 1);
  const tanggal = pad2(d.getDate());

  const table =
    jenis === "NRKT" ? "penomoran_nrkt_counter" : "penomoran_nrt_counter";

  const existing = await db.select<{ urutan_terakhir: number }[]>(
    `SELECT urutan_terakhir FROM ${table} WHERE desa_adat_id = ? AND tahun = ?`,
    [desaAdatId, tahun]
  );

  let urut: number;
  if (existing[0]) {
    urut = existing[0].urutan_terakhir + 1;
    if (urut > 9999) throw new Error(`Kuota ${jenis} tahun ${tahun} penuh`);
    await db.execute(
      `UPDATE ${table} SET urutan_terakhir = ? WHERE desa_adat_id = ? AND tahun = ?`,
      [urut, desaAdatId, tahun]
    );
  } else {
    urut = 1;
    await db.execute(
      `INSERT INTO ${table} (id, desa_adat_id, tahun, urutan_terakhir) VALUES (?, ?, ?, ?)`,
      [uuid(), desaAdatId, tahun, urut]
    );
  }

  return `${tahun}${bulan}${tanggal}${pad4(urut)}`;
}
