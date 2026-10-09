import { getDb } from "../db/client";
import { normalizeKramaStatus } from "../krama-status";
import { syncStatusIlikitaStored } from "./krama-ilikita-sync";
import { getKramaDetail } from "./krama-query";

/** Mengaktifkan kembali krama yang dinonaktifkan (meninggal/pindah). */
export async function reaktivasiKrama(kramaId: string): Promise<void> {
  const existing = await getKramaDetail(kramaId);
  if (!existing) throw new Error("Krama tidak ditemukan");
  if (normalizeKramaStatus(existing.status_krama) !== "nonaktif") {
    throw new Error("Krama sudah aktif");
  }

  const db = await getDb();
  await db.execute(
    `UPDATE krama SET
      status_krama = 'aktif',
      alasan_tidak_aktif = NULL,
      tanggal_tidak_aktif = NULL,
      keterangan_tidak_aktif = NULL,
      updated_at = datetime('now')
    WHERE id = $1`,
    [kramaId]
  );

  const refreshed = await getKramaDetail(kramaId);
  if (refreshed) await syncStatusIlikitaStored(refreshed);
}

/** Nonaktifkan krama dengan alasan pindah (setelah SKP keluarga, opsional). */
export async function nonaktifkanKramaPindah(
  kramaId: string,
  tanggalTidakAktif: string,
  keteranganTidakAktif?: string
): Promise<void> {
  const existing = await getKramaDetail(kramaId);
  if (!existing) throw new Error("Krama tidak ditemukan");
  if (normalizeKramaStatus(existing.status_krama) !== "aktif") {
    throw new Error("Krama sudah nonaktif");
  }
  const tanggal = tanggalTidakAktif.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    throw new Error("Tanggal tidak aktif tidak valid");
  }

  const db = await getDb();
  await db.execute(
    `UPDATE krama SET
      status_krama = 'nonaktif',
      alasan_tidak_aktif = 'pindah',
      tanggal_tidak_aktif = $1,
      keterangan_tidak_aktif = $2,
      status_pipil = 'tidak_aktif',
      status_pemasih = 'tidak_aktif',
      updated_at = datetime('now')
    WHERE id = $3`,
    [tanggal, keteranganTidakAktif?.trim() || null, kramaId]
  );

  const refreshed = await getKramaDetail(kramaId);
  if (refreshed) await syncStatusIlikitaStored(refreshed);
}

/** Hapus krama beserta anggota dan riwayat keuangan terkait (desktop). */
export async function deleteKrama(kramaId: string): Promise<void> {
  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");

  const pendudukIds = new Set<string>([krama.kepala.id]);
  for (const a of krama.anggota_aktif) {
    pendudukIds.add(a.penduduk_id);
  }

  const db = await getDb();
  await db.execute(`DELETE FROM paturunan_pembayaran WHERE krama_id = $1`, [kramaId]);
  await db.execute(`DELETE FROM paturunan_lunas_krama WHERE krama_id = $1`, [kramaId]);
  await db.execute(`DELETE FROM dudukan_pembayaran WHERE krama_id = $1`, [kramaId]);
  await db.execute(`DELETE FROM dudukan_keringanan WHERE krama_id = $1`, [kramaId]);
  await db.execute(`DELETE FROM krama_riwayat_klasifikasi WHERE krama_id = $1`, [kramaId]);
  await db.execute(`DELETE FROM anggota_keluarga WHERE krama_id = $1`, [kramaId]);
  await db.execute(`DELETE FROM krama WHERE id = $1`, [kramaId]);

  for (const pid of pendudukIds) {
    const anggotaRef = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM anggota_keluarga WHERE penduduk_id = $1`,
      [pid]
    );
    const kepalaRef = await db.select<{ c: number }[]>(
      `SELECT COUNT(*) as c FROM krama WHERE kepala_penduduk_id = $1`,
      [pid]
    );
    if ((anggotaRef[0]?.c ?? 0) === 0 && (kepalaRef[0]?.c ?? 0) === 0) {
      await db.execute(`DELETE FROM penduduk WHERE id = $1`, [pid]);
    }
  }
}
