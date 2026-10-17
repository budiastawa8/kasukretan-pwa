import { getDb } from "../db/client";
import {
  generateNika,
  generateNomorIndukTahunan,
  generateNomorKartu,
} from "../penomoran";
import type { KramaDetail, Penduduk } from "../types";
import { agamaForPenduduk, assertAgamaTamiu } from "../agama-tamiu";
import { normalizeKramaStatus } from "../krama-status";
import {
  isKramaNyada,
  isUmurMencapaiBatasNyada,
  resolveJenisSetelahLepasNyada,
} from "../nyada-ketentuan";
import { isJenisBaluNglintik, isStatusPasangan, jenisDapukanKode } from "../dapukan-ketentuan";
import { STATUS_KAWIN_KODE, normalizeStatusKawinKode } from "../status-kawin";
import { parseTanggalTerdaftarIso } from "../date-iso";
import { today, uuid } from "../utils";
import {
  gelarKepalaLabel,
  gelarKepalaStatus,
  formatStatusKeluarga,
  isAnggotaGelarKepalaRow,
  isGelarKepalaStatus,
  isKepalaPenduduk,
  isValidStatusKeluarga,
  isValidStatusKeluargaMipil,
  statusSetelahCabutGelar,
} from "../status-keluarga";
import { getDesaAdat, isDesaConfigured } from "./desa";
import { countJenisByKlasifikasi } from "./master";
import { syncStatusIlikitaStored } from "./krama-ilikita-sync";
import { syncNyadaOtomatis } from "./nyada-otomatis";
import type { AddAnggotaInput, UpdateAnggotaInput } from "./krama-input";
import { getKramaDetail } from "./krama-query";

export type { AddAnggotaInput, UpdateAnggotaInput } from "./krama-input";

export async function addAnggota(input: AddAnggotaInput): Promise<string> {
  const krama = await getKramaDetail(input.kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");
  if (normalizeKramaStatus(krama.status_krama) !== "aktif") {
    throw new Error("Tidak dapat menambah anggota pada krama nonaktif");
  }

  const db = await getDb();
  const desa = await getDesaAdat();
  const pendudukId = uuid();
  const anggotaId = uuid();
  const tgl = input.tanggalPencatatan ?? today();
  const kode = krama.klasifikasi_kode;

  if (kode === "TAMIU") assertAgamaTamiu(input.penduduk.agama);

  {
    const nikTrim = input.penduduk.nik_atau_nika?.trim() || null;
    const isMipil = kode === "MIPIL";
    await db.execute(
      `INSERT INTO penduduk (id, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir, status_kawin, pekerjaan, nama_ibu, nama_ayah, nik_kependudukan, nik_atau_nika, agama, foto_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pendudukId,
        input.penduduk.nama_lengkap,
        input.penduduk.jenis_kelamin,
        input.penduduk.tempat_lahir ?? null,
        input.penduduk.tanggal_lahir ?? null,
        input.penduduk.status_kawin ?? null,
        input.penduduk.pekerjaan ?? null,
        input.penduduk.nama_ibu ?? null,
        input.penduduk.nama_ayah ?? null,
        isMipil ? nikTrim : null,
        !isMipil ? nikTrim : null,
        agamaForPenduduk(kode, input.penduduk.agama),
        input.penduduk.foto_url?.trim() || null,
      ]
    );
  }

  const gelarLabel = gelarKepalaLabel(kode);

  if (krama.klasifikasi_kode === "MIPIL") {
    const status = formatStatusKeluarga(input.statusKeluarga, kode);
    if (isGelarKepalaStatus(status, kode)) {
      throw new Error(
        `${gelarLabel} ditetapkan lewat ubah status anggota, bukan saat menambah anggota baru`
      );
    }
    if (!isValidStatusKeluargaMipil(status)) {
      throw new Error("Status keluarga tidak valid");
    }
    const { nika, urut } = await generateNika(input.kramaId, krama.nomor_kartu);
    await db.execute(
      `INSERT INTO anggota_keluarga (id, krama_id, penduduk_id, status_keluarga, urut_dalam_keluarga, nika, masuk_pada, nomor_induk_diterbitkan_pada)
       VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
      [anggotaId, input.kramaId, pendudukId, status, urut, nika, tgl]
    );
  } else {
    const status = formatStatusKeluarga(input.statusKeluarga, kode);
    if (isGelarKepalaStatus(status, kode)) {
      throw new Error(
        `${gelarLabel} ditetapkan lewat ubah status anggota, bukan saat menambah anggota baru`
      );
    }
    if (!isValidStatusKeluarga(status, kode)) {
      throw new Error("Status keluarga tidak valid");
    }
    if (!input.penduduk.nik_atau_nika) throw new Error("NIK/NIKA wajib");
    const jenis = krama.klasifikasi_kode === "KRAMA_TAMIU" ? "NRKT" : "NRT";
    const induk = await generateNomorIndukTahunan(desa!.id, tgl, jenis);
    const col = jenis === "NRKT" ? "nrkt" : "nrt";
    await db.execute(
      `INSERT INTO anggota_keluarga (id, krama_id, penduduk_id, status_keluarga, ${col}, tanggal_pencatatan, masuk_pada, nomor_induk_diterbitkan_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [anggotaId, input.kramaId, pendudukId, status, induk, tgl, tgl]
    );
  }
  return anggotaId;
}

/** Hapus status Pengarep/Pengajeg lama (data legacy); tidak mengubah status keluarga biasa (mis. Istri). */
async function clearLegacyGelarStatusOnOthers(
  db: Awaited<ReturnType<typeof getDb>>,
  krama: KramaDetail,
  exceptAnggotaId: string
): Promise<void> {
  const kode = krama.klasifikasi_kode;
  for (const a of krama.anggota_aktif) {
    if (a.anggota_id === exceptAnggotaId) continue;
    if (!isGelarKepalaStatus(a.status_keluarga, kode)) continue;
    const pengganti = statusSetelahCabutGelar(a.jenis_kelamin, kode);
    await db.execute(`UPDATE anggota_keluarga SET status_keluarga = $1 WHERE id = $2`, [
      pengganti,
      a.anggota_id,
    ]);
  }
}

/** Tetapkan Pengarep/Pengajeg lewat kepala_penduduk_id; status keluarga anggota tidak diubah. */
export async function setKramaKepala(kramaId: string, anggotaId: string): Promise<void> {
  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");

  const target = krama.anggota_aktif.find((a) => a.anggota_id === anggotaId);
  if (!target) throw new Error("Anggota tidak ditemukan");

  const db = await getDb();
  await clearLegacyGelarStatusOnOthers(db, krama, anggotaId);
  await db.execute(
    `UPDATE krama SET kepala_penduduk_id = $1, updated_at = datetime('now') WHERE id = $2`,
    [target.penduduk_id, kramaId]
  );
}

export type GantiPengarepMeninggalInput = {
  kramaId: string;
  /** anggota_id pengganti (mis. istri). */
  penggantiAnggotaId: string;
  tanggalMeninggal: string;
  /** Krama Nyada: tetap Nyada meskipun umur pengganti di bawah batas. */
  pertahankanNyada: boolean;
};

/**
 * Pengarep meninggal: pengganti menjadi Pengarep, Pengarep lama dikeluarkan (arsip) dan
 * ditandai meninggal. Kartu tetap aktif.
 */
export async function gantiPengarepMeninggal(input: GantiPengarepMeninggalInput): Promise<void> {
  const krama = await getKramaDetail(input.kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");
  if (krama.klasifikasi_kode !== "MIPIL") throw new Error("Hanya untuk Krama Mipil");

  const lama = krama.anggota_aktif.find((a) => isKepalaPenduduk(a.penduduk_id, krama.kepala.id));
  const pengganti = krama.anggota_aktif.find((a) => a.anggota_id === input.penggantiAnggotaId);
  if (!pengganti) throw new Error("Anggota pengganti tidak ditemukan");
  if (pengganti.penduduk_id === krama.kepala.id) {
    throw new Error("Pengganti tidak boleh Pengarep yang meninggal");
  }
  const tanggal = parseTanggalTerdaftarIso(input.tanggalMeninggal);

  const desa = await getDesaAdat();
  const kodeDapukan = jenisDapukanKode(krama.jenis_krama_mipil_id, desa);
  if ((kodeDapukan || isJenisBaluNglintik(krama.jenis_krama_mipil_id, desa)) && !isStatusPasangan(pengganti.status_keluarga)) {
    throw new Error(
      "Pengarep Krama Dapukan hanya dapat digantikan oleh istri/suami. Bila tidak ada, nonaktifkan kartu."
    );
  }
  const kramaNyada = isKramaNyada(krama.jenis_krama_mipil_id, desa);
  const jenisTanpaNyada = kramaNyada && !input.pertahankanNyada
    ? resolveJenisSetelahLepasNyada(krama, desa)
    : null;
  if (kramaNyada && !input.pertahankanNyada && !jenisTanpaNyada) {
    throw new Error(
      "Jenis krama pengganti belum ditentukan. Atur Jenis Krama (Cerai Mati) di Master Data → Profil Desa."
    );
  }

  const db = await getDb();
  await clearLegacyGelarStatusOnOthers(db, krama, pengganti.anggota_id);
  await db.execute(
    `UPDATE krama SET kepala_penduduk_id = $1, updated_at = datetime('now') WHERE id = $2`,
    [pengganti.penduduk_id, input.kramaId]
  );
  await db.execute(
    `UPDATE penduduk SET status_hidup = 'meninggal', updated_at = datetime('now') WHERE id = $1`,
    [krama.kepala.id]
  );
  if (lama) {
    await db.execute(
      `UPDATE anggota_keluarga SET status = 'nonaktif', keluar_pada = $1 WHERE id = $2`,
      [tanggal, lama.anggota_id]
    );
  }
  if (
    /istri|suami/i.test(pengganti.status_keluarga ?? "") &&
    normalizeStatusKawinKode(pengganti.status_kawin) === STATUS_KAWIN_KODE.KAWIN
  ) {
    await db.execute(
      `UPDATE penduduk SET status_kawin = $1, updated_at = datetime('now') WHERE id = $2`,
      [STATUS_KAWIN_KODE.CERAI_MATI, pengganti.penduduk_id]
    );
  }

  if (jenisTanpaNyada) {
    await db.execute(
      `UPDATE krama SET jenis_krama_mipil_id = $1, nyada_sampai = $2, updated_at = datetime('now')
       WHERE id = $3`,
      [jenisTanpaNyada, tanggal, input.kramaId]
    );
  } else if (kramaNyada) {
    const alasan = isUmurMencapaiBatasNyada(pengganti.tanggal_lahir, desa?.jenis_umur_nyada)
      ? "umur"
      : "pengganti";
    await db.execute(
      `UPDATE krama SET alasan_nyada = $1, keterangan_nyada = NULL, updated_at = datetime('now')
       WHERE id = $2`,
      [alasan, input.kramaId]
    );
  } else if (kodeDapukan === "dapukan") {
    const penggantiLewatBatas = isUmurMencapaiBatasNyada(
      pengganti.tanggal_lahir,
      desa?.batas_umur_dapukan
    );
    if (penggantiLewatBatas) {
      const jenisNyada = desa?.jenis_krama_mipil_id?.trim();
      if (jenisNyada) {
        await db.execute(
          `UPDATE krama SET jenis_sebelum_nyada_id = jenis_krama_mipil_id, jenis_krama_mipil_id = $1,
             nyada_sejak = $2, nyada_sampai = NULL, alasan_nyada = 'dapukan',
             keterangan_nyada = 'Pengganti sudah mencapai batas umur Krama Dapukan',
             balu_dapukan_sejak = NULL, updated_at = datetime('now')
           WHERE id = $3`,
          [jenisNyada, tanggal, input.kramaId]
        );
      }
    } else {
      // Tetap Dapukan; catat tanpa pasangan untuk jalur Balu Nglintik.
      await db.execute(
        `UPDATE krama SET balu_dapukan_sejak = COALESCE(balu_dapukan_sejak, $1),
           updated_at = datetime('now')
         WHERE id = $2`,
        [tanggal, input.kramaId]
      );
    }
  }
  if (kodeDapukan) await syncNyadaOtomatis({ kramaId: input.kramaId });

  const refreshed = await getKramaDetail(input.kramaId);
  if (refreshed) {
    await syncStatusIlikitaStored(refreshed);
    const { tryAutoPushKrama } = await import("../sync/auto-push-krama");
    void tryAutoPushKrama(input.kramaId);
  }
}

export async function updateAnggota(input: UpdateAnggotaInput): Promise<void> {
  const krama = await getKramaDetail(input.kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");

  const target = krama.anggota_aktif.find((a) => a.anggota_id === input.anggotaId);
  if (!target) throw new Error("Anggota tidak ditemukan");

  const db = await getDb();
  const kode = krama.klasifikasi_kode;
  const isMipil = kode === "MIPIL";

  if (kode === "TAMIU") assertAgamaTamiu(input.penduduk.agama);

  {
    const nikTrim = input.penduduk.nik_atau_nika?.trim() || null;
    await db.execute(
      `UPDATE penduduk SET
        nama_lengkap = $1, jenis_kelamin = $2, tempat_lahir = $3, tanggal_lahir = $4,
        status_kawin = $5, pekerjaan = $6, nama_ibu = $7, nama_ayah = $8,
        nik_kependudukan = $9, nik_atau_nika = $10, agama = $11, foto_url = $12,
        updated_at = datetime('now')
      WHERE id = $13`,
      [
        input.penduduk.nama_lengkap,
        input.penduduk.jenis_kelamin,
        input.penduduk.tempat_lahir ?? null,
        input.penduduk.tanggal_lahir ?? null,
        input.penduduk.status_kawin ?? null,
        input.penduduk.pekerjaan ?? null,
        isMipil ? (input.penduduk.nama_ibu ?? null) : null,
        isMipil ? (input.penduduk.nama_ayah ?? null) : null,
        isMipil ? nikTrim : null,
        !isMipil ? nikTrim : null,
        agamaForPenduduk(kode, input.penduduk.agama),
        input.penduduk.foto_url?.trim() || null,
        target.penduduk_id,
      ]
    );
  }

  if (input.statusKeluarga !== undefined) {
    const isKepala = isKepalaPenduduk(target.penduduk_id, krama.kepala.id);
    if (isKepala) {
      // Kepala (Pengarep/Pengajeg): data penduduk saja; peran kepala lewat penunjukan terpisah
    } else {
      await updateAnggotaStatusKeluarga(input.kramaId, input.anggotaId, input.statusKeluarga);
    }
  }
}

function assertCanRemoveAnggota(
  krama: KramaDetail,
  anggotaId: string
): NonNullable<KramaDetail["anggota_aktif"][number]> {
  const target = krama.anggota_aktif.find((a) => a.anggota_id === anggotaId);
  if (!target) throw new Error("Anggota tidak ditemukan");

  const kode = krama.klasifikasi_kode;
  if (
    isAnggotaGelarKepalaRow(target.penduduk_id, target.status_keluarga, krama.kepala.id, kode)
  ) {
    throw new Error(
      `Tidak dapat menghapus ${gelarKepalaLabel(kode)}. Tetapkan pengganti terlebih dahulu.`
    );
  }

  if (krama.anggota_aktif.length <= 1) {
    throw new Error("Keluarga harus memiliki minimal satu anggota");
  }

  return target;
}

/** Keluar resmi (pindah/meninggal/SKP/intra desa): nonaktifkan, NIKA tetap di arsip. */
export async function deleteAnggota(kramaId: string, anggotaId: string): Promise<void> {
  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");
  assertCanRemoveAnggota(krama, anggotaId);

  const db = await getDb();
  await db.execute(
    `UPDATE anggota_keluarga SET status = 'nonaktif', keluar_pada = $1 WHERE id = $2`,
    [today(), anggotaId]
  );
}

/** Hapus manual/koreksi dari form krama: nonaktifkan dan lepas NIKA agar slot bisa dipakai lagi. */
export async function releaseAnggotaManual(kramaId: string, anggotaId: string): Promise<void> {
  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");
  assertCanRemoveAnggota(krama, anggotaId);

  const db = await getDb();
  await db.execute(
    `UPDATE anggota_keluarga SET status = 'nonaktif', keluar_pada = $1, nika = NULL, urut_dalam_keluarga = NULL WHERE id = $2`,
    [today(), anggotaId]
  );
}

/** Tambah anggota Mipil dengan penduduk yang sudah ada (pindah antar Pipil). */
export async function addAnggotaExistingPenduduk(input: {
  kramaId: string;
  pendudukId: string;
  statusKeluarga: string;
  tanggalMasuk?: string;
  /** Krama sumber — diabaikan saat cek keanggotaan aktif (transfer intra desa). */
  excludeActiveKramaId?: string;
}): Promise<string> {
  const krama = await getKramaDetail(input.kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");
  if (normalizeKramaStatus(krama.status_krama) !== "aktif") {
    throw new Error("Tidak dapat menambah anggota pada krama nonaktif");
  }
  if (krama.klasifikasi_kode !== "MIPIL") {
    throw new Error("Gabung antar kartu intra desa saat ini hanya untuk Mipil");
  }

  const sudahAnggota = krama.anggota_aktif.some((a) => a.penduduk_id === input.pendudukId);
  if (sudahAnggota) {
    throw new Error("Penduduk sudah terdaftar sebagai anggota aktif pada Pipil ini");
  }

  const db = await getDb();
  let sqlLain = `SELECT COUNT(*) as c FROM anggota_keluarga ak
     JOIN krama k ON k.id = ak.krama_id
     WHERE ak.penduduk_id = $1 AND ak.status = 'aktif' AND k.status_krama = 'aktif'`;
  const argsLain: unknown[] = [input.pendudukId];
  if (input.excludeActiveKramaId) {
    sqlLain += ` AND k.id != $2`;
    argsLain.push(input.excludeActiveKramaId);
  }
  const lainAktif = await db.select<{ c: number }[]>(sqlLain, argsLain);
  if ((lainAktif[0]?.c ?? 0) > 0) {
    throw new Error("Penduduk masih terdaftar aktif pada Pipil lain");
  }

  const kode = krama.klasifikasi_kode;
  const status = formatStatusKeluarga(input.statusKeluarga, kode);
  if (isGelarKepalaStatus(status, kode)) {
    throw new Error(`${gelarKepalaLabel(kode)} tidak dapat ditetapkan lewat gabung Pipil`);
  }
  if (!isValidStatusKeluargaMipil(status)) {
    throw new Error("Status keluarga tidak valid");
  }

  const anggotaId = uuid();
  const tgl = input.tanggalMasuk?.trim().slice(0, 10) || today();
  const { nika, urut } = await generateNika(input.kramaId, krama.nomor_kartu);
  await db.execute(
    `INSERT INTO anggota_keluarga (id, krama_id, penduduk_id, status_keluarga, urut_dalam_keluarga, nika, masuk_pada, nomor_induk_diterbitkan_pada)
     VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
    [anggotaId, input.kramaId, input.pendudukId, status, urut, nika, tgl]
  );
  return anggotaId;
}

/** Daftar Pipil baru; kepala memakai penduduk yang sudah ada. */
export async function createMipilWithExistingKepala(input: {
  pendudukId: string;
  statusKeluargaKepala?: string;
  banjarId: string;
  banjarKode: string;
  tempekId?: string;
  arahanId?: string;
  jenisMipilId?: string;
  alamat?: string;
  keterangan?: string;
  tanggalTerdaftar?: string;
  nomorKontak?: string;
  excludeActiveKramaId?: string;
}): Promise<string> {
  const desa = await getDesaAdat();
  if (!isDesaConfigured(desa)) {
    throw new Error("Lengkapi konfigurasi desa adat terlebih dahulu");
  }

  const jenisCount = await countJenisByKlasifikasi("MIPIL");
  if (jenisCount === 0) {
    throw new Error("Tambahkan jenis Mipil pada master data terlebih dahulu");
  }

  const db = await getDb();
  const pendudukRows = await db.select<Penduduk[]>(
    `SELECT * FROM penduduk WHERE id = $1`,
    [input.pendudukId]
  );
  if (!pendudukRows[0]) throw new Error("Data penduduk tidak ditemukan");

  let sqlLain = `SELECT COUNT(*) as c FROM anggota_keluarga ak
     JOIN krama k ON k.id = ak.krama_id
     WHERE ak.penduduk_id = $1 AND ak.status = 'aktif' AND k.status_krama = 'aktif'`;
  const argsLain: unknown[] = [input.pendudukId];
  if (input.excludeActiveKramaId) {
    sqlLain += ` AND k.id != $2`;
    argsLain.push(input.excludeActiveKramaId);
  }
  const lainAktif = await db.select<{ c: number }[]>(sqlLain, argsLain);
  if ((lainAktif[0]?.c ?? 0) > 0) {
    throw new Error("Penduduk masih terdaftar aktif pada Pipil lain");
  }

  const klas = await db.select<{ id: string; prefix_kartu: string }[]>(
    `SELECT id, prefix_kartu FROM klasifikasi_krama WHERE kode = 'MIPIL'`
  );
  if (!klas[0]) throw new Error("Klasifikasi Mipil tidak valid");

  const nomorKartu = await generateNomorKartu(desa!.id, input.banjarId, input.banjarKode);
  const kramaId = uuid();
  const tgl = input.tanggalTerdaftar?.trim()
    ? parseTanggalTerdaftarIso(input.tanggalTerdaftar)
    : today();

  const statusKepalaRaw =
    input.statusKeluargaKepala?.trim() ||
    (pendudukRows[0].jenis_kelamin === "L" ? "Suami" : "Istri");
  const statusKepala = formatStatusKeluarga(statusKepalaRaw, "MIPIL");
  if (!isValidStatusKeluargaMipil(statusKepala)) {
    throw new Error("Status keluarga kepala tidak valid");
  }

  await db.execute(
    `INSERT INTO krama (
      id, nomor_kartu, jenis_kartu, desa_adat_id, banjar_id, tempek_id, arahan_id,
      alamat, keterangan, rt_btn, asal_desa_adat, asal_kecamatan, asal_kabupaten, asal_provinsi,
      klasifikasi_krama_id, jenis_krama_mipil_id, jenis_krama_tamiu_id, jenis_tamiu_id,
      kepala_penduduk_id, tanggal_terdaftar, nomor_kontak, status_krama,
      status_pipil, status_pemasih, tanggal_berlaku_mulai_pemasih,
      alasan_tidak_aktif, tanggal_tidak_aktif, keterangan_tidak_aktif
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
    [
      kramaId,
      nomorKartu,
      klas[0].prefix_kartu,
      desa!.id,
      input.banjarId,
      input.tempekId ?? null,
      input.arahanId ?? null,
      input.alamat ?? null,
      input.keterangan ?? null,
      null,
      null,
      null,
      null,
      null,
      klas[0].id,
      input.jenisMipilId ?? null,
      null,
      null,
      input.pendudukId,
      tgl,
      input.nomorKontak?.trim() || null,
      "aktif",
      "aktif",
      "aktif",
      null,
      null,
      null,
      null,
    ]
  );

  const anggotaId = uuid();
  const { nika, urut } = await generateNika(kramaId, nomorKartu);
  await db.execute(
    `INSERT INTO anggota_keluarga (id, krama_id, penduduk_id, status_keluarga, urut_dalam_keluarga, nika, masuk_pada, nomor_induk_diterbitkan_pada)
     VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
    [anggotaId, kramaId, input.pendudukId, statusKepala, urut, nika, tgl]
  );

  const refreshed = await getKramaDetail(kramaId);
  if (refreshed) await syncStatusIlikitaStored(refreshed);

  return kramaId;
}

export async function updateAnggotaStatusKeluarga(
  kramaId: string,
  anggotaId: string,
  newStatusRaw: string
): Promise<void> {
  const krama = await getKramaDetail(kramaId);
  if (!krama) throw new Error("Krama tidak ditemukan");

  const kode = krama.klasifikasi_kode;
  const gelar = gelarKepalaStatus(kode);
  const gelarLabel = gelarKepalaLabel(kode);

  const newStatus = isGelarKepalaStatus(newStatusRaw, kode)
    ? gelar
    : formatStatusKeluarga(newStatusRaw, kode);

  if (!isValidStatusKeluarga(newStatus, kode)) {
    throw new Error("Status keluarga tidak valid");
  }

  const target = krama.anggota_aktif.find((a) => a.anggota_id === anggotaId);
  if (!target) throw new Error("Anggota tidak ditemukan");

  const db = await getDb();
  const isKepalaRow = isAnggotaGelarKepalaRow(
    target.penduduk_id,
    target.status_keluarga,
    krama.kepala.id,
    kode
  );

  if (isGelarKepalaStatus(newStatus, kode)) {
    if (kode === "MIPIL") {
      await clearLegacyGelarStatusOnOthers(db, krama, anggotaId);
      await db.execute(
        `UPDATE krama SET kepala_penduduk_id = $1, updated_at = datetime('now') WHERE id = $2`,
        [target.penduduk_id, kramaId]
      );
      return;
    }
    await clearLegacyGelarStatusOnOthers(db, krama, anggotaId);
    await db.execute(
      `UPDATE krama SET kepala_penduduk_id = $1, updated_at = datetime('now') WHERE id = $2`,
      [target.penduduk_id, kramaId]
    );
    await db.execute(`UPDATE anggota_keluarga SET status_keluarga = $1 WHERE id = $2`, [
      gelar,
      anggotaId,
    ]);
    return;
  }

  if (isKepalaRow) {
    throw new Error(
      `Anggota ini masih ${gelarLabel}. Tetapkan anggota lain sebagai ${gelarLabel} terlebih dahulu.`
    );
  }

  await db.execute(`UPDATE anggota_keluarga SET status_keluarga = $1 WHERE id = $2`, [
    newStatus,
    anggotaId,
  ]);
}
