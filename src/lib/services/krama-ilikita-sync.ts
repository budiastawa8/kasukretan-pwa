import { getDb } from "../db/client";
import { isAutoPerpanjangPemasihUntuk, isEnforceMasaBerlakuPipil } from "../ilikita-kebijakan";
import {
  hitungStatusIlikitaSetelahSync,
  isKramaNonaktifTotal,
  isMasaBerlakuHabis,
  isMasaBerlakuSiapPerpanjang,
  normalizeStatusIlikita,
  statusIlikitaColumn,
  statusIlikitaFromKrama,
  tanggalBerlakuAkhirIso,
} from "../status-ilikita";
import type { DesaAdat, KlasifikasiKode, KramaDetail } from "../types";
import { getDesaAdat } from "./desa";
import { applyPerpanjangPemasih } from "./krama-pemasih-perpanjangan";

export type IlikitaSyncStub = KramaDetail & { klasifikasi_kode: KlasifikasiKode };

export async function syncStatusIlikitaStored(
  krama: IlikitaSyncStub,
  opts?: { desa?: DesaAdat | null }
): Promise<void> {
  if (isKramaNonaktifTotal(krama)) {
    const pipil = normalizeStatusIlikita(krama.status_pipil);
    const pemasih = normalizeStatusIlikita(krama.status_pemasih);
    if (pipil !== "tidak_aktif" || pemasih !== "tidak_aktif") {
      const db = await getDb();
      await db.execute(
        `UPDATE krama SET status_pipil = 'tidak_aktif', status_pemasih = 'tidak_aktif', updated_at = datetime('now') WHERE id = $1`,
        [krama.id]
      );
      krama.status_pipil = "tidak_aktif";
      krama.status_pemasih = "tidak_aktif";
    }
    return;
  }

  const col = statusIlikitaColumn(krama.klasifikasi_kode);
  if (!col) return;

  const desa = opts?.desa !== undefined ? opts.desa : await getDesaAdat();

  if (
    col === "status_pemasih" &&
    isAutoPerpanjangPemasihUntuk(krama, desa) &&
    isMasaBerlakuSiapPerpanjang(krama)
  ) {
    const akhir = tanggalBerlakuAkhirIso(krama);
    if (akhir) {
      await applyPerpanjangPemasih(krama, akhir, "otomatis");
      return;
    }
  }

  const current = normalizeStatusIlikita(
    statusIlikitaFromKrama(krama.klasifikasi_kode, krama)
  );
  const enforcePipil = col !== "status_pipil" || isEnforceMasaBerlakuPipil(desa);
  const habis = enforcePipil && isMasaBerlakuHabis(krama);
  const next = hitungStatusIlikitaSetelahSync(current, habis);
  if (next === current) return;

  const db = await getDb();
  await db.execute(
    `UPDATE krama SET ${col} = $1, updated_at = datetime('now') WHERE id = $2`,
    [next, krama.id]
  );
  if (col === "status_pipil") krama.status_pipil = next;
  else krama.status_pemasih = next;
}

type BatchSyncRow = {
  id: string;
  nomor_kartu: string;
  jenis_kartu: string;
  klasifikasi_kode: string;
  klasifikasi_nama: string;
  masa_berlaku_tahun: number | null;
  auto_perpanjang_pemasih: number | null;
  tanggal_terdaftar: string;
  tanggal_berlaku_mulai_pemasih: string | null;
  status_krama: string;
  status_pipil: string | null;
  status_pemasih: string | null;
  kepala_nama: string;
};

let batchSyncRunning: Promise<void> | null = null;
let batchSyncCompleted = false;

async function runBatchSyncStatusIlikita(): Promise<void> {
  const db = await getDb();
  const desa = await getDesaAdat();
  const rows = await db.select<BatchSyncRow[]>(
    `SELECT k.id, k.nomor_kartu, k.jenis_kartu, k.tanggal_terdaftar,
            k.tanggal_berlaku_mulai_pemasih, k.status_krama, k.status_pipil, k.status_pemasih,
            kk.kode as klasifikasi_kode, kk.nama_tampilan as klasifikasi_nama,
            p.nama_lengkap as kepala_nama,
            COALESCE(jm.masa_berlaku_tahun, jkt.masa_berlaku_tahun, jt.masa_berlaku_tahun) as masa_berlaku_tahun,
            COALESCE(jkt.auto_perpanjang, jt.auto_perpanjang) as auto_perpanjang_pemasih
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.status_krama = 'aktif'
       AND kk.kode IN ('MIPIL', 'KRAMA_TAMIU', 'TAMIU')`
  );

  for (const row of rows) {
    const stub: IlikitaSyncStub = {
      id: row.id,
      nomor_kartu: row.nomor_kartu,
      jenis_kartu: row.jenis_kartu as KramaDetail["jenis_kartu"],
      klasifikasi_kode: row.klasifikasi_kode as KlasifikasiKode,
      klasifikasi_nama: row.klasifikasi_nama,
      gelar_kepala: "",
      banjar_id: "",
      banjar_nama: "",
      banjar_kode: "",
      masa_berlaku_tahun: row.masa_berlaku_tahun,
      auto_perpanjang_pemasih: row.auto_perpanjang_pemasih,
      tanggal_terdaftar: row.tanggal_terdaftar,
      tanggal_berlaku_mulai_pemasih: row.tanggal_berlaku_mulai_pemasih,
      status_krama: row.status_krama,
      status_pipil: row.status_pipil,
      status_pemasih: row.status_pemasih,
      kepala: { id: "", nama_lengkap: row.kepala_nama, jenis_kelamin: "" },
      anggota_aktif: [],
    };
    await syncStatusIlikitaStored(stub, { desa });
  }
}

/** Sinkron status ilikita ke DB sekali per sesi (background). */
export function runBatchSyncStatusIlikitaBackground(): void {
  if (batchSyncCompleted || batchSyncRunning) return;
  batchSyncRunning = runBatchSyncStatusIlikita()
    .catch(() => {
      /* abaikan — daftar tetap pakai preview */
    })
    .finally(() => {
      batchSyncCompleted = true;
      batchSyncRunning = null;
    });
}
