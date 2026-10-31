import { parseIsoDateString } from "../date-iso";
import { getDb } from "../db/client";
import {
  formatSubAkunKelompokNama,
  getAkunKeuangan,
  isAkunKelompokRow,
  listAkunIdsInKelompok,
  sortKelompokAkun,
  listAkunKeuangan,
} from "./akun-keuangan";
import type {
  AkunKeuanganJenis,
  BukuKasBaris,
  BukuKasJenisTransaksi,
  LaporanBukuKasBaris,
  LaporanBukuKasSubSaldo,
  LaporanKasRekapPerPosBaris,
} from "../types";

const JENIS_URUTAN: Record<BukuKasJenisTransaksi, number> = {
  paturunan: 0,
  dudukan: 1,
  pemasukan_lain: 2,
  transfer_masuk: 3,
  transfer_keluar: 3,
  pengeluaran: 4,
};

/** Urutan kronologis (lama → baru) untuk hitung saldo berjalan. */
function sortBukuKasKronologis<
  T extends { tanggal: string; jenis: BukuKasJenisTransaksi; uraian: string; created_at: string },
>(a: T, b: T): number {
  const d = a.tanggal.localeCompare(b.tanggal);
  if (d !== 0) return d;
  const c = a.created_at.localeCompare(b.created_at);
  if (c !== 0) return c;
  const j = JENIS_URUTAN[a.jenis] - JENIS_URUTAN[b.jenis];
  if (j !== 0) return j;
  return a.uraian.localeCompare(b.uraian, "id");
}

/** Urutan tampilan laporan/PDF: tanggal A–Z (lama → baru). */
export function sortLaporanBukuKasTanggalAsc<
  T extends { tanggal: string; jenis: BukuKasJenisTransaksi; uraian: string; created_at: string },
>(rows: T[]): T[] {
  return [...rows].sort(sortBukuKasKronologis);
}

function uraianPenerimaanDudukan(
  banjarNama: string,
  petugasNama: string | null | undefined
): string {
  const banjar = banjarNama?.trim() || "—";
  const petugas = petugasNama?.trim();
  if (!petugas) return `Penerimaan Dudukan ${banjar}`;
  return `Penerimaan Dudukan ${banjar} (${petugas})`;
}

function uraianPenerimaanPaturunan(
  iuranNama: string,
  tempekNama: string,
  petugasNama: string | null | undefined
): string {
  const iuran = iuranNama?.trim() || "—";
  const tempekRaw = tempekNama?.trim() || "—";
  const tempek = /^tpk\.?\s/i.test(tempekRaw) ? tempekRaw : `Tpk. ${tempekRaw}`;
  const petugas = petugasNama?.trim();
  const base = `Penerimaan Paturunan ${iuran} ${tempek}`;
  if (!petugas) return base;
  return `${base} (${petugas})`;
}

type PengeluaranPosLine = { pos_nama: string; keterangan: string | null };

type PengeluaranBukuKasAgg = {
  id: string;
  tanggal: string;
  keterangan_transaksi: string | null;
  created_at: string;
  total: number;
  posLines: PengeluaranPosLine[];
};

function uraianPosPengeluaran(posNama: string, keteranganBaris: string | null | undefined): string {
  const pos = posNama.trim();
  const ket = keteranganBaris?.trim();
  if (pos && ket) return `${pos} — ${ket}`;
  return pos || ket || "";
}

/** Uraian pengeluaran: nama pos (+ ket. baris) dan keterangan umum transaksi. */
function uraianPengeluaran(
  posLines: PengeluaranPosLine[],
  keteranganTransaksi: string | null | undefined
): string {
  const posParts = posLines.map((l) => uraianPosPengeluaran(l.pos_nama, l.keterangan)).filter(Boolean);
  const posBlock = posParts.join("; ") || "Pengeluaran";
  const ketTrans = keteranganTransaksi?.trim();
  if (ketTrans) return `${posBlock} · ${ketTrans}`;
  return posBlock;
}

async function loadPengeluaranForBukuKas(
  db: Awaited<ReturnType<typeof getDb>>,
  akunId: string
): Promise<PengeluaranBukuKasAgg[]> {
  const flat = await db.select<
    {
      id: string;
      tanggal: string;
      keterangan_transaksi: string | null;
      created_at: string;
      jumlah: number;
      pos_nama: string | null;
      keterangan_pos: string | null;
    }[]
  >(
    `SELECT t.id, t.tanggal, t.keterangan as keterangan_transaksi, t.created_at,
            COALESCE(pp.jumlah, 0) as jumlah,
            pb.nama as pos_nama, pp.keterangan as keterangan_pos
     FROM transaksi_pengeluaran t
     LEFT JOIN transaksi_pengeluaran_pos pp ON pp.transaksi_id = t.id
     LEFT JOIN pos_biaya pb ON pb.id = pp.pos_biaya_id
     WHERE t.akun_keuangan_id = ?
     ORDER BY t.tanggal ASC, t.created_at ASC, pp.id ASC`,
    [akunId]
  );

  const map = new Map<string, PengeluaranBukuKasAgg>();
  for (const row of flat) {
    let entry = map.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        tanggal: row.tanggal,
        keterangan_transaksi: row.keterangan_transaksi,
        created_at: row.created_at,
        total: 0,
        posLines: [],
      };
      map.set(row.id, entry);
    }
    entry.total += Math.round(Number(row.jumlah) || 0);
    if (row.pos_nama?.trim()) {
      entry.posLines.push({
        pos_nama: row.pos_nama.trim(),
        keterangan: row.keterangan_pos,
      });
    }
  }
  return [...map.values()];
}

function hitungSaldoPeriode<T extends { tanggal: string; masuk?: number; keluar?: number; pemasukan?: number; pengeluaran?: number; saldo_berjalan?: number }>(
  raw: T[],
  params: { dari?: string; sampai?: string },
  getMasuk: (r: T) => number,
  getKeluar: (r: T) => number
): { saldo_awal: number; baris: T[]; saldo_akhir: number } {
  const dari = params.dari ? parseIsoDateString(params.dari) : null;
  const sampai = params.sampai ? parseIsoDateString(params.sampai) : null;

  let running = 0;
  const enriched = raw.map((row) => {
    running += getMasuk(row) - getKeluar(row);
    return { ...row, saldo_berjalan: running };
  });

  const barisKronologis = enriched.filter((row) => {
    if (dari && row.tanggal < dari) return false;
    if (sampai && row.tanggal > sampai) return false;
    return true;
  });

  const saldo_awal =
    barisKronologis.length > 0
      ? (barisKronologis[0].saldo_berjalan ?? 0) -
        getMasuk(barisKronologis[0]) +
        getKeluar(barisKronologis[0])
      : dari
        ? (() => {
            const sebelum = enriched.filter((r) => r.tanggal < dari);
            return sebelum[sebelum.length - 1]?.saldo_berjalan ?? 0;
          })()
        : 0;

  const saldo_akhir =
    barisKronologis.length > 0
      ? (barisKronologis[barisKronologis.length - 1].saldo_berjalan ?? saldo_awal)
      : saldo_awal;

  return { saldo_awal, baris: [...barisKronologis].reverse(), saldo_akhir };
}

export async function getSaldoAkun(akunKeuanganId: string): Promise<number> {
  const db = await getDb();
  const masuk = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(jumlah), 0) as total FROM (
       SELECT jumlah FROM paturunan_pembayaran
       WHERE akun_keuangan_id = ? AND tanggal_setor IS NOT NULL
       UNION ALL
       SELECT jumlah FROM dudukan_pembayaran
       WHERE akun_keuangan_id = ? AND tanggal_setor IS NOT NULL
       UNION ALL
       SELECT jumlah FROM penerimaan_dana_lain
       WHERE akun_keuangan_id = ? AND tanggal_setor IS NOT NULL
       UNION ALL
       SELECT pp.jumlah FROM transaksi_pemasukan_pos pp
       JOIN transaksi_pemasukan t ON t.id = pp.transaksi_id
       WHERE t.akun_keuangan_id = ?
     )`,
    [akunKeuanganId, akunKeuanganId, akunKeuanganId, akunKeuanganId]
  );
  const transferMasuk = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(jumlah), 0) as total
     FROM transaksi_transfer WHERE akun_tujuan_id = ?`,
    [akunKeuanganId]
  );
  const keluar = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(total), 0) as total FROM (
       SELECT COALESCE(SUM(pp.jumlah), 0) as total
       FROM transaksi_pengeluaran_pos pp
       JOIN transaksi_pengeluaran t ON t.id = pp.transaksi_id
       WHERE t.akun_keuangan_id = ?
       UNION ALL
       SELECT COALESCE(SUM(jumlah), 0) as total
       FROM transaksi_transfer WHERE akun_asal_id = ?
     )`,
    [akunKeuanganId, akunKeuanganId]
  );
  return (
    Math.round(Number(masuk[0]?.total) || 0) +
    Math.round(Number(transferMasuk[0]?.total) || 0) -
    Math.round(Number(keluar[0]?.total) || 0)
  );
}

export type RingkasanSaldoAkun = {
  akun_id: string;
  akun_nama: string;
  akun_jenis: AkunKeuanganJenis;
  pemasukan: number;
  pengeluaran: number;
  saldo: number;
  is_kelompok?: boolean;
  depth?: number;
  parent_akun_id?: string | null;
};

/** Saldo terkini semua akun aktif (tanpa filter periode). */
export async function listRingkasanSaldoAkun(): Promise<RingkasanSaldoAkun[]> {
  const db = await getDb();
  const rows = await db.select<
    {
      akun_id: string;
      akun_nama: string;
      akun_jenis: AkunKeuanganJenis;
      pemasukan: number;
      pengeluaran: number;
    }[]
  >(
    `SELECT a.id as akun_id, a.nama as akun_nama, a.jenis as akun_jenis,
            COALESCE(masuk.total, 0) + COALESCE(transfer_masuk.total, 0) as pemasukan,
            COALESCE(keluar.total, 0) as pengeluaran
     FROM akun_keuangan a
     LEFT JOIN (
       SELECT akun_keuangan_id, SUM(jumlah) as total FROM (
         SELECT akun_keuangan_id, jumlah FROM paturunan_pembayaran
         WHERE tanggal_setor IS NOT NULL
         UNION ALL
         SELECT akun_keuangan_id, jumlah FROM dudukan_pembayaran
         WHERE tanggal_setor IS NOT NULL
         UNION ALL
         SELECT akun_keuangan_id, jumlah FROM penerimaan_dana_lain
         WHERE tanggal_setor IS NOT NULL
         UNION ALL
         SELECT t.akun_keuangan_id, pp.jumlah
         FROM transaksi_pemasukan_pos pp
         JOIN transaksi_pemasukan t ON t.id = pp.transaksi_id
       ) GROUP BY akun_keuangan_id
     ) masuk ON masuk.akun_keuangan_id = a.id
     LEFT JOIN (
       SELECT akun_tujuan_id as akun_keuangan_id, SUM(jumlah) as total
       FROM transaksi_transfer
       GROUP BY akun_tujuan_id
     ) transfer_masuk ON transfer_masuk.akun_keuangan_id = a.id
     LEFT JOIN (
       SELECT akun_id, SUM(total) as total FROM (
         SELECT t.akun_keuangan_id as akun_id, SUM(pp.jumlah) as total
         FROM transaksi_pengeluaran t
         JOIN transaksi_pengeluaran_pos pp ON pp.transaksi_id = t.id
         GROUP BY t.akun_keuangan_id
         UNION ALL
         SELECT akun_asal_id as akun_id, SUM(jumlah) as total
         FROM transaksi_transfer
         GROUP BY akun_asal_id
       ) GROUP BY akun_id
     ) keluar ON keluar.akun_id = a.id
     WHERE a.aktif = 1 AND COALESCE(a.is_kelompok, 0) = 0
     ORDER BY a.urutan, a.nama`
  );

  return rows.map((r) => {
    const pemasukan = Math.round(Number(r.pemasukan) || 0);
    const pengeluaran = Math.round(Number(r.pengeluaran) || 0);
    return {
      akun_id: r.akun_id,
      akun_nama: r.akun_nama,
      akun_jenis: r.akun_jenis,
      pemasukan,
      pengeluaran,
      saldo: pemasukan - pengeluaran,
    };
  });
}

/** Ringkasan saldo dengan baris induk kelompok (agregat sub-akun). */
export async function listRingkasanSaldoDisplay(): Promise<{
  rows: RingkasanSaldoAkun[];
  totalSaldo: number;
}> {
  const [flat, allAkun] = await Promise.all([listRingkasanSaldoAkun(), listAkunKeuangan(true)]);
  const saldoById = new Map(flat.map((r) => [r.akun_id, r]));
  const kelompok = sortKelompokAkun(allAkun.filter((a) => isAkunKelompokRow(a)));
  const subs = allAkun.filter((a) => a.parent_akun_id && !isAkunKelompokRow(a));
  const standalone = allAkun.filter((a) => !a.parent_akun_id && !isAkunKelompokRow(a));

  const rows: RingkasanSaldoAkun[] = [];
  let totalSaldo = 0;

  for (const k of kelompok) {
    const children = subs.filter((s) => s.parent_akun_id === k.id);
    let pemasukan = 0;
    let pengeluaran = 0;
    for (const c of children) {
      const s = saldoById.get(c.id);
      if (s) {
        pemasukan += s.pemasukan;
        pengeluaran += s.pengeluaran;
        totalSaldo += s.saldo;
      }
    }
    rows.push({
      akun_id: k.id,
      akun_nama: k.nama,
      akun_jenis: k.jenis,
      pemasukan,
      pengeluaran,
      saldo: pemasukan - pengeluaran,
      is_kelompok: true,
      depth: 0,
    });
    for (const c of children) {
      const s = saldoById.get(c.id);
      if (!s) continue;
      rows.push({
        ...s,
        akun_nama: formatSubAkunKelompokNama(k.nama, s.akun_nama),
        depth: 1,
        parent_akun_id: k.id,
      });
    }
  }

  for (const a of standalone) {
    const s = saldoById.get(a.id);
    if (!s) continue;
    rows.push({ ...s, depth: 0 });
    totalSaldo += s.saldo;
  }

  return { rows, totalSaldo };
}

export async function listBukuKasKelompok(params: {
  kelompokId: string;
  dari?: string;
  sampai?: string;
}): Promise<{ saldo_awal: number; baris: BukuKasBaris[]; saldo_akhir: number }> {
  const subIds = await listAkunIdsInKelompok(params.kelompokId);
  if (subIds.length === 0) {
    return { saldo_awal: 0, baris: [], saldo_akhir: 0 };
  }

  const parts = await Promise.all(
    subIds.map((id) =>
      listBukuKas({ akunKeuanganId: id, dari: params.dari, sampai: params.sampai })
    )
  );

  const kelompok = await getAkunKeuangan(params.kelompokId);
  const kelompokNama = kelompok?.nama?.trim() ?? "";

  let allBaris: BukuKasBaris[] = [];
  for (let i = 0; i < subIds.length; i++) {
    const akun = await getAkunKeuangan(subIds[i]);
    const tag = akun
      ? kelompokNama
        ? formatSubAkunKelompokNama(kelompokNama, akun.nama)
        : akun.nama.trim()
      : "";
    for (const b of parts[i].baris) {
      allBaris.push({
        ...b,
        id: `${subIds[i]}-${b.id}`,
        uraian: tag ? `[${tag}] ${b.uraian}` : b.uraian,
        saldo_berjalan: undefined,
      });
    }
  }

  allBaris.sort((a, b) => {
    const d = b.tanggal.localeCompare(a.tanggal);
    if (d !== 0) return d;
    const c = b.created_at.localeCompare(a.created_at);
    if (c !== 0) return c;
    return b.uraian.localeCompare(a.uraian, "id");
  });

  const saldo_awal = parts.reduce((s, p) => s + p.saldo_awal, 0);
  const chrono = [...allBaris].reverse();
  let running = saldo_awal;
  for (const row of chrono) {
    running += row.masuk - row.keluar;
    row.saldo_berjalan = running;
  }
  const saldo_akhir = chrono[chrono.length - 1]?.saldo_berjalan ?? saldo_awal;

  return { saldo_awal, baris: allBaris, saldo_akhir };
}

export async function loadBukuKasForAkun(params: {
  akunKeuanganId: string;
  dari?: string;
  sampai?: string;
}): Promise<{ saldo_awal: number; baris: BukuKasBaris[]; saldo_akhir: number }> {
  const akun = await getAkunKeuangan(params.akunKeuanganId);
  if (akun && isAkunKelompokRow(akun)) {
    return listBukuKasKelompok({ kelompokId: akun.id, dari: params.dari, sampai: params.sampai });
  }
  return listBukuKas(params);
}

export async function listBukuKas(params: {
  akunKeuanganId: string;
  dari?: string;
  sampai?: string;
}): Promise<{ saldo_awal: number; baris: BukuKasBaris[]; saldo_akhir: number }> {
  const db = await getDb();
  const akunId = params.akunKeuanganId;

  const paturunan = await db.select<
    {
      tanggal: string;
      tempek_id: string;
      tempek_nama: string;
      iuran_id: string;
      iuran_nama: string;
      petugas_id: string | null;
      petugas_nama: string | null;
      total: number;
      created_at: string;
    }[]
  >(
    `SELECT p.tanggal_setor as tanggal,
            COALESCE(k.tempek_id, '') as tempek_id,
            COALESCE(NULLIF(TRIM(te.nama), ''), '—') as tempek_nama,
            p.iuran_id,
            COALESCE(NULLIF(TRIM(i.nama), ''), '—') as iuran_nama,
            p.petugas_id,
            tk.nama as petugas_nama,
            COALESCE(SUM(p.jumlah), 0) as total,
            MAX(p.created_at) as created_at
     FROM paturunan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN iuran_paturunan i ON i.id = p.iuran_id
     LEFT JOIN tempek te ON te.id = k.tempek_id
     LEFT JOIN tim_kasukretan tk ON tk.id = p.petugas_id
     WHERE p.akun_keuangan_id = ? AND p.tanggal_setor IS NOT NULL
     GROUP BY p.tanggal_setor, k.tempek_id, p.petugas_id, p.iuran_id`,
    [akunId]
  );

  const dudukan = await db.select<
    {
      tanggal: string;
      banjar_id: string;
      banjar_nama: string;
      petugas_id: string | null;
      petugas_nama: string | null;
      total: number;
      created_at: string;
    }[]
  >(
    `SELECT p.tanggal_setor as tanggal,
            k.banjar_id,
            b.nama as banjar_nama,
            p.petugas_id,
            t.nama as petugas_nama,
            COALESCE(SUM(p.jumlah), 0) as total,
            MAX(p.created_at) as created_at
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE p.akun_keuangan_id = ? AND p.tanggal_setor IS NOT NULL
     GROUP BY p.tanggal_setor, k.banjar_id, p.petugas_id`,
    [akunId]
  );

  const pengeluaran = await loadPengeluaranForBukuKas(db, akunId);

  const raw: BukuKasBaris[] = [];

  for (const p of paturunan) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    raw.push({
      id: `pat-${p.tanggal}-${p.tempek_id || "none"}-${p.petugas_id || "none"}-${p.iuran_id}`,
      tanggal: p.tanggal,
      uraian: uraianPenerimaanPaturunan(p.iuran_nama, p.tempek_nama, p.petugas_nama),
      masuk: total,
      keluar: 0,
      jenis: "paturunan",
      ref_id: `${p.tanggal}|${p.tempek_id}|${p.petugas_id ?? ""}|${p.iuran_id}`,
      created_at: p.created_at,
    });
  }

  for (const p of dudukan) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    raw.push({
      id: `dud-${p.tanggal}-${p.banjar_id}-${p.petugas_id || "none"}`,
      tanggal: p.tanggal,
      uraian: uraianPenerimaanDudukan(p.banjar_nama, p.petugas_nama),
      masuk: total,
      keluar: 0,
      jenis: "dudukan",
      ref_id: `${p.tanggal}|${p.banjar_id}|${p.petugas_id ?? ""}`,
      created_at: p.created_at,
    });
  }

  const pemasukanLain = await db.select<
    {
      id: string;
      tanggal: string;
      keterangan: string | null;
      total: number;
      pos_nama: string;
      created_at: string;
    }[]
  >(
    `SELECT t.id, t.tanggal, t.keterangan,
            COALESCE(SUM(pp.jumlah), 0) as total,
            GROUP_CONCAT(
              CASE
                WHEN TRIM(COALESCE(pp.keterangan, '')) != ''
                THEN COALESCE(pb.nama, '') || ' — ' || TRIM(pp.keterangan)
                ELSE pb.nama
              END,
              '; '
            ) as pos_nama,
            t.created_at
     FROM transaksi_pemasukan t
     LEFT JOIN transaksi_pemasukan_pos pp ON pp.transaksi_id = t.id
     LEFT JOIN pos_pemasukan pb ON pb.id = pp.pos_pemasukan_id
     WHERE t.akun_keuangan_id = ?
     GROUP BY t.id`,
    [akunId]
  );

  for (const p of pemasukanLain) {
    const pos = p.pos_nama?.trim();
    const ket = p.keterangan?.trim();
    const uraian = ket
      ? `${pos || "Pemasukan lain"} · ${ket}`
      : pos || "Pemasukan lain";
    raw.push({
      id: `mas-${p.id}`,
      tanggal: p.tanggal,
      uraian,
      masuk: Math.round(Number(p.total) || 0),
      keluar: 0,
      jenis: "pemasukan_lain",
      ref_id: p.id,
      created_at: p.created_at,
    });
  }

  const danaLain = await db.select<
    {
      id: string;
      tanggal: string;
      pos_nama: string | null;
      sumber_nama: string | null;
      kegiatan: string | null;
      keterangan: string | null;
      petugas_nama: string | null;
      total: number;
      created_at: string;
    }[]
  >(
    `SELECT p.id, p.tanggal_setor as tanggal, pb.nama as pos_nama,
            COALESCE(NULLIF(TRIM(p.sumber_nama), ''), pd.nama_lengkap, lb.nama) as sumber_nama,
            p.kegiatan, p.keterangan, tk.nama as petugas_nama,
            p.jumlah as total, p.created_at
     FROM penerimaan_dana_lain p
     LEFT JOIN pos_pemasukan pb ON pb.id = p.pos_pemasukan_id
     LEFT JOIN krama k ON k.id = p.krama_id
     LEFT JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
     LEFT JOIN lembaga_badan lb ON lb.id = p.lembaga_badan_id
     LEFT JOIN tim_kasukretan tk ON tk.id = p.petugas_id
     WHERE p.akun_keuangan_id = ? AND p.tanggal_setor IS NOT NULL`,
    [akunId]
  );
  for (const p of danaLain) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    const parts = [
      p.pos_nama?.trim() || "Dana Kasukretan",
      p.sumber_nama?.trim(),
      p.kegiatan?.trim(),
      p.petugas_nama?.trim() ? `Petugas ${p.petugas_nama.trim()}` : null,
      p.keterangan?.trim(),
    ].filter(Boolean);
    raw.push({
      id: `pdl-${p.id}`,
      tanggal: p.tanggal,
      uraian: parts.join(" · "),
      masuk: total,
      keluar: 0,
      jenis: "pemasukan_lain",
      ref_id: p.id,
      created_at: p.created_at,
    });
  }

  for (const p of pengeluaran) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    raw.push({
      id: `kel-${p.id}`,
      tanggal: p.tanggal,
      uraian: uraianPengeluaran(p.posLines, p.keterangan_transaksi),
      masuk: 0,
      keluar: total,
      jenis: "pengeluaran",
      ref_id: p.id,
      created_at: p.created_at,
    });
  }

  const transferKeluar = await db.select<
    {
      id: string;
      tanggal: string;
      jumlah: number;
      akun_tujuan_nama: string;
      keterangan: string | null;
      created_at: string;
    }[]
  >(
    `SELECT t.id, t.tanggal, t.jumlah, a.nama as akun_tujuan_nama, t.keterangan, t.created_at
     FROM transaksi_transfer t
     JOIN akun_keuangan a ON a.id = t.akun_tujuan_id
     WHERE t.akun_asal_id = ?`,
    [akunId]
  );

  const transferMasuk = await db.select<
    {
      id: string;
      tanggal: string;
      jumlah: number;
      akun_asal_nama: string;
      keterangan: string | null;
      created_at: string;
    }[]
  >(
    `SELECT t.id, t.tanggal, t.jumlah, a.nama as akun_asal_nama, t.keterangan, t.created_at
     FROM transaksi_transfer t
     JOIN akun_keuangan a ON a.id = t.akun_asal_id
     WHERE t.akun_tujuan_id = ?`,
    [akunId]
  );

  for (const t of transferKeluar) {
    const jumlah = Math.round(Number(t.jumlah) || 0);
    const ket = t.keterangan?.trim();
    const uraian = [`Transfer ke ${t.akun_tujuan_nama}`, ket].filter(Boolean).join(" — ");
    raw.push({
      id: `trf-out-${t.id}`,
      tanggal: t.tanggal,
      uraian,
      masuk: 0,
      keluar: jumlah,
      jenis: "transfer_keluar",
      ref_id: t.id,
      created_at: t.created_at,
    });
  }

  for (const t of transferMasuk) {
    const jumlah = Math.round(Number(t.jumlah) || 0);
    const ket = t.keterangan?.trim();
    const uraian = [`Transfer dari ${t.akun_asal_nama}`, ket].filter(Boolean).join(" — ");
    raw.push({
      id: `trf-in-${t.id}`,
      tanggal: t.tanggal,
      uraian,
      masuk: jumlah,
      keluar: 0,
      jenis: "transfer_masuk",
      ref_id: t.id,
      created_at: t.created_at,
    });
  }

  raw.sort(sortBukuKasKronologis);

  const { saldo_awal, baris, saldo_akhir } = hitungSaldoPeriode(
    raw,
    params,
    (r) => r.masuk,
    (r) => r.keluar
  );

  return { saldo_awal, baris, saldo_akhir };
}

export async function loadLaporanBukuKasForAkun(params: {
  akunKeuanganId: string;
  dari?: string;
  sampai?: string;
}): Promise<{
  saldo_awal: number;
  baris: LaporanBukuKasBaris[];
  saldo_akhir: number;
  sub_saldo?: LaporanBukuKasSubSaldo[];
}> {
  const akun = await getAkunKeuangan(params.akunKeuanganId);
  if (akun && isAkunKelompokRow(akun)) {
    return listLaporanBukuKasKelompok({
      kelompokId: akun.id,
      dari: params.dari,
      sampai: params.sampai,
    });
  }
  return listLaporanBukuKas(params);
}

const LAPORAN_TRANSFER_ID_RE = /trf-(?:in|out)-(.+)$/;

function extractTransferIdFromLaporanBarisId(barisId: string): string | null {
  const match = barisId.match(LAPORAN_TRANSFER_ID_RE);
  return match?.[1] ?? null;
}

function isLaporanTransferJenis(jenis: BukuKasJenisTransaksi): boolean {
  return jenis === "transfer_masuk" || jenis === "transfer_keluar";
}

/** Transfer antar sub-akun dalam satu kelompok Dana (mutasi internal). */
async function loadInternalTransferIdSetInKelompok(kelompokId: string): Promise<Set<string>> {
  const subIds = await listAkunIdsInKelompok(kelompokId);
  if (subIds.length < 2) return new Set();

  const db = await getDb();
  const placeholders = subIds.map(() => "?").join(", ");
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM transaksi_transfer
     WHERE akun_asal_id IN (${placeholders})
       AND akun_tujuan_id IN (${placeholders})`,
    [...subIds, ...subIds]
  );
  return new Set(rows.map((r) => r.id));
}

async function sumInternalTransferInKelompok(params: {
  kelompokId: string;
  dari?: string;
  sampai?: string;
}): Promise<number> {
  const subIds = await listAkunIdsInKelompok(params.kelompokId);
  if (subIds.length < 2) return 0;

  const db = await getDb();
  const placeholders = subIds.map(() => "?").join(", ");
  const dateTrf = tanggalSqlFilter(params.dari, params.sampai, "t.tanggal");
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(t.jumlah), 0) as total
     FROM transaksi_transfer t
     WHERE t.akun_asal_id IN (${placeholders})
       AND t.akun_tujuan_id IN (${placeholders})${dateTrf.sql}`,
    [...subIds, ...subIds, ...dateTrf.args]
  );
  return Math.round(Number(rows[0]?.total) || 0);
}

function filterKelompokLaporanInternalTransfers(
  baris: LaporanBukuKasBaris[],
  internalIds: Set<string>
): LaporanBukuKasBaris[] {
  if (internalIds.size === 0) return baris;
  return baris.filter((b) => {
    if (!isLaporanTransferJenis(b.jenis)) return true;
    const trfId = extractTransferIdFromLaporanBarisId(b.id);
    return !trfId || !internalIds.has(trfId);
  });
}

async function listLaporanBukuKasKelompok(params: {
  kelompokId: string;
  dari?: string;
  sampai?: string;
}): Promise<{
  saldo_awal: number;
  baris: LaporanBukuKasBaris[];
  saldo_akhir: number;
  sub_saldo: LaporanBukuKasSubSaldo[];
}> {
  const subIds = await listAkunIdsInKelompok(params.kelompokId);
  if (subIds.length === 0) {
    return { saldo_awal: 0, baris: [], saldo_akhir: 0, sub_saldo: [] };
  }

  const [parts, internalTransferIds] = await Promise.all([
    Promise.all(
      subIds.map((id) =>
        listLaporanBukuKas({ akunKeuanganId: id, dari: params.dari, sampai: params.sampai })
      )
    ),
    loadInternalTransferIdSetInKelompok(params.kelompokId),
  ]);

  const kelompok = await getAkunKeuangan(params.kelompokId);
  const kelompokNama = kelompok?.nama?.trim() ?? "";

  let allBaris: LaporanBukuKasBaris[] = [];
  const sub_saldo: LaporanBukuKasSubSaldo[] = [];
  for (let i = 0; i < subIds.length; i++) {
    const akun = await getAkunKeuangan(subIds[i]);
    const tag = akun
      ? kelompokNama
        ? formatSubAkunKelompokNama(kelompokNama, akun.nama)
        : akun.nama.trim()
      : "";
    sub_saldo.push({
      nama: akun?.nama?.trim() ?? "",
      saldo_akhir: parts[i].saldo_akhir,
    });
    for (const b of parts[i].baris) {
      allBaris.push({
        ...b,
        id: `${subIds[i]}-${b.id}`,
        uraian: tag ? `[${tag}] ${b.uraian}` : b.uraian,
      });
    }
  }

  allBaris = filterKelompokLaporanInternalTransfers(allBaris, internalTransferIds);

  allBaris.sort((a, b) => {
    const d = b.tanggal.localeCompare(a.tanggal);
    if (d !== 0) return d;
    const c = b.created_at.localeCompare(a.created_at);
    if (c !== 0) return c;
    return b.uraian.localeCompare(a.uraian, "id");
  });

  const saldo_awal = parts.reduce((s, p) => s + p.saldo_awal, 0);
  const chrono = [...allBaris].reverse();
  let running = saldo_awal;
  for (const row of chrono) {
    running += row.pemasukan - row.pengeluaran;
    row.saldo_berjalan = running;
  }
  const saldo_akhir = chrono[chrono.length - 1]?.saldo_berjalan ?? saldo_awal;

  return { saldo_awal, baris: allBaris, saldo_akhir, sub_saldo };
}

export async function listLaporanBukuKas(params: {
  akunKeuanganId: string;
  dari?: string;
  sampai?: string;
}): Promise<{ saldo_awal: number; baris: LaporanBukuKasBaris[]; saldo_akhir: number }> {
  const db = await getDb();
  const akunId = params.akunKeuanganId;

  const paturunan = await db.select<
    {
      tanggal: string;
      tempek_id: string;
      tempek_nama: string;
      iuran_id: string;
      iuran_nama: string;
      petugas_id: string | null;
      petugas_nama: string | null;
      total: number;
      created_at: string;
    }[]
  >(
    `SELECT p.tanggal_setor as tanggal,
            COALESCE(k.tempek_id, '') as tempek_id,
            COALESCE(NULLIF(TRIM(te.nama), ''), '—') as tempek_nama,
            p.iuran_id,
            COALESCE(NULLIF(TRIM(i.nama), ''), '—') as iuran_nama,
            p.petugas_id,
            tk.nama as petugas_nama,
            COALESCE(SUM(p.jumlah), 0) as total,
            MAX(p.created_at) as created_at
     FROM paturunan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN iuran_paturunan i ON i.id = p.iuran_id
     LEFT JOIN tempek te ON te.id = k.tempek_id
     LEFT JOIN tim_kasukretan tk ON tk.id = p.petugas_id
     WHERE p.akun_keuangan_id = ? AND p.tanggal_setor IS NOT NULL
     GROUP BY p.tanggal_setor, k.tempek_id, p.petugas_id, p.iuran_id`,
    [akunId]
  );

  const dudukan = await db.select<
    {
      tanggal: string;
      banjar_id: string;
      banjar_nama: string;
      petugas_id: string | null;
      petugas_nama: string | null;
      total: number;
      created_at: string;
    }[]
  >(
    `SELECT p.tanggal_setor as tanggal,
            k.banjar_id,
            b.nama as banjar_nama,
            p.petugas_id,
            t.nama as petugas_nama,
            COALESCE(SUM(p.jumlah), 0) as total,
            MAX(p.created_at) as created_at
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     WHERE p.akun_keuangan_id = ? AND p.tanggal_setor IS NOT NULL
     GROUP BY p.tanggal_setor, k.banjar_id, p.petugas_id`,
    [akunId]
  );

  const pengeluaran = await loadPengeluaranForBukuKas(db, akunId);

  const raw: LaporanBukuKasBaris[] = [];

  for (const p of paturunan) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    raw.push({
      id: `pat-${p.tanggal}-${p.tempek_id || "none"}-${p.petugas_id || "none"}-${p.iuran_id}`,
      tanggal: p.tanggal,
      uraian: uraianPenerimaanPaturunan(p.iuran_nama, p.tempek_nama, p.petugas_nama),
      pemasukan: total,
      pengeluaran: 0,
      jenis: "paturunan",
      created_at: p.created_at,
    });
  }

  for (const p of dudukan) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    raw.push({
      id: `dud-${p.tanggal}-${p.banjar_id}-${p.petugas_id || "none"}`,
      tanggal: p.tanggal,
      uraian: uraianPenerimaanDudukan(p.banjar_nama, p.petugas_nama),
      pemasukan: total,
      pengeluaran: 0,
      jenis: "dudukan",
      created_at: p.created_at,
    });
  }

  const pemasukanLain = await db.select<
    {
      id: string;
      tanggal: string;
      keterangan: string | null;
      total: number;
      pos_nama: string;
      created_at: string;
    }[]
  >(
    `SELECT t.id, t.tanggal, t.keterangan,
            COALESCE(SUM(pp.jumlah), 0) as total,
            GROUP_CONCAT(
              CASE
                WHEN TRIM(COALESCE(pp.keterangan, '')) != ''
                THEN COALESCE(pb.nama, '') || ' — ' || TRIM(pp.keterangan)
                ELSE pb.nama
              END,
              '; '
            ) as pos_nama,
            t.created_at
     FROM transaksi_pemasukan t
     LEFT JOIN transaksi_pemasukan_pos pp ON pp.transaksi_id = t.id
     LEFT JOIN pos_pemasukan pb ON pb.id = pp.pos_pemasukan_id
     WHERE t.akun_keuangan_id = ?
     GROUP BY t.id`,
    [akunId]
  );

  for (const p of pemasukanLain) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    const pos = p.pos_nama?.trim();
    const ket = p.keterangan?.trim();
    const uraian = ket
      ? `${pos || "Pemasukan lain"} · ${ket}`
      : pos || "Pemasukan lain";
    raw.push({
      id: `mas-${p.id}`,
      tanggal: p.tanggal,
      uraian,
      pemasukan: total,
      pengeluaran: 0,
      jenis: "pemasukan_lain",
      created_at: p.created_at,
    });
  }

  const danaLainLaporan = await db.select<
    {
      id: string;
      tanggal: string;
      pos_nama: string | null;
      sumber_nama: string | null;
      kegiatan: string | null;
      keterangan: string | null;
      petugas_nama: string | null;
      total: number;
      created_at: string;
    }[]
  >(
    `SELECT p.id, p.tanggal_setor as tanggal, pb.nama as pos_nama,
            COALESCE(NULLIF(TRIM(p.sumber_nama), ''), pd.nama_lengkap, lb.nama) as sumber_nama,
            p.kegiatan, p.keterangan, tk.nama as petugas_nama,
            p.jumlah as total, p.created_at
     FROM penerimaan_dana_lain p
     LEFT JOIN pos_pemasukan pb ON pb.id = p.pos_pemasukan_id
     LEFT JOIN krama k ON k.id = p.krama_id
     LEFT JOIN penduduk pd ON pd.id = k.kepala_penduduk_id
     LEFT JOIN lembaga_badan lb ON lb.id = p.lembaga_badan_id
     LEFT JOIN tim_kasukretan tk ON tk.id = p.petugas_id
     WHERE p.akun_keuangan_id = ? AND p.tanggal_setor IS NOT NULL`,
    [akunId]
  );
  for (const p of danaLainLaporan) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    const parts = [
      p.pos_nama?.trim() || "Dana Kasukretan",
      p.sumber_nama?.trim(),
      p.kegiatan?.trim(),
      p.petugas_nama?.trim() ? `Petugas ${p.petugas_nama.trim()}` : null,
      p.keterangan?.trim(),
    ].filter(Boolean);
    raw.push({
      id: `pdl-${p.id}`,
      tanggal: p.tanggal,
      uraian: parts.join(" · "),
      pemasukan: total,
      pengeluaran: 0,
      jenis: "pemasukan_lain",
      created_at: p.created_at,
    });
  }

  for (const p of pengeluaran) {
    const total = Math.round(Number(p.total) || 0);
    if (total <= 0) continue;
    raw.push({
      id: `kel-${p.id}`,
      tanggal: p.tanggal,
      uraian: uraianPengeluaran(p.posLines, p.keterangan_transaksi),
      pemasukan: 0,
      pengeluaran: total,
      jenis: "pengeluaran",
      created_at: p.created_at,
    });
  }

  const transferKeluar = await db.select<
    {
      id: string;
      tanggal: string;
      jumlah: number;
      akun_tujuan_nama: string;
      keterangan: string | null;
      created_at: string;
    }[]
  >(
    `SELECT t.id, t.tanggal, t.jumlah, a.nama as akun_tujuan_nama, t.keterangan, t.created_at
     FROM transaksi_transfer t
     JOIN akun_keuangan a ON a.id = t.akun_tujuan_id
     WHERE t.akun_asal_id = ?`,
    [akunId]
  );

  const transferMasuk = await db.select<
    {
      id: string;
      tanggal: string;
      jumlah: number;
      akun_asal_nama: string;
      keterangan: string | null;
      created_at: string;
    }[]
  >(
    `SELECT t.id, t.tanggal, t.jumlah, a.nama as akun_asal_nama, t.keterangan, t.created_at
     FROM transaksi_transfer t
     JOIN akun_keuangan a ON a.id = t.akun_asal_id
     WHERE t.akun_tujuan_id = ?`,
    [akunId]
  );

  for (const t of transferKeluar) {
    const total = Math.round(Number(t.jumlah) || 0);
    if (total <= 0) continue;
    const ket = t.keterangan?.trim();
    const uraian = [`Transfer ke ${t.akun_tujuan_nama}`, ket].filter(Boolean).join(" — ");
    raw.push({
      id: `trf-out-${t.id}`,
      tanggal: t.tanggal,
      uraian,
      pemasukan: 0,
      pengeluaran: total,
      jenis: "transfer_keluar",
      created_at: t.created_at,
    });
  }

  for (const t of transferMasuk) {
    const total = Math.round(Number(t.jumlah) || 0);
    if (total <= 0) continue;
    const ket = t.keterangan?.trim();
    const uraian = [`Transfer dari ${t.akun_asal_nama}`, ket].filter(Boolean).join(" — ");
    raw.push({
      id: `trf-in-${t.id}`,
      tanggal: t.tanggal,
      uraian,
      pemasukan: total,
      pengeluaran: 0,
      jenis: "transfer_masuk",
      created_at: t.created_at,
    });
  }

  raw.sort(sortBukuKasKronologis);

  const { saldo_awal, baris, saldo_akhir } = hitungSaldoPeriode(
    raw,
    params,
    (r) => r.pemasukan,
    (r) => r.pengeluaran
  );

  return { saldo_awal, baris, saldo_akhir };
}

const POS_REKAP_PATURUNAN = "Penerimaan Paturunan";
const POS_REKAP_DUDUKAN = "Penerimaan Dudukan";
const POS_REKAP_TRANSFER_MASUK = "Transfer masuk";
const POS_REKAP_TRANSFER_KELUAR = "Transfer keluar";

function kurangiRekapPosTransferInternal(map: Map<string, RekapPosAgg>, internalTotal: number): void {
  if (internalTotal <= 0) return;

  const masukKey = `in:${POS_REKAP_TRANSFER_MASUK}`;
  const keluarKey = `out:${POS_REKAP_TRANSFER_KELUAR}`;
  const masuk = map.get(masukKey);
  const keluar = map.get(keluarKey);

  if (masuk) {
    masuk.pemasukan = Math.max(0, masuk.pemasukan - internalTotal);
    if (masuk.pemasukan <= 0) map.delete(masukKey);
  }
  if (keluar) {
    keluar.pengeluaran = Math.max(0, keluar.pengeluaran - internalTotal);
    if (keluar.pengeluaran <= 0) map.delete(keluarKey);
  }
}

function tanggalSqlFilter(
  dari?: string,
  sampai?: string,
  col = "tanggal"
): { sql: string; args: string[] } {
  const args: string[] = [];
  let sql = "";
  const dariIso = dari ? parseIsoDateString(dari) : null;
  const sampaiIso = sampai ? parseIsoDateString(sampai) : null;
  if (dariIso) {
    sql += ` AND ${col} >= ?`;
    args.push(dariIso);
  }
  if (sampaiIso) {
    sql += ` AND ${col} <= ?`;
    args.push(sampaiIso);
  }
  return { sql, args };
}

type RekapPosAgg = {
  pos: string;
  pemasukan: number;
  pengeluaran: number;
  urutan: number;
};

function addPemasukanPos(map: Map<string, RekapPosAgg>, pos: string, jumlah: number, urutan: number): void {
  const total = Math.round(Number(jumlah) || 0);
  if (total <= 0) return;
  const key = `in:${pos}`;
  const existing = map.get(key);
  if (existing) {
    existing.pemasukan += total;
    existing.urutan = Math.min(existing.urutan, urutan);
    return;
  }
  map.set(key, { pos, pemasukan: total, pengeluaran: 0, urutan });
}

function addPengeluaranPos(map: Map<string, RekapPosAgg>, pos: string, jumlah: number, urutan: number): void {
  const total = Math.round(Number(jumlah) || 0);
  if (total <= 0) return;
  const key = `out:${pos}`;
  const existing = map.get(key);
  if (existing) {
    existing.pengeluaran += total;
    existing.urutan = Math.min(existing.urutan, urutan);
    return;
  }
  map.set(key, { pos, pemasukan: 0, pengeluaran: total, urutan });
}

function saldoAwalKolom(saldoAwal: number): { pemasukan: number; pengeluaran: number } {
  const n = Math.round(Number(saldoAwal) || 0);
  if (n > 0) return { pemasukan: n, pengeluaran: 0 };
  if (n < 0) return { pemasukan: 0, pengeluaran: Math.abs(n) };
  return { pemasukan: 0, pengeluaran: 0 };
}

function buildLaporanKasRekapPerPosBaris(
  rows: RekapPosAgg[],
  saldoAwal: number
): LaporanKasRekapPerPosBaris[] {
  const pemasukanRows = rows
    .filter((r) => r.pemasukan > 0)
    .sort((a, b) => a.urutan - b.urutan || a.pos.localeCompare(b.pos, "id"));
  const pengeluaranRows = rows
    .filter((r) => r.pengeluaran > 0)
    .sort((a, b) => a.urutan - b.urutan || a.pos.localeCompare(b.pos, "id"));

  const dataRows = [...pemasukanRows, ...pengeluaranRows];
  const subPemasukan = dataRows.reduce((s, r) => s + r.pemasukan, 0);
  const subPengeluaran = dataRows.reduce((s, r) => s + r.pengeluaran, 0);
  const selisih = subPemasukan - subPengeluaran;
  const saldoPemasukan = selisih < 0 ? Math.abs(selisih) : 0;
  const saldoPengeluaran = selisih > 0 ? selisih : 0;

  const awal = saldoAwalKolom(saldoAwal);
  const baris: LaporanKasRekapPerPosBaris[] = [
    {
      pos: "Saldo Awal",
      pemasukan: awal.pemasukan,
      pengeluaran: awal.pengeluaran,
      kind: "saldo_awal",
    },
    ...dataRows.map((r, i) => ({
      no: i + 1,
      pos: r.pos,
      pemasukan: r.pemasukan,
      pengeluaran: r.pengeluaran,
      kind: "data" as const,
    })),
    {
      pos: "Jumlah",
      pemasukan: subPemasukan,
      pengeluaran: subPengeluaran,
      kind: "jumlah",
    },
    {
      pos: "Saldo",
      pemasukan: saldoPemasukan,
      pengeluaran: saldoPengeluaran,
      kind: "saldo",
    },
    {
      pos: "Total",
      pemasukan: subPemasukan + saldoPemasukan,
      pengeluaran: subPengeluaran + saldoPengeluaran,
      kind: "total",
    },
  ];

  return baris;
}

async function collectRekapPosAggForAkun(params: {
  akunKeuanganId: string;
  dari?: string;
  sampai?: string;
}): Promise<RekapPosAgg[]> {
  const db = await getDb();
  const akunId = params.akunKeuanganId;
  const datePat = tanggalSqlFilter(params.dari, params.sampai);
  const dateSetor = tanggalSqlFilter(params.dari, params.sampai, "tanggal_setor");
  const dateTrf = tanggalSqlFilter(params.dari, params.sampai, "t.tanggal");
  const map = new Map<string, RekapPosAgg>();

  const pemasukanPos = await db.select<
    { nama: string; urutan: number; total: number }[]
  >(
    `SELECT pb.nama, pb.urutan, COALESCE(SUM(pp.jumlah), 0) as total
     FROM transaksi_pemasukan_pos pp
     JOIN transaksi_pemasukan t ON t.id = pp.transaksi_id
     JOIN pos_pemasukan pb ON pb.id = pp.pos_pemasukan_id
     WHERE t.akun_keuangan_id = ?${datePat.sql}
     GROUP BY pb.id
     HAVING total > 0`,
    [akunId, ...datePat.args]
  );
  for (const row of pemasukanPos) {
    addPemasukanPos(map, row.nama.trim() || "—", row.total, 100 + (Number(row.urutan) || 0));
  }

  const paturunan = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(jumlah), 0) as total
     FROM paturunan_pembayaran
     WHERE akun_keuangan_id = ? AND tanggal_setor IS NOT NULL${dateSetor.sql}`,
    [akunId, ...dateSetor.args]
  );
  addPemasukanPos(map, POS_REKAP_PATURUNAN, paturunan[0]?.total ?? 0, 1);

  const dudukan = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(jumlah), 0) as total
     FROM dudukan_pembayaran
     WHERE akun_keuangan_id = ? AND tanggal_setor IS NOT NULL${dateSetor.sql}`,
    [akunId, ...dateSetor.args]
  );
  addPemasukanPos(map, POS_REKAP_DUDUKAN, dudukan[0]?.total ?? 0, 2);

  const danaLainPos = await db.select<{ nama: string; urutan: number; total: number }[]>(
    `SELECT pb.nama, pb.urutan, COALESCE(SUM(p.jumlah), 0) as total
     FROM penerimaan_dana_lain p
     JOIN pos_pemasukan pb ON pb.id = p.pos_pemasukan_id
     WHERE p.akun_keuangan_id = ? AND p.tanggal_setor IS NOT NULL${dateSetor.sql}
     GROUP BY pb.id
     HAVING total > 0`,
    [akunId, ...dateSetor.args]
  );
  for (const row of danaLainPos) {
    addPemasukanPos(map, row.nama.trim() || "—", row.total, 100 + (Number(row.urutan) || 0));
  }

  const transferMasuk = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(t.jumlah), 0) as total
     FROM transaksi_transfer t
     WHERE t.akun_tujuan_id = ?${dateTrf.sql}`,
    [akunId, ...dateTrf.args]
  );
  addPemasukanPos(map, POS_REKAP_TRANSFER_MASUK, transferMasuk[0]?.total ?? 0, 900);

  const pengeluaranPos = await db.select<
    { nama: string; urutan: number; total: number }[]
  >(
    `SELECT pb.nama, pb.urutan, COALESCE(SUM(pp.jumlah), 0) as total
     FROM transaksi_pengeluaran_pos pp
     JOIN transaksi_pengeluaran t ON t.id = pp.transaksi_id
     JOIN pos_biaya pb ON pb.id = pp.pos_biaya_id
     WHERE t.akun_keuangan_id = ?${datePat.sql}
     GROUP BY pb.id
     HAVING total > 0`,
    [akunId, ...datePat.args]
  );
  for (const row of pengeluaranPos) {
    addPengeluaranPos(map, row.nama.trim() || "—", row.total, Number(row.urutan) || 0);
  }

  const transferKeluar = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(t.jumlah), 0) as total
     FROM transaksi_transfer t
     WHERE t.akun_asal_id = ?${dateTrf.sql}`,
    [akunId, ...dateTrf.args]
  );
  addPengeluaranPos(map, POS_REKAP_TRANSFER_KELUAR, transferKeluar[0]?.total ?? 0, 900);

  return [...map.values()];
}

async function collectRekapPosAggKelompok(params: {
  kelompokId: string;
  dari?: string;
  sampai?: string;
}): Promise<RekapPosAgg[]> {
  const subIds = await listAkunIdsInKelompok(params.kelompokId);
  if (subIds.length === 0) return [];

  const [parts, internalTotal] = await Promise.all([
    Promise.all(
      subIds.map((id) =>
        collectRekapPosAggForAkun({
          akunKeuanganId: id,
          dari: params.dari,
          sampai: params.sampai,
        })
      )
    ),
    sumInternalTransferInKelompok(params),
  ]);

  const map = new Map<string, RekapPosAgg>();
  for (const rows of parts) {
    for (const row of rows) {
      if (row.pemasukan > 0) {
        addPemasukanPos(map, row.pos, row.pemasukan, row.urutan);
      }
      if (row.pengeluaran > 0) {
        addPengeluaranPos(map, row.pos, row.pengeluaran, row.urutan);
      }
    }
  }

  kurangiRekapPosTransferInternal(map, internalTotal);

  return [...map.values()];
}

export async function loadLaporanKasRekapPerPosForAkun(params: {
  akunKeuanganId: string;
  dari?: string;
  sampai?: string;
}): Promise<LaporanKasRekapPerPosBaris[]> {
  const [bukuKas, akun] = await Promise.all([
    loadLaporanBukuKasForAkun(params),
    getAkunKeuangan(params.akunKeuanganId),
  ]);
  const rows =
    akun && isAkunKelompokRow(akun)
      ? await collectRekapPosAggKelompok({
          kelompokId: akun.id,
          dari: params.dari,
          sampai: params.sampai,
        })
      : await collectRekapPosAggForAkun(params);
  return buildLaporanKasRekapPerPosBaris(rows, bukuKas.saldo_awal);
}
