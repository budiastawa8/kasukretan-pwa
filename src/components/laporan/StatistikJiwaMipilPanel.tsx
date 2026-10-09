import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, UserCircle, UserRound, UserSquare } from "lucide-react";
import {
  daftarStatistikJiwaMipil,
  jumlahStatistikJiwaJenis,
  kriteriaStatistikJiwaJenis,
  labelStatistikJiwaJenis,
  type JiwaMipilBaris,
  type LaporanStatistikJiwaMipil,
  type StatistikJiwaJenis,
} from "../../lib/services/statistik-jiwa-mipil";
import {
  LIST_PAGE_SIZE,
  clampPage,
  paginateSlice,
} from "../../lib/pagination";
import { cn } from "../../lib/utils";
import { ListPagination } from "../ui/ListPagination";
import {
  LAPORAN_BODY_ROW,
  LAPORAN_CARD,
  LAPORAN_HEAD_ROW,
  LAPORAN_TABLE_ELEMENT,
} from "./laporan-compact";

export type { StatistikJiwaJenis };

const JENIS_TABS: { id: StatistikJiwaJenis; label: string; Icon: typeof Sparkles }[] = [
  { id: "yowana", label: "Yowana", Icon: Sparkles },
  { id: "wredha", label: "Wredha", Icon: UserRound },
  { id: "balu_lanang", label: "Balu Lanang", Icon: UserCircle },
  { id: "balu_istri", label: "Balu Istri", Icon: UserSquare },
];

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function JiwaTable({ rows, emptyHint }: { rows: JiwaMipilBaris[]; emptyHint: string }) {
  return (
    <div className="overflow-x-auto -mx-0.5">
      <table className={LAPORAN_TABLE_ELEMENT}>
        <thead>
          <tr className={LAPORAN_HEAD_ROW}>
            <th>No. Pipil</th>
            <th>Nama</th>
            <th>JK</th>
            <th className="text-right">Umur</th>
            <th>Status kawin</th>
            <th>Banjar</th>
            <th>Tempek</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-4 text-center text-muted text-xs">
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={`${r.krama_id}:${r.nomor_kartu}:${r.nama_lengkap}`} className={LAPORAN_BODY_ROW}>
                <td className="font-mono text-xs">
                  <Link
                    to={`/krama-mipil/${r.krama_id}`}
                    className="text-copper-800 hover:underline"
                  >
                    {r.nomor_kartu}
                  </Link>
                </td>
                <td>{r.nama_lengkap}</td>
                <td className="text-xs">{r.jenis_kelamin}</td>
                <td className="text-right tabular-nums text-xs">{r.umur > 0 ? r.umur : "—"}</td>
                <td className="text-xs">{r.status_kawin_label}</td>
                <td className="text-xs">
                  {r.banjar_kode} — {r.banjar_nama}
                </td>
                <td className="text-xs">{r.tempek_nama}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function emptyHintForJenis(data: LaporanStatistikJiwaMipil, jenis: StatistikJiwaJenis): string {
  const label = labelStatistikJiwaJenis(jenis);
  if (jenis === "yowana" && !data.yowanaConfigured) {
    return "Atur usia Yowana di Master Data → Profil Desa.";
  }
  if (jenis === "wredha" && !data.wredhaConfigured) {
    return "Atur batas umur Nyada di Master Data → Profil Desa.";
  }
  return `Tidak ada anggota yang memenuhi kriteria ${label}.`;
}

function sortHintForJenis(jenis: StatistikJiwaJenis): string {
  return jenis === "balu_lanang" || jenis === "balu_istri" ? "Urut nama A–Z" : "Urut umur A–Z";
}

export function StatistikJiwaMipilPanel({
  data,
  loading,
  activeJenis,
  onJenisChange,
}: {
  data: LaporanStatistikJiwaMipil | null;
  loading: boolean;
  activeJenis: StatistikJiwaJenis;
  onJenisChange: (jenis: StatistikJiwaJenis) => void;
}) {
  const [listPage, setListPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  useEffect(() => {
    setListPage(1);
  }, [data, activeJenis]);

  const activeRows = useMemo(
    () => (data ? daftarStatistikJiwaMipil(data, activeJenis) : []),
    [data, activeJenis]
  );

  const safePage = useMemo(
    () => clampPage(listPage, activeRows.length, pageSize),
    [listPage, activeRows.length, pageSize]
  );
  const pagedRows = useMemo(
    () => paginateSlice(activeRows, safePage, pageSize),
    [activeRows, safePage, pageSize]
  );

  useEffect(() => {
    if (listPage !== safePage) setListPage(safePage);
  }, [listPage, safePage]);

  if (loading) {
    return <p className="text-xs text-muted py-4 text-center">Memuat statistik jiwa…</p>;
  }

  if (!data) {
    return <p className="text-xs text-muted py-4 text-center">Tidak ada data.</p>;
  }

  const activeSub = kriteriaStatistikJiwaJenis(data, activeJenis);
  const emptyHint = emptyHintForJenis(data, activeJenis);

  return (
    <div className="space-y-3">
      <div className={cn(LAPORAN_CARD, "space-y-2")}>
        <div className="flex flex-wrap items-center gap-1">
          <StatChip label="Total jiwa aktif" value={String(data.total_jiwa)} />
          <StatChip label="Yowana" value={data.yowanaConfigured ? String(data.yowana) : "—"} />
          <StatChip label="Wredha" value={data.wredhaConfigured ? String(data.wredha) : "—"} />
          <StatChip label="Balu Lanang" value={String(data.balu_lanang)} />
          <StatChip label="Balu Istri" value={String(data.balu_istri)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[11px] text-copper-700 border-t border-copper-100 pt-2">
          {JENIS_TABS.map(({ id, label }) => (
            <p key={id}>
              <span className="font-medium text-copper-900">{label}:</span>{" "}
              {kriteriaStatistikJiwaJenis(data, id)}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-0.5 rounded-md bg-copper-100/80 border border-copper-200 w-fit max-w-full">
        {JENIS_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={cn(
              "inline-flex items-center gap-1 px-3 py-1 text-xs rounded font-medium",
              activeJenis === id ? "bg-white text-copper-900 shadow-sm" : "text-muted"
            )}
            onClick={() => onJenisChange(id)}
          >
            <Icon size={14} />
            {label}
            <span className="tabular-nums text-[10px] text-muted">
              ({jumlahStatistikJiwaJenis(data, id)})
            </span>
          </button>
        ))}
      </div>

      <div className={cn(LAPORAN_CARD, "space-y-2")}>
        <p className="text-[11px] text-muted">
          {activeSub} · {sortHintForJenis(activeJenis)}
        </p>
        <JiwaTable rows={pagedRows} emptyHint={emptyHint} />
        <ListPagination
          page={safePage}
          totalItems={activeRows.length}
          pageSize={pageSize}
          onPageChange={setListPage}
          onPageSizeChange={setPageSize}
          compact
        />
      </div>

      <p className="text-[11px] text-muted">
        Ketentuan usia Yowana/Wredha diatur di{" "}
        <Link to="/master" className="text-copper-800 hover:underline font-medium">
          Master Data → Profil Desa
        </Link>
        . Wredha dihitung per jiwa — satu Pipil boleh memiliki lebih dari satu Wredha. Balu dihitung
        per jiwa berstatus cerai hidup atau cerai mati.
      </p>
    </div>
  );
}
