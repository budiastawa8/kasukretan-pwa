import type {
  RekapDemografiBaris,
  RekapDemografiMipil,
  RekapDemografiPerBanjar,
} from "../../lib/services/laporan-demografi-mipil";
import { cn } from "../../lib/utils";
import {
  LAPORAN_CARD,
  LAPORAN_HEAD_ROW,
  LAPORAN_TABLE_ELEMENT,
} from "./laporan-compact";

function pct(jumlah: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((jumlah / total) * 100).toFixed(1)}%`;
}

function DemografiMiniTable({
  title,
  baris,
  total,
}: {
  title: string;
  baris: RekapDemografiBaris[];
  total: number;
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-xs font-semibold text-copper-900 mb-1">{title}</h4>
      <div className="overflow-x-auto -mx-0.5">
        <table className={cn(LAPORAN_TABLE_ELEMENT, "text-xs")}>
          <thead>
            <tr className={LAPORAN_HEAD_ROW}>
              <th>Kategori</th>
              <th className="text-right w-16">Jumlah</th>
              <th className="text-right w-14">%</th>
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-2 text-center text-muted">
                  —
                </td>
              </tr>
            ) : (
              baris.map((b) => (
                <tr key={b.label} className="border-b border-copper-50">
                  <td>{b.label}</td>
                  <td className="text-right tabular-nums">{b.jumlah}</td>
                  <td className="text-right tabular-nums text-muted">{pct(b.jumlah, total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BanjarDemografiBlock({ banjar }: { banjar: RekapDemografiPerBanjar }) {
  const total = banjar.total;
  return (
    <div className={cn(LAPORAN_CARD, "space-y-3")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-copper-100 pb-2">
        <h3 className="text-sm font-semibold text-copper-900">
          {banjar.banjar_kode} — {banjar.banjar_nama}
        </h3>
        <span className="text-xs text-muted">
          Total anggota: <span className="font-semibold text-copper-900 tabular-nums">{total}</span>
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DemografiMiniTable title="Jenis kelamin" baris={banjar.jenis_kelamin} total={total} />
        <DemografiMiniTable title="Kelompok usia (BPS)" baris={banjar.kelompok_usia} total={total} />
        <DemografiMiniTable title="Pekerjaan" baris={banjar.pekerjaan} total={total} />
        <DemografiMiniTable title="Status perkawinan" baris={banjar.status_kawin} total={total} />
      </div>
    </div>
  );
}

export function RekapDemografiMipilPanel({
  data,
  loading,
}: {
  data: RekapDemografiMipil | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p className="text-xs text-muted py-4 text-center">Memuat rekap demografi…</p>
    );
  }

  if (!data || data.total_jiwa === 0) {
    return (
      <p className="text-xs text-muted py-4 text-center">Tidak ada anggota aktif untuk filter ini.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn(LAPORAN_CARD, "space-y-3")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-copper-900">Keseluruhan</h3>
          <span className="text-xs text-muted">
            Total jiwa:{" "}
            <span className="font-semibold text-copper-900 tabular-nums">{data.total_jiwa}</span>
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DemografiMiniTable title="Jenis kelamin" baris={data.jenis_kelamin} total={data.total_jiwa} />
          <DemografiMiniTable
            title="Kelompok usia (BPS)"
            baris={data.kelompok_usia}
            total={data.total_jiwa}
          />
          <DemografiMiniTable title="Pekerjaan" baris={data.pekerjaan} total={data.total_jiwa} />
          <DemografiMiniTable
            title="Status perkawinan"
            baris={data.status_kawin}
            total={data.total_jiwa}
          />
        </div>
      </div>

      {data.banjar.map((b) => (
        <BanjarDemografiBlock key={b.banjar_id} banjar={b} />
      ))}
    </div>
  );
}

export function buildDemografiExcelRows(data: RekapDemografiMipil): (string | number)[][] {
  const rows: (string | number)[][] = [];

  const appendBlock = (
    scope: string,
    dimensi: string,
    baris: RekapDemografiBaris[],
    total: number
  ) => {
    for (const b of baris) {
      rows.push([scope, dimensi, b.label, b.jumlah, pct(b.jumlah, total)]);
    }
  };

  rows.push(["Banjar / Wilayah", "Dimensi", "Kategori", "Jumlah", "%"]);

  appendBlock("Keseluruhan", "Jenis kelamin", data.jenis_kelamin, data.total_jiwa);
  appendBlock("Keseluruhan", "Kelompok usia (BPS)", data.kelompok_usia, data.total_jiwa);
  appendBlock("Keseluruhan", "Pekerjaan", data.pekerjaan, data.total_jiwa);
  appendBlock("Keseluruhan", "Status perkawinan", data.status_kawin, data.total_jiwa);

  for (const b of data.banjar) {
    const scope = `${b.banjar_kode} — ${b.banjar_nama}`;
    appendBlock(scope, "Jenis kelamin", b.jenis_kelamin, b.total);
    appendBlock(scope, "Kelompok usia (BPS)", b.kelompok_usia, b.total);
    appendBlock(scope, "Pekerjaan", b.pekerjaan, b.total);
    appendBlock(scope, "Status perkawinan", b.status_kawin, b.total);
  }

  return rows;
}
