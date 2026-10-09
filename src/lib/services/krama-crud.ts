import { getDb } from "../db/client";
import {
  generateNika,
  generateNomorIndukTahunan,
  generateNomorKartu,
} from "../penomoran";
import type { AnggotaDraft } from "../types";
import { agamaForPenduduk, assertAgamaTamiu } from "../agama-tamiu";
import {
  assertNonaktifFields,
  normalizeAlasanTidakAktif,
  normalizeKramaStatus,
} from "../krama-status";
import { parseTanggalTerdaftarIso } from "../date-iso";
import { jenisSebelumCeraiUntukDisimpan } from "../jenis-cerai";
import { today, uuid } from "../utils";
import {
  gelarKepalaLabel,
  gelarKepalaStatus,
  formatStatusKeluarga,
  isGelarKepalaStatus,
  isValidStatusKeluarga,
  isValidStatusKeluargaMipil,
} from "../status-keluarga";
import { getDesaAdat, isDesaConfigured } from "./desa";
import { countJenisByKlasifikasi } from "./master";
import { syncStatusIlikitaStored } from "./krama-ilikita-sync";
import { getKramaDetail } from "./krama-query";
import type { CreateKramaInput, UpdateKramaInput } from "./krama-input";
import { catatBiayaAdministrasiIlikita } from "./tarif-administrasi-ilikita";
import { catatPerubahanJenisNyada, syncNyadaOtomatis } from "./nyada-otomatis";

export async function createKrama(input: CreateKramaInput): Promise<string> {
  const desa = await getDesaAdat();
  if (!isDesaConfigured(desa)) {
    throw new Error("Lengkapi konfigurasi desa adat terlebih dahulu");
  }

  const jenisCount = await countJenisByKlasifikasi(input.klasifikasiKode);
  if (jenisCount === 0) {
    throw new Error("Tambahkan jenis pada master data terlebih dahulu");
  }

  const db = await getDb();
  const klas = await db.select<{ id: string; prefix_kartu: string }[]>(
    `SELECT id, prefix_kartu FROM klasifikasi_krama WHERE kode = $1`,
    [input.klasifikasiKode]
  );
  if (!klas[0]) throw new Error("Klasifikasi tidak valid");

  assertKramaFields(input);
  assertNonaktifFields(input.statusKrama, input.alasanTidakAktif, input.tanggalTidakAktif);

  const kode = input.klasifikasiKode;
  const status = normalizeKramaStatus(input.statusKrama);
  const alasanNonaktif =
    status === "nonaktif" ? normalizeAlasanTidakAktif(input.alasanTidakAktif) : null;
  const tanggalNonaktif =
    status === "nonaktif" ? input.tanggalTidakAktif?.trim() || null : null;
  const keteranganNonaktif =
    status === "nonaktif" ? input.keteranganTidakAktif?.trim() || null : null;
  const gelarLabel = gelarKepalaLabel(kode);
  const members: AnggotaDraft[] =
    input.anggota && input.anggota.length > 0
      ? input.anggota
      : [
          {
            clientId: uuid(),
            nama_lengkap: input.kepala.nama_lengkap,
            jenis_kelamin: input.kepala.jenis_kelamin,
            status_keluarga: gelarKepalaStatus(kode),
            tempat_lahir: input.kepala.tempat_lahir,
            tanggal_lahir: input.kepala.tanggal_lahir,
            status_kawin: input.kepala.status_kawin,
            pekerjaan: input.kepala.pekerjaan,
            nama_ibu: input.kepala.nama_ibu,
            nama_ayah: input.kepala.nama_ayah,
            nik_atau_nika: input.kepala.nik_atau_nika,
            agama: input.kepala.agama,
          },
        ];

  let kepalaDraft: AnggotaDraft;
  if (input.kepalaAnggotaClientId) {
    const found = members.find((a) => a.clientId === input.kepalaAnggotaClientId);
    if (!found) throw new Error(`${gelarLabel} harus dipilih dari daftar anggota`);
    kepalaDraft = found;
  } else {
    const kepalaRows = members.filter((a) => isGelarKepalaStatus(a.status_keluarga, kode));
    if (kepalaRows.length !== 1) {
      throw new Error(`Harus ada tepat satu ${gelarLabel} pada daftar anggota`);
    }
    kepalaDraft = kepalaRows[0]!;
  }
  if (kode === "TAMIU") assertTamiuAnggotaAgama(members);

  const nomorKartu = await generateNomorKartu(desa!.id, input.banjarId, input.banjarKode);
  const kramaId = uuid();
  const tgl = input.tanggalTerdaftar?.trim()
    ? parseTanggalTerdaftarIso(input.tanggalTerdaftar)
    : today();
  const pendudukIds = new Map<string, string>();

  for (const a of members) {
    const pid = uuid();
    pendudukIds.set(a.clientId, pid);
    await db.execute(
      `INSERT INTO penduduk (id, nama_lengkap, jenis_kelamin, tempat_lahir, tanggal_lahir, status_kawin, pekerjaan, nama_ibu, nama_ayah, nik_atau_nika, agama, foto_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pid,
        a.nama_lengkap,
        a.jenis_kelamin,
        a.tempat_lahir ?? null,
        a.tanggal_lahir ?? null,
        a.status_kawin ?? null,
        a.pekerjaan ?? null,
        kode === "MIPIL" ? (a.nama_ibu ?? null) : null,
        kode === "MIPIL" ? (a.nama_ayah ?? null) : null,
        kode !== "MIPIL" ? (a.nik_atau_nika ?? null) : null,
        agamaForPenduduk(kode, a.agama),
        a.foto_url?.trim() || null,
      ]
    );
  }

  const kepalaId = pendudukIds.get(kepalaDraft.clientId)!;
  const arahanId = kode === "MIPIL" ? (input.arahanId ?? null) : null;

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
      arahanId,
      input.alamat ?? null,
      input.keterangan ?? null,
      kode === "MIPIL" ? null : input.rtBtn?.trim() ?? null,
      kode === "MIPIL" ? null : input.asalDesaAdat ?? null,
      kode === "MIPIL" ? null : input.asalKecamatan ?? null,
      kode === "MIPIL" ? null : input.asalKabupaten ?? null,
      kode === "TAMIU" ? input.asalProvinsi ?? null : null,
      klas[0].id,
      input.jenisMipilId ?? null,
      input.jenisKramaTamiuId ?? null,
      input.jenisTamiuId ?? null,
      kepalaId,
      tgl,
      input.nomorKontak?.trim() || null,
      status,
      status === "nonaktif" ? "tidak_aktif" : "aktif",
      status === "nonaktif" ? "tidak_aktif" : "aktif",
      kode === "MIPIL" ? null : tgl,
      alasanNonaktif,
      tanggalNonaktif,
      keteranganNonaktif,
    ]
  );

  for (const a of members) {
    const pendudukId = pendudukIds.get(a.clientId)!;
    const anggotaId = uuid();
    const status =
      kode === "MIPIL"
        ? formatStatusKeluarga(a.status_keluarga, kode)
        : isGelarKepalaStatus(a.status_keluarga, kode)
          ? gelarKepalaStatus(kode)
          : formatStatusKeluarga(a.status_keluarga, kode);

    if (kode === "MIPIL") {
      if (!isValidStatusKeluargaMipil(status)) {
        throw new Error("Status keluarga tidak valid");
      }
    } else if (!isGelarKepalaStatus(status, kode) && !isValidStatusKeluarga(status, kode)) {
      throw new Error("Status keluarga tidak valid");
    }

    if (kode === "MIPIL") {
      const { nika, urut } = await generateNika(kramaId, nomorKartu);
      await db.execute(
        `INSERT INTO anggota_keluarga (id, krama_id, penduduk_id, status_keluarga, urut_dalam_keluarga, nika, masuk_pada, nomor_induk_diterbitkan_pada)
         VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
        [anggotaId, kramaId, pendudukId, status, urut, nika, tgl]
      );
    } else {
      if (!a.nik_atau_nika && pendudukId !== kepalaId) {
        throw new Error("NIK/NIKA wajib untuk anggota pemasih");
      }
      const jenisInduk = kode === "KRAMA_TAMIU" ? "NRKT" : "NRT";
      const induk = await generateNomorIndukTahunan(desa!.id, tgl, jenisInduk);
      const col = jenisInduk === "NRKT" ? "nrkt" : "nrt";
      await db.execute(
        `INSERT INTO anggota_keluarga (id, krama_id, penduduk_id, status_keluarga, ${col}, tanggal_pencatatan, masuk_pada, nomor_induk_diterbitkan_pada)
         VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
        [anggotaId, kramaId, pendudukId, status, induk, tgl, tgl]
      );
    }
  }

  if ((kode === "KRAMA_TAMIU" || kode === "TAMIU") && status === "aktif") {
    const biaya = await catatBiayaAdministrasiIlikita({
      jenis: "pemasih_terbit_baru",
      tanggal: tgl,
      keterangan: `Pendaftaran Pemasih — ${nomorKartu}`,
    });
    if (biaya) {
      await db.execute(`UPDATE krama SET biaya_terbit_transaksi_id = ? WHERE id = ?`, [
        biaya.transaksiId,
        kramaId,
      ]);
    }
  }

  if (kode === "MIPIL") {
    await simpanJenisSebelumCerai(
      kramaId,
      jenisSebelumCeraiUntukDisimpan(input.jenisMipilId, input.jenisSebelumCeraiId, desa)
    );
    await catatPerubahanJenisNyada({
      kramaId,
      jenisLamaId: null,
      jenisBaruId: input.jenisMipilId,
      pengarepTanggalLahir: input.kepala.tanggal_lahir,
      nyadaManual: input.nyadaManual,
      desa,
    });
    if (status === "aktif") await syncNyadaOtomatis({ kramaId });
  }

  if (status === "aktif") {
    const { tryAutoPushKrama } = await import("../sync/auto-push-krama");
    void tryAutoPushKrama(kramaId);
  }

  return kramaId;
}

async function simpanJenisSebelumCerai(kramaId: string, jenisId: string | null): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE krama SET jenis_sebelum_cerai_id = $1 WHERE id = $2`, [jenisId, kramaId]);
}

function assertKramaFields(input: CreateKramaInput): void {
  if (input.klasifikasiKode === "MIPIL") {
    if (!input.tempekId || !input.jenisMipilId) {
      throw new Error("Tempek dan Jenis Krama Mipil wajib");
    }
  }
  if (input.klasifikasiKode === "KRAMA_TAMIU") {
    if (
      !input.tempekId ||
      !input.rtBtn?.trim() ||
      !input.alamat ||
      !input.asalDesaAdat ||
      !input.asalKecamatan ||
      !input.asalKabupaten ||
      !input.jenisKramaTamiuId
    ) {
      throw new Error("Lengkapi banjar, tempek, RT/BTN, jenis, alamat sekarang, dan asal wilayah");
    }
  }
  if (input.klasifikasiKode === "TAMIU") {
    if (
      !input.tempekId ||
      !input.alamat ||
      !input.rtBtn?.trim() ||
      !input.asalDesaAdat ||
      !input.asalKecamatan ||
      !input.asalKabupaten ||
      !input.asalProvinsi ||
      !input.jenisTamiuId ||
      !input.kepala.agama?.trim()
    ) {
      throw new Error("Lengkapi banjar, tempek, RT/BTN, jenis, alamat, asal wilayah, dan agama");
    }
    assertAgamaTamiu(input.kepala.agama);
  }
}

function assertTamiuAnggotaAgama(members: AnggotaDraft[]): void {
  for (const a of members) {
    assertAgamaTamiu(a.agama);
  }
}

export async function updateKrama(input: UpdateKramaInput): Promise<void> {
  const existing = await getKramaDetail(input.kramaId);
  if (!existing) throw new Error("Krama tidak ditemukan");
  if (existing.klasifikasi_kode !== input.klasifikasiKode) {
    throw new Error("Klasifikasi tidak dapat diubah");
  }
  assertKramaFields(input);
  assertNonaktifFields(input.statusKrama, input.alasanTidakAktif, input.tanggalTidakAktif);

  const db = await getDb();
  const isMipil = input.klasifikasiKode === "MIPIL";
  const isTamiu = input.klasifikasiKode === "TAMIU";
  const isPemasihKode =
    input.klasifikasiKode === "KRAMA_TAMIU" || input.klasifikasiKode === "TAMIU";
  const status = normalizeKramaStatus(input.statusKrama ?? existing.status_krama);
  const alasanNonaktif =
    status === "nonaktif" ? normalizeAlasanTidakAktif(input.alasanTidakAktif) : null;
  const tanggalNonaktif =
    status === "nonaktif" ? input.tanggalTidakAktif?.trim() || null : null;
  const keteranganNonaktif =
    status === "nonaktif" ? input.keteranganTidakAktif?.trim() || null : null;

  const pipilStatus = status === "nonaktif" ? "tidak_aktif" : undefined;
  const pemasihStatus = status === "nonaktif" ? "tidak_aktif" : undefined;
  const canEditTanggalTerdaftar = isMipil || isPemasihKode;
  const tanggalTerdaftar = canEditTanggalTerdaftar
    ? parseTanggalTerdaftarIso(input.tanggalTerdaftar ?? existing.tanggal_terdaftar)
    : null;

  await db.execute(
    `UPDATE krama SET
      banjar_id = $1, tempek_id = $2, arahan_id = $3, alamat = $4, keterangan = $5,
      rt_btn = $6, asal_desa_adat = $7, asal_kecamatan = $8, asal_kabupaten = $9, asal_provinsi = $10,
      jenis_krama_mipil_id = $11, jenis_krama_tamiu_id = $12, jenis_tamiu_id = $13,
      nomor_kontak = $14, status_krama = $15,
      status_pipil = COALESCE($16, status_pipil),
      status_pemasih = COALESCE($17, status_pemasih),
      alasan_tidak_aktif = $18, tanggal_tidak_aktif = $19,
      keterangan_tidak_aktif = $20,
      tanggal_terdaftar = COALESCE($21, tanggal_terdaftar),
      tanggal_berlaku_mulai_pemasih = CASE WHEN $22 IS NOT NULL AND $23 = 1 THEN $22 ELSE tanggal_berlaku_mulai_pemasih END,
      updated_at = datetime('now')
    WHERE id = $24`,
    [
      input.banjarId,
      input.tempekId ?? null,
      isMipil ? (input.arahanId ?? null) : null,
      input.alamat ?? null,
      isMipil ? (input.keterangan ?? null) : null,
      isMipil ? null : input.rtBtn?.trim() ?? null,
      isMipil ? null : input.asalDesaAdat ?? null,
      isMipil ? null : input.asalKecamatan ?? null,
      isMipil ? null : input.asalKabupaten ?? null,
      isTamiu ? input.asalProvinsi ?? null : null,
      input.jenisMipilId ?? null,
      input.jenisKramaTamiuId ?? null,
      input.jenisTamiuId ?? null,
      input.nomorKontak?.trim() || null,
      status,
      pipilStatus ?? null,
      pemasihStatus ?? null,
      alasanNonaktif,
      tanggalNonaktif,
      keteranganNonaktif,
      tanggalTerdaftar,
      isPemasihKode ? tanggalTerdaftar : null,
      isPemasihKode ? 1 : 0,
      input.kramaId,
    ]
  );

  if (isMipil) {
    await simpanJenisSebelumCerai(
      input.kramaId,
      jenisSebelumCeraiUntukDisimpan(
        input.jenisMipilId,
        input.jenisSebelumCeraiId !== undefined
          ? input.jenisSebelumCeraiId
          : existing.jenis_sebelum_cerai_id,
        await getDesaAdat()
      )
    );
    await catatPerubahanJenisNyada({
      kramaId: input.kramaId,
      jenisLamaId: existing.jenis_krama_mipil_id,
      jenisBaruId: input.jenisMipilId,
      pengarepTanggalLahir: existing.kepala?.tanggal_lahir,
      nyadaManual: input.nyadaManual,
    });
  }

  if (tanggalTerdaftar && isPemasihKode) {
    await db.execute(
      `UPDATE anggota_keluarga SET tanggal_pencatatan = $1
       WHERE krama_id = $2 AND status = 'aktif'`,
      [tanggalTerdaftar, input.kramaId]
    );
  }
  if (tanggalTerdaftar && isMipil) {
    await db.execute(
      `UPDATE anggota_keluarga SET tanggal_pencatatan = $1, masuk_pada = $1
       WHERE krama_id = $2 AND status = 'aktif'`,
      [tanggalTerdaftar, input.kramaId]
    );
  }

  await db.execute(
    `UPDATE penduduk SET
      nama_lengkap = $1, jenis_kelamin = $2, tempat_lahir = $3, tanggal_lahir = $4,
      status_kawin = $5, pekerjaan = $6, nama_ibu = $7, nama_ayah = $8,
      nik_atau_nika = $9, agama = $10, foto_url = $11, updated_at = datetime('now')
    WHERE id = $12`,
    [
      input.kepala.nama_lengkap,
      input.kepala.jenis_kelamin,
      input.kepala.tempat_lahir ?? null,
      input.kepala.tanggal_lahir ?? null,
      input.kepala.status_kawin ?? null,
      input.kepala.pekerjaan ?? null,
      isMipil ? (input.kepala.nama_ibu ?? null) : null,
      isMipil ? (input.kepala.nama_ayah ?? null) : null,
      !isMipil ? (input.kepala.nik_atau_nika ?? null) : null,
      agamaForPenduduk(input.klasifikasiKode, input.kepala.agama),
      input.kepala.foto_url?.trim() || null,
      existing.kepala.id,
    ]
  );

  if (isMipil && status === "aktif") {
    await syncNyadaOtomatis({ kramaId: input.kramaId });
  }

  const refreshed = await getKramaDetail(input.kramaId);
  if (refreshed) {
    await syncStatusIlikitaStored(refreshed);
    if (refreshed.status_krama === "aktif") {
      const { tryAutoPushKrama } = await import("../sync/auto-push-krama");
      void tryAutoPushKrama(input.kramaId);
    }
  }
}
