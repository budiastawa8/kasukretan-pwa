import { useCallback, useEffect, useState } from "react";
import {
  getDemografiKrama,
  type LaporanEksekutifDemografi,
  type LaporanEksekutifJenisKrama,
} from "../../lib/services/laporan-eksekutif";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { IconLink } from "../../components/ui/IconLink";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { JenisKramaBreakdownTable } from "../../components/laporan/JenisKramaBreakdownTable";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_PAGE,
} from "../../components/laporan/laporan-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";
import {
  ArrowLeft,
  BarChart3,
  RefreshCw,
  UserCircle,
  UserSquare,
  Users,
} from "lucide-react";

function formatJenisSummary(
  label: string,
  total: number,
  rows: LaporanEksekutifJenisKrama[]
): string {
  const parts = rows
    .filter((r) => r.jumlah_krama > 0)
    .map((r) => `${r.jenis_nama}: ${r.jumlah_krama}`);
  if (parts.length === 0) return `${label}: ${total}`;
  return `${label}: ${total} (${parts.join(", ")})`;
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="!p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums text-copper-900">{value}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </Card>
  );
}

export function LaporanEksekutifPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Ringkasan Eksekutif");

  const [data, setData] = useState<LaporanEksekutifDemografi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (paksaMuatUlang = false) => {
    setLoading(true);
    setError("");
    try {
      setData(await getDemografiKrama({ paksaMuatUlang }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function exportPdf() {
    if (!data) return;
    const summary = [
      `Krama aktif: ${data.total_krama} (${data.mipil} Mipil · ${data.krama_tamiu} Krama Tamiu · ${data.tamiu} Tamiu)`,
      formatJenisSummary("Krama Mipil per jenis", data.mipil, data.per_jenis.mipil),
      formatJenisSummary(
        "Krama Tamiu per jenis",
        data.krama_tamiu,
        data.per_jenis.krama_tamiu
      ),
      formatJenisSummary("Tamiu per jenis", data.tamiu, data.per_jenis.tamiu),
    ];
    const headers = ["Klasifikasi", "Jenis", "Jumlah"];
    const rows: (string | number)[][] = [];
    const pushJenis = (klasifikasi: string, jenisRows: LaporanEksekutifJenisKrama[]) => {
      const shown = jenisRows.filter((r) => r.jumlah_krama > 0);
      if (shown.length === 0) {
        rows.push([klasifikasi, "—", 0]);
        return;
      }
      for (const r of shown) {
        rows.push([klasifikasi, r.jenis_nama, r.jumlah_krama]);
      }
    };
    pushJenis("Krama Mipil", data.per_jenis.mipil);
    pushJenis("Krama Tamiu", data.per_jenis.krama_tamiu);
    pushJenis("Tamiu", data.per_jenis.tamiu);

    openPdfPreview({
      filename: "laporan-eksekutif",
      judul: "Ringkasan Eksekutif — Komposisi Krama",
      periode: `${data.total_krama} krama aktif`,
      headers,
      rows: rows.length > 0 ? rows : [["—", "—", "—"]],
      summaryLines: summary,
      alignRight: [2],
    });
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <BarChart3 className="text-copper-700" size={22} />
            Ringkasan Eksekutif
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Jumlah krama aktif dan rincian per jenis.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <Button
            variant="secondary"
            icon={RefreshCw}
            className={cn("text-xs", isPhone ? "h-11" : "h-9")}
            onClick={() => void load(true)}
            disabled={loading}
          >
            Muat ulang
          </Button>
          <LaporanExportButtons
            onPdf={exportPdf}
            pdfOnly
            disabled={loading || !data}
            pdfDisabled={!data}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">{error}</p>
      )}

      {loading && !data && (
        <p className="text-sm text-muted">Memuat ringkasan…</p>
      )}

      {data && (
        <>
          <div className={cn("grid gap-2 sm:grid-cols-3", isPhone && "gap-1.5")}>
            <MetricCard
              label="Krama Mipil"
              value={String(data.mipil)}
              sub={`${data.total_krama > 0 ? Math.round((data.mipil / data.total_krama) * 100) : 0}% dari total`}
            />
            <MetricCard
              label="Krama Tamiu"
              value={String(data.krama_tamiu)}
              sub="Pemasih — krama tamiu"
            />
            <MetricCard
              label="Tamiu"
              value={String(data.tamiu)}
              sub="Pemasih — tamiu"
            />
          </div>

          <Card
            title="Komposisi krama aktif"
            className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}
          >
            <div
              className={cn(
                "flex flex-wrap gap-2 mb-3 text-[11px]",
                isPhone && "flex-col items-stretch gap-1.5"
              )}
            >
              <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-white px-2 py-1">
                <Users size={12} className="text-copper-700" />
                Total aktif <strong className="tabular-nums">{data.total_krama}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-white px-2 py-1">
                <Users size={12} className="text-copper-700" />
                Krama Mipil <strong className="tabular-nums">{data.mipil}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-white px-2 py-1">
                <UserCircle size={12} className="text-copper-700" />
                Krama Tamiu <strong className="tabular-nums">{data.krama_tamiu}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-white px-2 py-1">
                <UserSquare size={12} className="text-copper-700" />
                Tamiu <strong className="tabular-nums">{data.tamiu}</strong>
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <JenisKramaBreakdownTable
                title="Krama Mipil"
                total={data.mipil}
                rows={data.per_jenis.mipil}
              />
              <JenisKramaBreakdownTable
                title="Krama Tamiu"
                total={data.krama_tamiu}
                rows={data.per_jenis.krama_tamiu}
              />
              <JenisKramaBreakdownTable
                title="Tamiu"
                total={data.tamiu}
                rows={data.per_jenis.tamiu}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
