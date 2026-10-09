import { getDb } from "./db/client";
import { pad3, pad4, uuid } from "./utils";
import { bulanKeRomawi } from "./penomoran-sp";

export function formatNomorSuratKeteranganPindah(
  urut: number,
  kodeDesaAdat: string,
  bulan: number,
  tahun: number
): string {
  const kode = pad4(kodeDesaAdat.replace(/\D/g, "").slice(-4) || kodeDesaAdat);
  return `SKP/${pad3(urut)}/${kode}/${bulanKeRomawi(bulan)}/${tahun}`;
}

function parseTanggalTerbit(tanggalTerbit: string): { tahun: number; bulan: number } {
  const d = new Date(tanggalTerbit.trim().slice(0, 10));
  if (Number.isNaN(d.getTime())) throw new Error("Tanggal terbit surat tidak valid");
  return { tahun: d.getFullYear(), bulan: d.getMonth() + 1 };
}

export async function allocateNomorSuratKeteranganPindah(
  desaAdatId: string,
  tanggalTerbit: string
): Promise<string> {
  const db = await getDb();
  const desa = await db.select<{ kode_desa_adat: string }[]>(
    `SELECT kode_desa_adat FROM desa_adat WHERE id = ?`,
    [desaAdatId]
  );
  const kode = desa[0]?.kode_desa_adat?.trim();
  if (!kode || kode.length !== 4) {
    throw new Error("Kode desa adat belum lengkap. Lengkapi di Pengaturan → Setup Wilayah.");
  }

  const { tahun, bulan } = parseTanggalTerbit(tanggalTerbit);
  const existing = await db.select<{ urutan_terakhir: number }[]>(
    `SELECT urutan_terakhir FROM penomoran_skp_counter WHERE desa_adat_id = ? AND tahun = ?`,
    [desaAdatId, tahun]
  );

  let urut: number;
  if (existing[0]) {
    urut = existing[0].urutan_terakhir + 1;
    if (urut > 999) throw new Error(`Kuota nomor surat keterangan pindah tahun ${tahun} penuh`);
    await db.execute(
      `UPDATE penomoran_skp_counter SET urutan_terakhir = ? WHERE desa_adat_id = ? AND tahun = ?`,
      [urut, desaAdatId, tahun]
    );
  } else {
    urut = 1;
    await db.execute(
      `INSERT INTO penomoran_skp_counter (id, desa_adat_id, tahun, urutan_terakhir) VALUES (?, ?, ?, ?)`,
      [uuid(), desaAdatId, tahun, urut]
    );
  }

  return formatNomorSuratKeteranganPindah(urut, kode, bulan, tahun);
}
