/**
 * Data fiktif khusus rekaman video promosi — tanpa NIK/foto/HP asli.
 * Nama desa, krama, dan angka contoh saja.
 */
import bcrypt from "bcryptjs";
import type Database from "../desktop/sql";
import { bulanSaatIni, tahunSaatIni } from "../dudukan-hitung";
import { seedKasDudukanAlokasiIfEmpty } from "../services/kas-dudukan-alokasi";
import { uuid } from "../utils";

/** NIK contoh — format valid, bukan data orang nyata. */
const NIK = {
  p01: "5171010101010001",
  p02: "5171010101010002",
  p03: "5171010101010003",
  p04: "5171010101010004",
  p05: "5171010101010005",
  p06: "5171010101010006",
  p07: "5171010101010007",
  p08: "5171010101010008",
  p09: "5171010101010009",
  p10: "5171010101010010",
  p11: "5171010101010011",
  p12: "5171010101010012",
  p13: "5171010101010013",
  p14: "5171010101010014",
  p15: "5171010101010015",
  p16: "5171010101010016",
  p17: "5171010101010017",
  p18: "5171010101010018",
} as const;

async function ensureFinancialDefaults(db: Database): Promise<{
  akunPaturunanId: string;
  akunDudukanId: string;
}> {
  async function insertFreshAkun(): Promise<{ akunPaturunanId: string; akunDudukanId: string }> {
    await db.execute(`DELETE FROM kas_dudukan_alokasi`);
    await db.execute(`DELETE FROM pos_biaya`);
    await db.execute(`DELETE FROM akun_keuangan`);

    const groupPaturunan = uuid();
    const groupDudukan = uuid();
    const akunPaturunanId = uuid();
    const akunDudukanId = uuid();

    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, aktif, created_at)
       VALUES (?, 'Dana Paturunan', 'kas_paturunan', 1, 1, 1, datetime('now'))`,
      [groupPaturunan]
    );
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, aktif, created_at)
       VALUES (?, 'Dana Dudukan', 'kas_dudukan', 2, 1, 1, datetime('now'))`,
      [groupDudukan]
    );
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, aktif, parent_akun_id, created_at)
       VALUES (?, 'Dana Paturunan — Tunai', 'kas_paturunan', 1, 0, 1, ?, datetime('now'))`,
      [akunPaturunanId, groupPaturunan]
    );
    await db.execute(
      `INSERT INTO akun_keuangan (id, nama, jenis, urutan, is_kelompok, aktif, parent_akun_id, created_at)
       VALUES (?, 'Dana Dudukan — Tunai', 'kas_dudukan', 1, 0, 1, ?, datetime('now'))`,
      [akunDudukanId, groupDudukan]
    );

    await seedKasDudukanAlokasiIfEmpty(db);
    return { akunPaturunanId, akunDudukanId };
  }

  const akunCount = await db.select<{ c: number }[]>(
    `SELECT COUNT(*) as c FROM akun_keuangan`
  );
  if ((akunCount[0]?.c ?? 0) === 0) {
    return insertFreshAkun();
  }

  const paturunan = await db.select<{ id: string }[]>(
    `SELECT id FROM akun_keuangan
     WHERE jenis = 'kas_paturunan' AND COALESCE(is_kelompok, 0) = 0 AND aktif = 1
     ORDER BY urutan LIMIT 1`
  );
  const dudukan = await db.select<{ id: string }[]>(
    `SELECT id FROM akun_keuangan
     WHERE jenis = 'kas_dudukan' AND COALESCE(is_kelompok, 0) = 0 AND aktif = 1
     ORDER BY urutan LIMIT 1`
  );
  if (paturunan[0]?.id && dudukan[0]?.id) {
    await seedKasDudukanAlokasiIfEmpty(db);
    return { akunPaturunanId: paturunan[0].id, akunDudukanId: dudukan[0].id };
  }

  return insertFreshAkun();
}

function monthShift(baseYear: number, baseMonth: number, delta: number): { tahun: number; bulan: number } {
  let m = baseMonth - delta;
  let y = baseYear;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { tahun: y, bulan: m };
}

function isoDate(y: number, m: number, d = 15): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

async function seedStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(`${label}: ${detail}`);
  }
}

export async function seedVideoDemoContent(db: Database): Promise<void> {
  const desaRow = await db.select<{ id: string }[]>(`SELECT id FROM desa_adat LIMIT 1`);
  const desaId = desaRow[0]?.id;
  if (!desaId) throw new Error("Desa adat belum ada — jalankan seed dasar terlebih dahulu.");

  const klas = await db.select<{ id: string; kode: string }[]>(
    `SELECT id, kode FROM klasifikasi_krama`
  );
  const klasMipil = klas.find((k) => k.kode === "MIPIL")?.id;
  const klasKt = klas.find((k) => k.kode === "KRAMA_TAMIU")?.id;
  const klasTamiu = klas.find((k) => k.kode === "TAMIU")?.id;
  if (!klasMipil || !klasKt || !klasTamiu) {
    throw new Error("Klasifikasi krama belum lengkap.");
  }

  await db.execute(
    `UPDATE desa_adat SET
      kode_kabupaten = '51', nama_kabupaten = 'Gianyar',
      kode_kecamatan = '02', nama_kecamatan = 'Sukawati',
      kode_desa_adat = '9999', nama_desa_adat = 'Samplingsari',
      alamat_desa_adat = 'Jl. Contoh No. 1, Desa Adat Samplingsari (data fiktif)',
      bandesa_nama = 'I Gusti Ngurah Demo',
      bandesa_jabatan = 'Bandesa Adat',
      panyarikan_nama = 'I Made Panyarikan Contoh',
      panyarikan_jabatan = 'Panyarikan',
      call_center = '080011110000',
      updated_at = datetime('now')
     WHERE id = ?`,
    [desaId]
  );

  const banjarSuling = uuid();
  const banjarGamelan = uuid();
  await db.execute(
    `INSERT INTO banjar (id, desa_adat_id, nama, kode, aktif) VALUES (?, ?, 'Banjar Suling', '01', 1)`,
    [banjarSuling, desaId]
  );
  await db.execute(
    `INSERT INTO banjar (id, desa_adat_id, nama, kode, aktif) VALUES (?, ?, 'Banjar Gamelan', '02', 1)`,
    [banjarGamelan, desaId]
  );

  const jenisBiasa = uuid();
  const jenisBrahmana = uuid();
  const jenisPadi = uuid();
  await db.execute(
    `INSERT INTO jenis_krama_mipil (id, nama, kode, paturunan_persen, aktif) VALUES (?, 'Biasa', 'B', 100, 1)`,
    [jenisBiasa]
  );
  await db.execute(
    `INSERT INTO jenis_krama_mipil (id, nama, kode, paturunan_persen, aktif) VALUES (?, 'Brahmana', 'BR', 100, 1)`,
    [jenisBrahmana]
  );
  await db.execute(
    `INSERT INTO jenis_krama_mipil (id, nama, kode, paturunan_persen, aktif) VALUES (?, 'Padi', 'P', 100, 1)`,
    [jenisPadi]
  );

  const jenisKtBiasa = uuid();
  const jenisTamiuBiasa = uuid();
  await db.execute(
    `INSERT INTO jenis_krama_tamiu (id, nama, kode, dudukan_nominal, aktif) VALUES
     (?, 'Krama Tamiu Biasa', 'KTB', 75000, 1)`,
    [jenisKtBiasa]
  );
  await db.execute(
    `INSERT INTO jenis_tamiu (id, nama, kode, dudukan_nominal, aktif) VALUES
     (?, 'Tamiu Biasa', 'TB', 50000, 1)`,
    [jenisTamiuBiasa]
  );

  const iuranId = uuid();
  await db.execute(
    `INSERT INTO iuran_paturunan (id, nama, nominal, tanggal_target, aktif) VALUES
     (?, 'Iuran Paturunan Demo 2026', 500000, '2026-12-31', 1)`,
    [iuranId]
  );

  const timId = uuid();
  await db.execute(
    `INSERT INTO tim_kasukretan (id, nama, banjar_id, jabatan) VALUES (?, 'Petugas Demo Satu', ?, 'Ketua')`,
    [timId, banjarSuling]
  );

  type PendudukSeed = { id: string; nama: string; jk: "L" | "P"; nik: string };
  const penduduk: PendudukSeed[] = [
    { id: uuid(), nama: "I Wayan Samplingsari", jk: "L", nik: NIK.p01 },
    { id: uuid(), nama: "Ni Made Contoh", jk: "P", nik: NIK.p02 },
    { id: uuid(), nama: "I Ketut Demo", jk: "L", nik: NIK.p03 },
    { id: uuid(), nama: "I Gusti Fiksi", jk: "L", nik: NIK.p04 },
    { id: uuid(), nama: "Ni Kadek Pratama", jk: "P", nik: NIK.p05 },
    { id: uuid(), nama: "I Nyoman Contoh", jk: "L", nik: NIK.p06 },
    { id: uuid(), nama: "Ni Luh Sari Demo", jk: "P", nik: NIK.p07 },
    { id: uuid(), nama: "I Made Samplingsari", jk: "L", nik: NIK.p08 },
    { id: uuid(), nama: "I Wayan Tamiu Contoh", jk: "L", nik: NIK.p09 },
    { id: uuid(), nama: "Ni Putu Demo", jk: "P", nik: NIK.p10 },
    { id: uuid(), nama: "I Gusti Krama Tamiu", jk: "L", nik: NIK.p11 },
    { id: uuid(), nama: "I Made Pemasih", jk: "L", nik: NIK.p12 },
    { id: uuid(), nama: "Ni Nyoman Tamiu", jk: "P", nik: NIK.p13 },
    { id: uuid(), nama: "I Ketut Pemasih", jk: "L", nik: NIK.p14 },
    { id: uuid(), nama: "I Wayan Gamelan", jk: "L", nik: NIK.p15 },
    { id: uuid(), nama: "Ni Made Suling", jk: "P", nik: NIK.p16 },
    { id: uuid(), nama: "I Gusti Brahmana", jk: "L", nik: NIK.p17 },
    { id: uuid(), nama: "I Nyoman Padi", jk: "L", nik: NIK.p18 },
  ];

  for (const p of penduduk) {
    await db.execute(
      `INSERT INTO penduduk (id, nama_lengkap, jenis_kelamin, nik_kependudukan, status_hidup)
       VALUES (?, ?, ?, ?, 'hidup')`,
      [p.id, p.nama, p.jk, p.nik]
    );
  }

  const today = new Date();
  const terdaftar = isoDate(today.getFullYear(), today.getMonth() + 1, 1);
  const terdaftarLama = isoDate(today.getFullYear() - 1, 6, 10);

  type KramaSeed = {
    id: string;
    kartu: string;
    jenisKartu: string;
    banjarId: string;
    klasId: string;
    jenisMipilId?: string;
    jenisKtId?: string;
    jenisTamiuId?: string;
    kepalaId: string;
    tanggal: string;
    statusPemasih?: string;
  };

  const kramaRows: KramaSeed[] = [
    { id: uuid(), kartu: "NPK01010001", jenisKartu: "NPK", banjarId: banjarSuling, klasId: klasMipil, jenisMipilId: jenisBiasa, kepalaId: penduduk[0].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010002", jenisKartu: "NPK", banjarId: banjarSuling, klasId: klasMipil, jenisMipilId: jenisBiasa, kepalaId: penduduk[1].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010003", jenisKartu: "NPK", banjarId: banjarSuling, klasId: klasMipil, jenisMipilId: jenisBrahmana, kepalaId: penduduk[2].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010004", jenisKartu: "NPK", banjarId: banjarGamelan, klasId: klasMipil, jenisMipilId: jenisBrahmana, kepalaId: penduduk[3].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010005", jenisKartu: "NPK", banjarId: banjarGamelan, klasId: klasMipil, jenisMipilId: jenisPadi, kepalaId: penduduk[4].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010006", jenisKartu: "NPK", banjarId: banjarSuling, klasId: klasMipil, jenisMipilId: jenisPadi, kepalaId: penduduk[5].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010007", jenisKartu: "NPK", banjarId: banjarGamelan, klasId: klasMipil, jenisMipilId: jenisBiasa, kepalaId: penduduk[6].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010008", jenisKartu: "NPK", banjarId: banjarSuling, klasId: klasMipil, jenisMipilId: jenisBrahmana, kepalaId: penduduk[7].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010009", jenisKartu: "NPK", banjarId: banjarGamelan, klasId: klasMipil, jenisMipilId: jenisPadi, kepalaId: penduduk[16].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPK01010010", jenisKartu: "NPK", banjarId: banjarSuling, klasId: klasMipil, jenisMipilId: jenisBiasa, kepalaId: penduduk[17].id, tanggal: terdaftar },
    { id: uuid(), kartu: "NPKT01010001", jenisKartu: "NPKT", banjarId: banjarSuling, klasId: klasKt, jenisKtId: jenisKtBiasa, kepalaId: penduduk[8].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
    { id: uuid(), kartu: "NPKT01010002", jenisKartu: "NPKT", banjarId: banjarSuling, klasId: klasKt, jenisKtId: jenisKtBiasa, kepalaId: penduduk[9].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
    { id: uuid(), kartu: "NPKT01010003", jenisKartu: "NPKT", banjarId: banjarSuling, klasId: klasKt, jenisKtId: jenisKtBiasa, kepalaId: penduduk[10].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
    { id: uuid(), kartu: "NPKT01020001", jenisKartu: "NPKT", banjarId: banjarGamelan, klasId: klasKt, jenisKtId: jenisKtBiasa, kepalaId: penduduk[14].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
    { id: uuid(), kartu: "NPKT01020002", jenisKartu: "NPKT", banjarId: banjarGamelan, klasId: klasKt, jenisKtId: jenisKtBiasa, kepalaId: penduduk[15].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
    { id: uuid(), kartu: "NPT01010001", jenisKartu: "NPT", banjarId: banjarSuling, klasId: klasTamiu, jenisTamiuId: jenisTamiuBiasa, kepalaId: penduduk[11].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
    { id: uuid(), kartu: "NPT01010002", jenisKartu: "NPT", banjarId: banjarSuling, klasId: klasTamiu, jenisTamiuId: jenisTamiuBiasa, kepalaId: penduduk[12].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
    { id: uuid(), kartu: "NPT01020001", jenisKartu: "NPT", banjarId: banjarGamelan, klasId: klasTamiu, jenisTamiuId: jenisTamiuBiasa, kepalaId: penduduk[13].id, tanggal: terdaftarLama, statusPemasih: "aktif" },
  ];

  for (const k of kramaRows) {
    await db.execute(
      `INSERT INTO krama (
        id, nomor_kartu, jenis_kartu, desa_adat_id, banjar_id, klasifikasi_krama_id,
        jenis_krama_mipil_id, jenis_krama_tamiu_id, jenis_tamiu_id,
        kepala_penduduk_id, tanggal_terdaftar, status_krama, status_pemasih
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?)`,
      [
        k.id,
        k.kartu,
        k.jenisKartu,
        desaId,
        k.banjarId,
        k.klasId,
        k.jenisMipilId ?? null,
        k.jenisKtId ?? null,
        k.jenisTamiuId ?? null,
        k.kepalaId,
        k.tanggal,
        k.statusPemasih ?? "aktif",
      ]
    );

    if (k.jenisKartu === "NPK") {
      await db.execute(
        `INSERT INTO anggota_keluarga (id, krama_id, penduduk_id, status_keluarga, masuk_pada, status, nika)
         VALUES (?, ?, ?, 'Pengarep', ?, 'aktif', ?)`,
        [uuid(), k.id, k.kepalaId, k.tanggal, k.kartu.replace("NPK", "NIKA")]
      );
      await db.execute(
        `INSERT INTO paturunan_lunas_krama (krama_id, iuran_id, lunas) VALUES (?, ?, 0)`,
        [k.id, iuranId]
      );
    }
  }

  const { akunPaturunanId, akunDudukanId } = await seedStep("akun keuangan demo", () =>
    ensureFinancialDefaults(db)
  );

  await db.execute(
    `UPDATE user SET nama = 'Admin Demo', must_change_password = 0 WHERE username = 'admin'`
  );

  const hashOp = await bcrypt.hash("demo123", 10);
  await db.execute(
    `INSERT INTO user (id, username, password_hash, peran, nama, must_change_password)
     VALUES (?, 'operator', ?, 'operator', 'Operator Demo', 0)`,
    [uuid(), hashOp]
  );

  const tahunIni = tahunSaatIni();
  const bulanIni = bulanSaatIni();

  const mipilKrama = kramaRows.filter((k) => k.jenisKartu === "NPK");
  const ktKrama = kramaRows.filter((k) => k.jenisKartu === "NPKT");

  for (let i = 0; i < mipilKrama.length; i++) {
    const k = mipilKrama[i];
    const bayar = i < 7 ? 500000 : i < 9 ? 250000 : 0;
    if (bayar <= 0) continue;
    await db.execute(
      `INSERT INTO paturunan_pembayaran (id, krama_id, iuran_id, jenis, jumlah, tanggal, akun_keuangan_id, petugas_id)
       VALUES (?, ?, ?, 'wajib', ?, ?, ?, ?)`,
      [uuid(), k.id, iuranId, bayar, isoDate(tahunIni, bulanIni, 5 + (i % 20)), akunPaturunanId, timId]
    );
    if (bayar >= 500000) {
      await db.execute(
        `UPDATE paturunan_lunas_krama SET lunas = 1 WHERE krama_id = ? AND iuran_id = ?`,
        [k.id, iuranId]
      );
    }
    if (i === 7) {
      await db.execute(
        `INSERT INTO paturunan_pembayaran (id, krama_id, iuran_id, jenis, jumlah, tanggal, akun_keuangan_id)
         VALUES (?, ?, ?, 'punia', 50000, ?, ?)`,
        [uuid(), k.id, iuranId, isoDate(tahunIni, bulanIni, 12), akunPaturunanId]
      );
    }
  }

  for (let delta = 0; delta < 6; delta++) {
    const { tahun, bulan } = monthShift(tahunIni, bulanIni, delta);
    const tanggal = isoDate(tahun, bulan, 10);
    const paturunanBase = 1_200_000 + delta * 150_000;
    const puniaBase = 100_000 + delta * 20_000;
    const dudukanBase = 800_000 + delta * 100_000;
    const keringanan = delta === 2 ? 150_000 : delta === 4 ? 200_000 : 0;

    for (const k of mipilKrama.slice(0, 3)) {
      await db.execute(
        `INSERT INTO paturunan_pembayaran (id, krama_id, iuran_id, jenis, jumlah, tanggal, akun_keuangan_id)
         VALUES (?, ?, ?, 'wajib', ?, ?, ?)`,
        [uuid(), k.id, iuranId, paturunanBase / 3, tanggal, akunPaturunanId]
      );
    }
    await db.execute(
      `INSERT INTO paturunan_pembayaran (id, krama_id, iuran_id, jenis, jumlah, tanggal, akun_keuangan_id)
       VALUES (?, ?, ?, 'punia', ?, ?, ?)`,
      [uuid(), mipilKrama[0].id, iuranId, puniaBase, tanggal, akunPaturunanId]
    );

    for (const k of ktKrama.slice(0, 2)) {
      await db.execute(
        `INSERT INTO dudukan_pembayaran (id, krama_id, tahun, bulan, jumlah, tanggal, akun_keuangan_id, jenis_krama_tamiu_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), k.id, tahun, bulan, dudukanBase / 2, tanggal, akunDudukanId, jenisKtBiasa]
      );
    }

    if (keringanan > 0 && ktKrama[0]) {
      await db.execute(
        `INSERT INTO dudukan_keringanan (id, krama_id, tahun, bulan, jumlah, tanggal, petugas_id, keterangan)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Keringanan demo video')`,
        [uuid(), ktKrama[0].id, tahun, bulan, keringanan, tanggal, timId]
      );
    }
  }

  await db.execute(
    `INSERT INTO penomoran_kartu_counter (id, desa_adat_id, banjar_id, urutan_terakhir) VALUES (?, ?, ?, 10)`,
    [uuid(), desaId, banjarSuling]
  );
  await db.execute(
    `INSERT INTO penomoran_kartu_counter (id, desa_adat_id, banjar_id, urutan_terakhir) VALUES (?, ?, ?, 2)`,
    [uuid(), desaId, banjarGamelan]
  );
}
