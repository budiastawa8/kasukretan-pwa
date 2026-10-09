import { useEffect, useMemo, useState } from "react";
import { useTableSort } from "../hooks/useTableSort";
import { sortTableRows } from "../lib/table-sort";
import { PEMASIH_PERHATIAN_SORT } from "../lib/table-sort-accessors";
import { SortableTableHead } from "../components/ui/SortableTableHead";
import { Link, useSearchParams } from "react-router-dom";
import { listPemasihPerhatian } from "../lib/services/krama";
import { PEMASIH_PERINGATAN_HARI, type PemasihPerhatianFilter } from "../lib/pemasih-perhatian";
import { formatTanggalLahir } from "../lib/utils";
import { BackLink } from "../components/ui/BackLink";
import { Card } from "../components/ui/Card";
import {
  LIST_BODY_ROW,
  LIST_CARD,
  LIST_CARD_PHONE,
  LIST_HEAD_ROW,
  LIST_PAGE,
  LIST_TABLE,
  LIST_TABLE_ELEMENT,
} from "../components/ui/list-compact";
import { cn } from "../lib/utils";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";

function parseFilter(raw: string | null): PemasihPerhatianFilter | "semua" {
  if (raw === "tidak-aktif" || raw === "tidak_aktif") return "tidak_aktif";
  if (raw === "akan-habis" || raw === "akan_habis") return "akan_habis";
  return "semua";
}

export function PemasihPerhatianPage() {
  const [searchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get("filter"));
  const isPhone = useIsPhoneClient();
  const [items, setItems] = useState<Awaited<ReturnType<typeof listPemasihPerhatian>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listPemasihPerhatian()
      .then(setItems)
      .finally(() => setLoading(false));
  }, []);

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const filtered = useMemo(() => {
    if (filter === "semua") return items;
    return items.filter((i) => i.alasan === filter);
  }, [items, filter]);

  const sorted = useMemo(
    () => sortTableRows(filtered, sortKey, sortDir, PEMASIH_PERHATIAN_SORT),
    [filtered, sortKey, sortDir]
  );

  const title =
    filter === "tidak_aktif"
      ? "Pemasih tidak aktif"
      : filter === "akan_habis"
        ? `Pemasih akan habis (≤ ${PEMASIH_PERINGATAN_HARI} hari)`
        : "Pemasih perlu perhatian";

  return (
    <div className={LIST_PAGE}>
      <BackLink to="/" className={cn(isPhone && "h-11 justify-center text-sm")}>
        Kembali ke Dashboard
      </BackLink>
      <h2 className={cn("font-bold", isPhone ? "text-xl" : "text-2xl")}>{title}</h2>

      <div
        className={cn(
          "flex flex-wrap gap-2 text-sm",
          isPhone && "rounded-lg border border-copper-200 bg-copper-50/60 p-2"
        )}
      >
        <Link
          to="/krama-pemasih/perhatian"
          className={cn(
            filter === "semua"
              ? "font-semibold text-copper-900 underline"
              : "text-copper-700 hover:underline",
            isPhone && "inline-flex h-10 items-center px-2"
          )}
        >
          Semua
        </Link>
        <span className="text-muted self-center">·</span>
        <Link
          to="/krama-pemasih/perhatian?filter=tidak-aktif"
          className={cn(
            filter === "tidak_aktif"
              ? "font-semibold text-copper-900 underline"
              : "text-copper-700 hover:underline",
            isPhone && "inline-flex h-10 items-center px-2"
          )}
        >
          Tidak aktif
        </Link>
        <span className="text-muted self-center">·</span>
        <Link
          to="/krama-pemasih/perhatian?filter=akan-habis"
          className={cn(
            filter === "akan_habis"
              ? "font-semibold text-copper-900 underline"
              : "text-copper-700 hover:underline",
            isPhone && "inline-flex h-10 items-center px-2"
          )}
        >
          Akan habis
        </Link>
      </div>

      <Card className={cn(LIST_CARD, isPhone && LIST_CARD_PHONE, LIST_TABLE)}>
        {loading ? (
          <p className="text-sm text-muted">Memuat...</p>
        ) : !sorted.length ? (
          <p className="text-sm text-muted">Tidak ada Pemasih dalam kategori ini.</p>
        ) : isPhone ? (
          <ul className="space-y-2">
            {sorted.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-copper-950">{r.kepala_nama}</p>
                    <p className="font-mono text-[11px] text-copper-700">{r.nomor_kartu}</p>
                  </div>
                  <span className="shrink-0 rounded border border-copper-200 bg-copper-50 px-1.5 py-0.5 text-[10px] text-copper-800">
                    {r.status_label}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-snug text-muted">
                  {[r.jenis_nama?.trim() || null, r.banjar_nama].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-0.5 text-[11px] text-copper-700">
                  Berlaku {r.berlaku_sampai ? formatTanggalLahir(r.berlaku_sampai) : "—"}
                  {r.alasan === "akan_habis" && r.hari_tersisa != null
                    ? ` · ${r.hari_tersisa} hari lagi`
                    : r.alasan === "tidak_aktif"
                      ? " · Perlu perpanjangan"
                      : ""}
                </p>
                <div className="mt-2.5 border-t border-copper-100 pt-2">
                  <Link
                    to={`/krama-pemasih/${r.id}`}
                    className="inline-flex h-10 w-full items-center justify-center rounded-md border border-copper-200 bg-copper-50 text-xs font-medium text-copper-900"
                  >
                    Detail
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className={LIST_TABLE_ELEMENT}>
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <SortableTableHead
                    label="Nomor"
                    columnKey="nomor_kartu"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Pengajeg"
                    columnKey="kepala_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Jenis Krama"
                    columnKey="jenis_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Banjar"
                    columnKey="banjar_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Status Pemasih"
                    columnKey="status_label"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Berlaku S/D"
                    columnKey="berlaku_sampai"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <th>Keterangan</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className={LIST_BODY_ROW}>
                    <td className="font-mono text-[11px]">{r.nomor_kartu}</td>
                    <td>{r.kepala_nama}</td>
                    <td>{r.jenis_nama?.trim() || "—"}</td>
                    <td>{r.banjar_nama}</td>
                    <td className="font-medium">{r.status_label}</td>
                    <td className="whitespace-nowrap">
                      {r.berlaku_sampai ? formatTanggalLahir(r.berlaku_sampai) : "—"}
                    </td>
                    <td>
                      {r.alasan === "akan_habis" && r.hari_tersisa != null
                        ? `${r.hari_tersisa} hari lagi`
                        : r.alasan === "tidak_aktif"
                          ? "Perlu perpanjangan"
                          : "—"}
                    </td>
                    <td>
                      <Link
                        to={`/krama-pemasih/${r.id}`}
                        className="text-copper-800 font-medium hover:underline"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
