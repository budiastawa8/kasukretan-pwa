import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listPemasihPerpanjanganRiwayat,
  type PemasihPerpanjanganRiwayatRow,
} from "../../lib/services/pemasih-perpanjangan";
import { formatTanggalLahir } from "../../lib/utils";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { MASTER_CARD_PHONE, MASTER_CARD_TITLED, MASTER_PAGE } from "./master-compact";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { ListPagination } from "../ui/ListPagination";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";

function PemasihPerpanjanganRiwayatCard({
  riwayat,
  onRefresh,
}: {
  riwayat: PemasihPerpanjanganRiwayatRow[];
  onRefresh: () => void;
}) {
  const isPhone = useIsPhoneClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const safePage = useMemo(
    () => clampPage(page, riwayat.length, pageSize),
    [page, riwayat.length, pageSize]
  );
  const pagedRows = useMemo(
    () => paginateSlice(riwayat, safePage, pageSize),
    [riwayat, safePage, pageSize]
  );

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function handleRefresh() {
    setPage(1);
    onRefresh();
  }

  return (
    <Card
      title="Riwayat perpanjangan Pemasih"
      className={cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm text-muted leading-snug">
          Catatan perpanjangan manual dan otomatis (100 entri terakhir).
        </p>
        <Button
          type="button"
          variant="ghost"
          className={cn("text-xs", isPhone ? "h-10 w-full sm:w-auto" : "h-7")}
          onClick={handleRefresh}
        >
          Muat ulang
        </Button>
      </div>
      {!riwayat.length ? (
        <p className="text-sm text-muted">Belum ada riwayat perpanjangan.</p>
      ) : isPhone ? (
        <>
          <ul className="space-y-2">
            {pagedRows.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 text-xs shadow-sm shadow-copper-950/5 space-y-1"
              >
                <p className="font-semibold text-copper-950">{r.nama_kepala ?? "—"}</p>
                <p className="font-mono text-[11px] text-copper-800">{r.nomor_kartu}</p>
                <p className="text-muted">
                  {formatTanggalLahir(r.created_at)} · {r.jenis === "otomatis" ? "Otomatis" : "Manual"}
                </p>
                <p>
                  Perpanjang: {formatTanggalLahir(r.tanggal_perpanjangan)}
                  {r.tanggal_berlaku_akhir_sebelum
                    ? ` · Berlaku sebelum: ${formatTanggalLahir(r.tanggal_berlaku_akhir_sebelum)}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
          <ListPagination
            page={safePage}
            totalItems={riwayat.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        </>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs border-collapse min-w-[36rem]">
              <thead>
                <tr className="border-b border-copper-200 text-copper-800">
                  <th className="text-left py-1.5 px-1 font-semibold">Waktu</th>
                  <th className="text-left py-1.5 px-1 font-semibold">NPK</th>
                  <th className="text-left py-1.5 px-1 font-semibold">Kepala keluarga</th>
                  <th className="text-left py-1.5 px-1 font-semibold">Perpanjang pada</th>
                  <th className="text-left py-1.5 px-1 font-semibold">Berlaku akhir sebelum</th>
                  <th className="text-left py-1.5 px-1 font-semibold">Jenis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-copper-100">
                {pagedRows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1.5 px-1 whitespace-nowrap">{formatTanggalLahir(r.created_at)}</td>
                    <td className="py-1.5 px-1 whitespace-nowrap">{r.nomor_kartu}</td>
                    <td className="py-1.5 px-1">{r.nama_kepala ?? "—"}</td>
                    <td className="py-1.5 px-1 whitespace-nowrap">
                      {formatTanggalLahir(r.tanggal_perpanjangan)}
                    </td>
                    <td className="py-1.5 px-1 whitespace-nowrap">
                      {r.tanggal_berlaku_akhir_sebelum
                        ? formatTanggalLahir(r.tanggal_berlaku_akhir_sebelum)
                        : "—"}
                    </td>
                    <td className="py-1.5 px-1 capitalize">{r.jenis === "otomatis" ? "Otomatis" : "Manual"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ListPagination
            page={safePage}
            totalItems={riwayat.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        </>
      )}
    </Card>
  );
}

export function PemasihPerpanjanganRiwayatMasterTab() {
  const [riwayat, setRiwayat] = useState<PemasihPerpanjanganRiwayatRow[]>([]);

  const refreshRiwayat = useCallback(async () => {
    const rows = await listPemasihPerpanjanganRiwayat();
    setRiwayat(rows);
  }, []);

  useEffect(() => {
    void refreshRiwayat();
  }, [refreshRiwayat]);

  return (
    <div className={MASTER_PAGE}>
      <PemasihPerpanjanganRiwayatCard riwayat={riwayat} onRefresh={() => void refreshRiwayat()} />
    </div>
  );
}
