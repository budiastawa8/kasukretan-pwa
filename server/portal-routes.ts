import { dbExecute, dbSelect } from "./db.js";
import { HttpError } from "./auth.js";
import {
  portalLoginWithPin,
  requirePortalAuth,
  signPortalToken,
  type PortalSessionUser,
} from "./portal-auth.js";

type Send = (status: number, data: unknown) => void;

function formatBulanLabel(tahun: number, bulan: number): string {
  const names = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  return `${names[bulan - 1] ?? bulan} ${tahun}`;
}

function statusTagihan(tagihan: number, dibayar: number, keringanan = 0): string {
  const sisa = Math.max(0, tagihan - keringanan - dibayar);
  if (tagihan <= 0) return "Tidak wajib";
  if (sisa <= 0) return "Lunas";
  if (dibayar > 0 || keringanan > 0) return "Sebagian";
  return "Belum bayar";
}

/** Batas jendela dudukan portal: 12 bulan terakhir (termasuk bulan ini). */
function dudukanWindowStart(): { tahun: number; bulan: number } {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  return { tahun: d.getFullYear(), bulan: d.getMonth() + 1 };
}

async function loadPortalProfil(kramaId: string) {
  const rows = await dbSelect(
    `SELECT k.id AS krama_id, k.nomor_kartu, p.nama_lengkap AS kepala_nama,
            kk.kode AS klasifikasi_kode, kk.nama_tampilan AS klasifikasi_nama,
            b.nama AS banjar_nama,
            COALESCE(jm.nama, jkt.nama, jt.nama) AS jenis_nama
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN banjar b ON b.id = k.banjar_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.id = ?`,
    [kramaId]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, "Data krama tidak ditemukan");
  return {
    krama_id: String(row.krama_id),
    nomor_kartu: String(row.nomor_kartu),
    kepala_nama: String(row.kepala_nama),
    klasifikasi_kode: String(row.klasifikasi_kode),
    klasifikasi_nama: String(row.klasifikasi_nama),
    banjar_nama: String(row.banjar_nama ?? ""),
    jenis_nama: row.jenis_nama != null ? String(row.jenis_nama) : null,
  };
}

async function loadPortalPaturunan(kramaId: string) {
  const kramaRows = await dbSelect(
    `SELECT k.id, COALESCE(jm.paturunan_persen, 0) AS persen
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     WHERE k.id = ? AND kk.kode = 'MIPIL'`,
    [kramaId]
  );
  if (!kramaRows[0]) throw new HttpError(403, "Paturunan hanya untuk Krama Mipil");

  const persen = Number(kramaRows[0].persen) || 0;
  // Satu query: iuran aktif + aggregate pembayaran krama (hindari N+1).
  const iuranRows = await dbSelect(
    `SELECT i.id, i.nama, COALESCE(i.nominal, 0) AS nominal,
            COALESCE(SUM(CASE
              WHEN pp.id IS NULL THEN 0
              WHEN pp.jenis = 'punia' THEN 0
              ELSE pp.jumlah
            END), 0) AS wajib,
            COALESCE(SUM(CASE WHEN pp.jenis = 'punia' THEN pp.jumlah ELSE 0 END), 0) AS punia
     FROM iuran_paturunan i
     LEFT JOIN paturunan_pembayaran pp
       ON pp.iuran_id = i.id AND pp.krama_id = ?
     WHERE i.aktif = 1
     GROUP BY i.id, i.nama, i.nominal, i.tanggal_target
     ORDER BY i.tanggal_target DESC, i.nama`,
    [kramaId]
  );

  const iuran = iuranRows.map((i) => {
    const tagihan = Math.round((Number(i.nominal) || 0) * (persen / 100));
    const dibayarWajib = Number(i.wajib) || 0;
    const punia = Number(i.punia) || 0;
    const sisa = Math.max(0, tagihan - dibayarWajib);
    return {
      iuran_id: String(i.id),
      iuran_nama: String(i.nama),
      tagihan,
      dibayar_wajib: dibayarWajib,
      punia,
      sisa,
      status: statusTagihan(tagihan, dibayarWajib),
    };
  });

  const riwayatRows = await dbSelect(
    `SELECT pp.id, ip.nama AS iuran_nama, COALESCE(pp.jenis, 'wajib') AS jenis,
            pp.jumlah, pp.tanggal
     FROM paturunan_pembayaran pp
     JOIN iuran_paturunan ip ON ip.id = pp.iuran_id
     WHERE pp.krama_id = ?
     ORDER BY pp.tanggal DESC, pp.id DESC
     LIMIT 50`,
    [kramaId]
  );

  return {
    iuran,
    riwayat: riwayatRows.map((r) => ({
      id: String(r.id),
      iuran_nama: String(r.iuran_nama),
      jenis: String(r.jenis ?? "wajib"),
      jumlah: Number(r.jumlah) || 0,
      tanggal: String(r.tanggal),
    })),
  };
}

async function loadPortalDudukan(kramaId: string) {
  const kramaRows = await dbSelect(
    `SELECT k.id,
            COALESCE(jkt.dudukan_nominal, jt.dudukan_nominal, 0) AS tarif
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.id = ? AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')`,
    [kramaId]
  );
  if (!kramaRows[0]) throw new HttpError(403, "Dudukan hanya untuk Pemasih");

  const tarif = Number(kramaRows[0].tarif) || 0;
  const win = dudukanWindowStart();

  const bayarRows = await dbSelect(
    `SELECT tahun, bulan, COALESCE(SUM(jumlah), 0) AS dibayar
     FROM dudukan_pembayaran
     WHERE krama_id = ?
       AND (tahun > ? OR (tahun = ? AND bulan >= ?))
     GROUP BY tahun, bulan`,
    [kramaId, win.tahun, win.tahun, win.bulan]
  );
  const bayarMap = new Map<string, number>();
  for (const b of bayarRows) {
    bayarMap.set(`${b.tahun}-${b.bulan}`, Number(b.dibayar) || 0);
  }

  const keringananRows = await dbSelect(
    `SELECT tahun, bulan, COALESCE(SUM(jumlah), 0) AS keringanan
     FROM dudukan_keringanan
     WHERE krama_id = ?
       AND (tahun > ? OR (tahun = ? AND bulan >= ?))
     GROUP BY tahun, bulan`,
    [kramaId, win.tahun, win.tahun, win.bulan]
  );
  const keringananMap = new Map<string, number>();
  for (const k of keringananRows) {
    keringananMap.set(`${k.tahun}-${k.bulan}`, Number(k.keringanan) || 0);
  }

  const now = new Date();
  const bulan = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const tahun = d.getFullYear();
    const bln = d.getMonth() + 1;
    const key = `${tahun}-${bln}`;
    const dibayar = bayarMap.get(key) ?? 0;
    const keringanan = keringananMap.get(key) ?? 0;
    const tagihan = tarif;
    const sisa = Math.max(0, tagihan - keringanan - dibayar);
    bulan.push({
      tahun,
      bulan: bln,
      label: formatBulanLabel(tahun, bln),
      tagihan,
      dibayar,
      keringanan,
      sisa,
      status: statusTagihan(tagihan, dibayar, keringanan),
    });
  }

  const riwayatRows = await dbSelect(
    `SELECT id, tahun, bulan, jumlah, tanggal
     FROM dudukan_pembayaran
     WHERE krama_id = ?
       AND (tahun > ? OR (tahun = ? AND bulan >= ?))
     ORDER BY tanggal DESC, id DESC
     LIMIT 50`,
    [kramaId, win.tahun, win.tahun, win.bulan]
  );

  return {
    tarif_bulanan: tarif,
    bulan,
    riwayat: riwayatRows.map((r) => {
      const tahun = Number(r.tahun);
      const bln = Number(r.bulan);
      return {
        id: String(r.id),
        tahun,
        bulan: bln,
        label: formatBulanLabel(tahun, bln),
        jumlah: Number(r.jumlah) || 0,
        tanggal: String(r.tanggal),
      };
    }),
  };
}

async function loadPortalKartu(kramaId: string) {
  const kramaRows = await dbSelect(
    `SELECT k.id, k.nomor_kartu, k.alamat, k.keterangan, k.asal_desa_adat, k.asal_kecamatan,
            k.asal_kabupaten, k.asal_provinsi, k.tanggal_terdaftar,
            k.tanggal_berlaku_mulai_pemasih, k.kepala_penduduk_id,
            kk.kode AS klasifikasi_kode, kk.nama_tampilan AS klasifikasi_nama,
            b.nama AS banjar_nama, t.nama AS tempek_nama, a.nama AS arahan_nama,
            COALESCE(jm.nama, jkt.nama, jt.nama) AS jenis_nama,
            COALESCE(jm.masa_berlaku_tahun, jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) AS masa_berlaku_tahun
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tempek t ON t.id = k.tempek_id
     LEFT JOIN arahan a ON a.id = k.arahan_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.id = ?`,
    [kramaId]
  );
  const krama = kramaRows[0];
  if (!krama) throw new HttpError(404, "Data krama tidak ditemukan");

  // Tanpa logo/TTD (sering data URL besar) — hemat rows read Turso; UI pakai placeholder.
  const desaRows = await dbSelect(
    `SELECT nama_desa_adat, nama_kecamatan, nama_kabupaten,
            bandesa_nama, bandesa_jabatan,
            COALESCE(enforce_masa_berlaku_pipil, 1) AS enforce_masa_berlaku_pipil
     FROM desa_adat
     LIMIT 1`
  );
  const desa = desaRows[0] ?? null;

  // Tanpa p.foto_url (sering base64 besar). Portal kartu memakai placeholder.
  const anggotaRows = await dbSelect(
    `SELECT ak.id AS anggota_id, ak.penduduk_id, ak.status_keluarga, ak.urut_dalam_keluarga,
            ak.nika, ak.nrkt, ak.nrt, ak.tanggal_pencatatan, ak.masuk_pada,
            p.nama_lengkap, p.jenis_kelamin, p.tempat_lahir, p.tanggal_lahir,
            p.status_kawin, p.pekerjaan, p.nama_ibu, p.nama_ayah,
            p.nik_kependudukan, p.nik_atau_nika, p.agama
     FROM anggota_keluarga ak
     JOIN penduduk p ON p.id = ak.penduduk_id
     WHERE ak.krama_id = ? AND ak.status = 'aktif'
     ORDER BY
       CASE WHEN lower(ak.status_keluarga) IN ('pengarep', 'pengajeg', 'kepala_keluarga') THEN 0 ELSE 1 END,
       ak.urut_dalam_keluarga,
       ak.masuk_pada`,
    [kramaId]
  );

  const kode = String(krama.klasifikasi_kode);
  const kind = kode === "MIPIL" ? "mipil" : kode === "KRAMA_TAMIU" ? "krama_tamiu" : "tamiu";
  const title =
    kode === "MIPIL"
      ? "Pipil & Kartu"
      : kode === "KRAMA_TAMIU"
        ? "Ilikita & Kartu Krama Tamiu"
        : "Ilikita & Kartu Tamiu";

  return {
    kind,
    title,
    desa: desa
      ? {
          nama_desa_adat: String(desa.nama_desa_adat ?? ""),
          nama_kecamatan: desa.nama_kecamatan != null ? String(desa.nama_kecamatan) : null,
          nama_kabupaten: desa.nama_kabupaten != null ? String(desa.nama_kabupaten) : null,
          logo_url: null,
          logo_mda_url: null,
          bandesa_nama: desa.bandesa_nama != null ? String(desa.bandesa_nama) : null,
          bandesa_jabatan: desa.bandesa_jabatan != null ? String(desa.bandesa_jabatan) : null,
          bandesa_ttd_url: null,
          enforce_masa_berlaku_pipil: Number(desa.enforce_masa_berlaku_pipil) === 1 ? 1 : 0,
        }
      : null,
    krama: {
      id: String(krama.id),
      nomor_kartu: String(krama.nomor_kartu),
      klasifikasi_kode: kode,
      klasifikasi_nama: String(krama.klasifikasi_nama),
      jenis_nama: krama.jenis_nama != null ? String(krama.jenis_nama) : null,
      alamat: krama.alamat != null ? String(krama.alamat) : null,
      keterangan: krama.keterangan != null ? String(krama.keterangan) : null,
      tempek_nama: krama.tempek_nama != null ? String(krama.tempek_nama) : null,
      arahan_nama: krama.arahan_nama != null ? String(krama.arahan_nama) : null,
      banjar_nama: String(krama.banjar_nama ?? ""),
      asal_desa_adat: krama.asal_desa_adat != null ? String(krama.asal_desa_adat) : null,
      asal_kecamatan: krama.asal_kecamatan != null ? String(krama.asal_kecamatan) : null,
      asal_kabupaten: krama.asal_kabupaten != null ? String(krama.asal_kabupaten) : null,
      asal_provinsi: krama.asal_provinsi != null ? String(krama.asal_provinsi) : null,
      tanggal_terdaftar: String(krama.tanggal_terdaftar),
      masa_berlaku_tahun:
        krama.masa_berlaku_tahun != null ? Number(krama.masa_berlaku_tahun) : null,
      tanggal_berlaku_mulai_pemasih:
        krama.tanggal_berlaku_mulai_pemasih != null
          ? String(krama.tanggal_berlaku_mulai_pemasih)
          : null,
      kepala_penduduk_id: String(krama.kepala_penduduk_id),
    },
    anggota: anggotaRows.map((a) => ({
      anggota_id: String(a.anggota_id),
      penduduk_id: String(a.penduduk_id),
      status_keluarga: String(a.status_keluarga ?? ""),
      nika: a.nika != null ? String(a.nika) : null,
      nrkt: a.nrkt != null ? String(a.nrkt) : null,
      nrt: a.nrt != null ? String(a.nrt) : null,
      tanggal_pencatatan: a.tanggal_pencatatan != null ? String(a.tanggal_pencatatan) : null,
      masuk_pada: a.masuk_pada != null ? String(a.masuk_pada) : null,
      nama_lengkap: String(a.nama_lengkap),
      jenis_kelamin: String(a.jenis_kelamin ?? ""),
      tempat_lahir: a.tempat_lahir != null ? String(a.tempat_lahir) : null,
      tanggal_lahir: a.tanggal_lahir != null ? String(a.tanggal_lahir) : null,
      status_kawin: a.status_kawin != null ? String(a.status_kawin) : null,
      pekerjaan: a.pekerjaan != null ? String(a.pekerjaan) : null,
      nama_ibu: a.nama_ibu != null ? String(a.nama_ibu) : null,
      nama_ayah: a.nama_ayah != null ? String(a.nama_ayah) : null,
      agama: a.agama != null ? String(a.agama) : null,
      nik_kependudukan: a.nik_kependudukan != null ? String(a.nik_kependudukan) : null,
      nik_atau_nika: a.nik_atau_nika != null ? String(a.nik_atau_nika) : null,
      foto_url: null,
    })),
  };
}

async function pushPortalAccounts(accounts: unknown[]): Promise<{ upserted: number; errors: string[] }> {
  const errors: string[] = [];
  let upserted = 0;
  for (const raw of accounts) {
    if (!raw || typeof raw !== "object") {
      errors.push("Baris akun portal tidak valid");
      continue;
    }
    const a = raw as Record<string, unknown>;
    const nomor = String(a.nomor_kartu ?? "").trim();
    const hash = String(a.password_hash ?? "").trim();
    const aktif = Number(a.aktif) === 1 ? 1 : 0;
    const updatedAt = String(a.updated_at ?? new Date().toISOString());
    if (!nomor || !hash) {
      errors.push(`Akun portal tidak lengkap: ${nomor || "?"}`);
      continue;
    }
    const kramaRows = await dbSelect(`SELECT id FROM krama WHERE nomor_kartu = ?`, [nomor]);
    const kramaId = kramaRows[0]?.id;
    if (!kramaId) {
      errors.push(`Krama ${nomor} belum ada di cloud — kirim krama dulu`);
      continue;
    }
    await dbExecute(
      `INSERT INTO krama_portal (krama_id, password_hash, aktif, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(krama_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         aktif = excluded.aktif,
         updated_at = excluded.updated_at`,
      [String(kramaId), hash, aktif, updatedAt]
    );
    upserted += 1;
  }
  return { upserted, errors };
}

/** Login portal (tanpa sesi staf). Return true jika path ditangani. */
export async function handlePortalLoginRoute(
  path: string,
  method: string,
  readBody: () => Promise<Record<string, unknown>>,
  send: Send
): Promise<boolean> {
  if (path !== "portal/login" || method !== "POST") return false;
  const body = await readBody();
  const nomor = String(body.nomor_kartu ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!nomor || !pin) throw new HttpError(400, "Nomor kartu dan PIN wajib.");
  const user = await portalLoginWithPin(nomor, pin);
  if (!user) throw new HttpError(401, "Nomor kartu atau PIN salah");
  send(200, { ok: true, token: signPortalToken(user), user });
  return true;
}

/** Endpoint portal terautentikasi (JWT portal). Return true jika path ditangani. */
export async function handlePortalAuthedRoute(
  path: string,
  method: string,
  req: { headers: { authorization?: string | string[] } },
  send: Send
): Promise<boolean> {
  if (!path.startsWith("portal/") || path === "portal/login") return false;
  const user = requirePortalAuth(req);

  if (path === "portal/me" && method === "GET") {
    send(200, { ok: true, data: await loadPortalProfil(user.kramaId) });
    return true;
  }
  if (path === "portal/paturunan" && method === "GET") {
    send(200, { ok: true, data: await loadPortalPaturunan(user.kramaId) });
    return true;
  }
  if (path === "portal/dudukan" && method === "GET") {
    send(200, { ok: true, data: await loadPortalDudukan(user.kramaId) });
    return true;
  }
  if (path === "portal/kartu" && method === "GET") {
    send(200, { ok: true, data: await loadPortalKartu(user.kramaId) });
    return true;
  }

  throw new HttpError(404, `Endpoint tidak ditemukan: ${method} /api/${path}`);
}

/** Sync PIN portal dari desktop (admin). Return true jika path ditangani. */
export async function handlePortalSyncPush(
  path: string,
  method: string,
  readBody: () => Promise<Record<string, unknown>>,
  send: Send
): Promise<boolean> {
  if (path !== "sync/portal/push" || method !== "POST") return false;
  const body = await readBody();
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  const result = await pushPortalAccounts(accounts);
  send(200, { ok: result.errors.length === 0, result });
  return true;
}

export type { PortalSessionUser };
