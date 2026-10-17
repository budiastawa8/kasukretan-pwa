import { getDb } from "../db/client";
import { dateToIsoLocal, parseIsoDateString } from "../date-iso";
import {
  getNyadaBerlakuMulai,
  hitungNyadaSejak,
  isKramaNyada,
  isNyadaOtomatisAktif,
  isUmurMencapaiBatasNyada,
  type AlasanNyada,
} from "../nyada-ketentuan";
import {
  jenisDapukanKode,
  keadaanKeluargaDapukan,
  tentukanNyadaOtomatis,
  type AnggotaKeluargaDapukan,
} from "../dapukan-ketentuan";
import type { DesaAdat } from "../types";
import { getDesaAdat } from "./desa";

let batchRunning: Promise<number> | null = null;
let batchCompleted = false;

type KramaNyadaSyncRow = {
  id: string;
  jenis_krama_mipil_id: string | null;
  kepala_penduduk_id: string;
  dapukan_batas: string | null;
  balu_dapukan_sejak: string | null;
  tanggal_lahir: string | null;
};

async function loadAnggotaHidupByKrama(
  kramaIds: string[]
): Promise<Map<string, AnggotaKeluargaDapukan[]>> {
  const map = new Map<string, AnggotaKeluargaDapukan[]>();
  if (kramaIds.length === 0) return map;
  const db = await getDb();
  const CHUNK = 400;
  for (let i = 0; i < kramaIds.length; i += CHUNK) {
    const ids = kramaIds.slice(i, i + CHUNK);
    const placeholders = ids.map((_, j) => `$${j + 1}`).join(", ");
    const rows = await db.select<(AnggotaKeluargaDapukan & { krama_id: string })[]>(
      `SELECT ak.krama_id, ak.penduduk_id, ak.status_keluarga, p.status_kawin
       FROM anggota_keluarga ak
       JOIN penduduk p ON p.id = ak.penduduk_id
       WHERE ak.status = 'aktif' AND COALESCE(p.status_hidup, 'hidup') <> 'meninggal'
         AND ak.krama_id IN (${placeholders})`,
      ids
    );
    for (const r of rows) {
      const list = map.get(r.krama_id) ?? [];
      list.push(r);
      map.set(r.krama_id, list);
    }
  }
  return map;
}

/**
 * Nyada otomatis per umur Pengarep sejak tanggal berlaku, termasuk Krama Dapukan
 * (Anak belum kawin) dan Balu Nglintik. Krama Nyada tidak pernah dikembalikan.
 * @returns jumlah krama yang berubah jenis.
 */
export async function syncNyadaOtomatis(opts?: { kramaId?: string }): Promise<number> {
  const desa = await getDesaAdat();
  if (!desa || !isNyadaOtomatisAktif(desa)) return 0;
  const hariIni = dateToIsoLocal(new Date());

  const db = await getDb();
  let sql = `
    SELECT k.id, k.jenis_krama_mipil_id, k.kepala_penduduk_id, k.dapukan_batas,
           k.balu_dapukan_sejak, p.tanggal_lahir
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
    JOIN penduduk p ON p.id = k.kepala_penduduk_id
    WHERE k.status_krama = 'aktif'
  `;
  const args: unknown[] = [];
  if (opts?.kramaId) {
    sql += ` AND k.id = $1`;
    args.push(opts.kramaId);
  }
  const rows = (await db.select<KramaNyadaSyncRow[]>(sql, args)).filter(
    (r) =>
      !isKramaNyada(r.jenis_krama_mipil_id, desa) ||
      (!!r.balu_dapukan_sejak && !!desa.jenis_balu_nglintik_mipil_id?.trim())
  );
  const anggotaMap = await loadAnggotaHidupByKrama(rows.map((r) => r.id));

  let changed = 0;
  for (const row of rows) {
    const keputusan = tentukanNyadaOtomatis({
      jenisId: row.jenis_krama_mipil_id,
      dapukanBatas: row.dapukan_batas,
      baluDapukanSejak: row.balu_dapukan_sejak,
      pengarepTanggalLahir: row.tanggal_lahir,
      keluarga: keadaanKeluargaDapukan(anggotaMap.get(row.id) ?? [], row.kepala_penduduk_id),
      desa,
      hariIni,
    });
    if (keputusan.aksi === "tetap") {
      const batasBaru = keputusan.dapukanBatas && !row.dapukan_batas ? keputusan.dapukanBatas : null;
      const catatTanpaPasangan =
        keputusan.tanpaPasangan === true && !row.balu_dapukan_sejak ? hariIni : null;
      const hapusTanpaPasangan =
        keputusan.tanpaPasangan === false && !!row.balu_dapukan_sejak;
      if (batasBaru || catatTanpaPasangan || hapusTanpaPasangan) {
        await db.execute(
          `UPDATE krama SET
             dapukan_batas = COALESCE($1, dapukan_batas),
             balu_dapukan_sejak = CASE
               WHEN $3 = 1 THEN NULL
               WHEN $2 IS NOT NULL THEN $2
               ELSE balu_dapukan_sejak
             END
           WHERE id = $4`,
          [batasBaru, catatTanpaPasangan, hapusTanpaPasangan ? 1 : 0, row.id]
        );
      }
      continue;
    }
    if (keputusan.aksi === "nyada") {
      await db.execute(
        `UPDATE krama SET jenis_krama_mipil_id = $1, jenis_sebelum_nyada_id = $2,
           nyada_sejak = $3, nyada_sampai = NULL, alasan_nyada = $4, keterangan_nyada = $5,
           updated_at = datetime('now')
         WHERE id = $6`,
        [keputusan.jenisId, row.jenis_krama_mipil_id, keputusan.sejak, keputusan.alasan, keputusan.keterangan, row.id]
      );
    } else {
      await db.execute(
        `UPDATE krama SET jenis_krama_mipil_id = $1, jenis_sebelum_nyada_id = $2,
           nyada_sejak = $3, nyada_sampai = NULL, alasan_nyada = NULL, keterangan_nyada = NULL,
           dapukan_batas = $4, balu_dapukan_sejak = $5, updated_at = datetime('now')
         WHERE id = $6`,
        [
          keputusan.jenisId,
          row.jenis_krama_mipil_id,
          keputusan.sejak,
          keputusan.dapukanBatas,
          keputusan.tanpaPasangan ? row.balu_dapukan_sejak || keputusan.sejak : null,
          row.id,
        ]
      );
    }
    changed++;
  }
  return changed;
}

export type KramaDapukanRingkas = {
  id: string;
  nomor_kartu: string;
  kepala_nama: string;
  jenis_nama: string | null;
};

/** Krama aktif berjenis Dapukan (dampak bila Krama Dapukan dimatikan; termasuk warisan Balu Dapukan). */
export async function listKramaDapukanAktif(
  desa: DesaAdat | null | undefined
): Promise<KramaDapukanRingkas[]> {
  const ids = [...new Set(
    [desa?.jenis_dapukan_mipil_id, desa?.jenis_balu_dapukan_mipil_id]
      .map((id) => id?.trim())
      .filter((id): id is string => !!id)
  )];
  if (ids.length === 0) return [];
  const db = await getDb();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  return db.select<KramaDapukanRingkas[]>(
    `SELECT k.id, k.nomor_kartu, p.nama_lengkap as kepala_nama, jm.nama as jenis_nama
     FROM krama k
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     WHERE k.status_krama = 'aktif' AND k.jenis_krama_mipil_id IN (${placeholders})
     ORDER BY k.nomor_kartu`,
    ids
  );
}

/** Krama Dapukan tidak diterapkan lagi: semua krama Dapukan menjadi Nyada hari ini. */
export async function akhiriKramaDapukan(desaSebelum: DesaAdat | null | undefined): Promise<number> {
  const jenisNyadaId = desaSebelum?.jenis_krama_mipil_id?.trim();
  if (!jenisNyadaId) throw new Error("Jenis Krama (nyada) belum diatur di Profil Desa");
  const daftar = await listKramaDapukanAktif(desaSebelum);
  if (daftar.length === 0) return 0;
  const db = await getDb();
  const hariIni = dateToIsoLocal(new Date());
  for (const k of daftar) {
    await db.execute(
      `UPDATE krama SET jenis_sebelum_nyada_id = jenis_krama_mipil_id, jenis_krama_mipil_id = $1,
         nyada_sejak = $2, nyada_sampai = NULL, alasan_nyada = 'dapukan',
         keterangan_nyada = 'Krama Dapukan tidak diterapkan lagi', updated_at = datetime('now')
       WHERE id = $3`,
      [jenisNyadaId, hariIni, k.id]
    );
  }
  return daftar.length;
}

/** Jalankan Nyada otomatis sekali per sesi (background). */
export function runSyncNyadaOtomatisBackground(): void {
  if (batchCompleted || batchRunning) return;
  batchRunning = syncNyadaOtomatis()
    .catch(() => 0)
    .finally(() => {
      batchCompleted = true;
      batchRunning = null;
    });
}

/** Nyada ditetapkan manual sebelum Pengarep mencapai batas umur (mis. cacat tetap). */
export type NyadaManualInput = {
  alasan: AlasanNyada;
  /** Tanggal keputusan/berlaku (YYYY-MM-DD); iuran yang belum jatuh tempo ikut 0%. */
  tanggalBerlaku: string;
  keterangan?: string;
};

/**
 * Catat Nyada saat jenis krama diubah manual.
 * Ke Nyada: simpan jenis sebelumnya, tanggal efektif, dan alasan.
 * Dari Nyada ke jenis lain: catat akhir masa Nyada (hari ini).
 */
export async function catatPerubahanJenisNyada(params: {
  kramaId: string;
  jenisLamaId: string | null | undefined;
  jenisBaruId: string | null | undefined;
  pengarepTanggalLahir: string | null | undefined;
  nyadaManual?: NyadaManualInput | null;
  desa?: DesaAdat | null;
}): Promise<void> {
  const lama = params.jenisLamaId?.trim() || null;
  const baru = params.jenisBaruId?.trim() || null;
  if (lama === baru) return;

  const desa = params.desa ?? (await getDesaAdat());
  const db = await getDb();
  if (isKramaNyada(lama, desa) && isKramaNyada(baru, desa)) return;

  if (jenisDapukanKode(baru, desa)) {
    const hariIni = dateToIsoLocal(new Date());
    await db.execute(
      `UPDATE krama SET jenis_sebelum_nyada_id = $1, nyada_sejak = $2, nyada_sampai = NULL,
         alasan_nyada = NULL, keterangan_nyada = NULL, dapukan_batas = NULL,
         balu_dapukan_sejak = NULL
       WHERE id = $3`,
      [lama, hariIni, params.kramaId]
    );
    return;
  }

  if (!isKramaNyada(baru, desa)) {
    if (isKramaNyada(lama, desa)) {
      await db.execute(`UPDATE krama SET nyada_sampai = $1 WHERE id = $2`, [
        dateToIsoLocal(new Date()),
        params.kramaId,
      ]);
    }
    return;
  }

  const manual = params.nyadaManual;
  const tanggalManual = parseIsoDateString(manual?.tanggalBerlaku);
  if (manual && tanggalManual) {
    await db.execute(
      `UPDATE krama SET jenis_sebelum_nyada_id = $1, nyada_sejak = $2, nyada_sampai = NULL,
         alasan_nyada = $3, keterangan_nyada = $4
       WHERE id = $5`,
      [lama, tanggalManual, manual.alasan, manual.keterangan?.trim() || null, params.kramaId]
    );
    return;
  }

  const alasan: AlasanNyada =
    baru === desa?.jenis_balu_nglintik_mipil_id?.trim() || jenisDapukanKode(lama, desa)
      ? "dapukan"
      : isUmurMencapaiBatasNyada(params.pengarepTanggalLahir, desa?.jenis_umur_nyada)
        ? "umur"
        : "keputusan";
  if (getNyadaBerlakuMulai(desa)) {
    const hariIni = dateToIsoLocal(new Date());
    const sejakUmur = hitungNyadaSejak(params.pengarepTanggalLahir, desa);
    const sejak = sejakUmur && sejakUmur <= hariIni ? sejakUmur : hariIni;
    await db.execute(
      `UPDATE krama SET jenis_sebelum_nyada_id = $1, nyada_sejak = $2, nyada_sampai = NULL,
         alasan_nyada = $3, keterangan_nyada = NULL
       WHERE id = $4`,
      [lama, sejak, alasan, params.kramaId]
    );
    return;
  }
  await db.execute(
    `UPDATE krama SET jenis_sebelum_nyada_id = NULL, nyada_sejak = NULL, nyada_sampai = NULL,
       alasan_nyada = $1, keterangan_nyada = NULL
     WHERE id = $2`,
    [alasan, params.kramaId]
  );
}
