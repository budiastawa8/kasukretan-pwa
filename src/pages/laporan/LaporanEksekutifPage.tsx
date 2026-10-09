import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatBulanIndonesia, formatRupiah, bulanSaatIni, tahunSaatIni } from "../../lib/dudukan-hitung";
import {
  getLaporanEksekutif,
  type LaporanEksekutif,
  type LaporanEksekutifJenisKrama,
} from "../../lib/services/laporan-eksekutif";
import { DESA_ADAT_UPDATED_EVENT, getDesaAdat } from "../../lib/services/desa";
import {
  getStatistikJiwaMipil,
  type StatistikJiwaMipil,
} from "../../lib/services/statistik-jiwa-mipil";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { IconLink } from "../../components/ui/IconLink";
import { TrendBars } from "../../components/laporan/TrendBars";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Coins,
  HandCoins,
  RefreshCw,
  Sparkles,
  UserCircle,
  UserRound,
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

function JenisKramaBreakdownTable({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: LaporanEksekutifJenisKrama[];
}) {
  const shown = rows.filter((r) => r.jumlah_krama > 0);

  return (
    <div className="min-w-0 rounded-lg border border-copper-100 bg-copper-50/30 p-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <h4 className="text-xs font-semibold text-copper-900">{title}</h4>
        <span className="text-[11px] font-bold tabular-nums text-copper-800">{total}</span>
      </div>
      {shown.length === 0 ? (
        <p className="text-[11px] text-muted">Belum ada krama aktif.</p>
      ) : (
        <table className="w-full text-[11px]">
          <tbody>
            {shown.map((r) => (
              <tr key={r.jenis_id || r.jenis_nama} className="border-b border-copper-100/80 last:border-0">
                <td className="py-1 pr-2 text-copper-900">{r.jenis_nama}</td>
                <td className="py-1 text-right tabular-nums font-medium text-copper-950">
                  {r.jumlah_krama}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "!p-3 border-amber-200 bg-amber-50/50" : "!p-3"}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${alert ? "text-amber-950" : "text-copper-900"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </Card>
  );
}

export function LaporanEksekutifPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Ringkasan Eksekutif");
  const bulanIni = bulanSaatIni();
  const tahunIni = tahunSaatIni();

  const [data, setData] = useState<LaporanEksekutif | null>(null);
  const [statistikJiwa, setStatistikJiwa] = useState<StatistikJiwaMipil | null>(null);
  const [statistikJiwaSub, setStatistikJiwaSub] = useState({ yowana: "", wredha: "" });
  const [bulanTren, setBulanTren] = useState<6 | 12>(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [laporan, desa] = await Promise.all([getLaporanEksekutif(bulanTren), getDesaAdat()]);
      setData(laporan);
      const jiwa = await getStatistikJiwaMipil({
        yowanaUmurMin: desa?.yowana_umur_min,
        yowanaUmurMax: desa?.yowana_umur_max,
        batasUmurNyada: desa?.jenis_umur_nyada,
      });
      setStatistikJiwa(jiwa);
      setStatistikJiwaSub({
        yowana: jiwa.yowanaConfigured
          ? `Belum kawin · usia ${desa?.yowana_umur_min}–${desa?.yowana_umur_max}`
          : "Atur rentang usia di Profil Desa",
        wredha: jiwa.wredhaConfigured
          ? `Usia ≥ ${desa?.jenis_umur_nyada} tahun · per jiwa`
          : "Atur batas umur Nyada di Profil Desa",
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [bulanTren]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onDesaUpdated = () => {
      void load();
    };
    window.addEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
    return () => window.removeEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
  }, [load]);

  function exportPdf() {
    if (!data) return;
    const periode = `${formatBulanIndonesia(bulanIni, tahunIni)} · tren ${bulanTren} bulan`;
    const summary = [
      `Krama aktif: ${data.demografi.total_krama} (${data.demografi.mipil} Mipil · ${data.demografi.krama_tamiu} Krama Tamiu · ${data.demografi.tamiu} Tamiu)`,
      formatJenisSummary("Krama Mipil per jenis", data.demografi.mipil, data.demografi.per_jenis.mipil),
      formatJenisSummary(
        "Krama Tamiu per jenis",
        data.demografi.krama_tamiu,
        data.demografi.per_jenis.krama_tamiu
      ),
      formatJenisSummary("Tamiu per jenis", data.demografi.tamiu, data.demografi.per_jenis.tamiu),
      `Paturunan terkumpul: ${formatRupiah(data.paturunan.total_wajib)} · Punia: ${formatRupiah(data.paturunan.total_punia)} · Sisa: ${formatRupiah(data.paturunan.total_sisa)}`,
      `Tunggakan paturunan: ${data.paturunan.jumlah_tunggakan} krama`,
      `Dudukan ${formatBulanIndonesia(bulanIni, tahunIni)}: uang masuk ${formatRupiah(data.dudukan_bulan_ini.total_dibayar)} · keringanan ${formatRupiah(data.dudukan_bulan_ini.total_keringanan)} · sisa ${formatRupiah(data.dudukan_bulan_ini.total_sisa)}`,
      `Tunggakan dudukan: ${data.tunggakan_dudukan.jumlah_krama} krama · ${formatRupiah(data.tunggakan_dudukan.total_sisa)}`,
      `Pemasih perhatian: ${data.perhatian_pemasih.tidak_aktif + data.perhatian_pemasih.akan_habis} (akan habis ${data.perhatian_pemasih.akan_habis})`,
    ];
    if (statistikJiwa) {
      const jiwaParts = [
        statistikJiwa.yowanaConfigured ? `Yowana ${statistikJiwa.yowana}` : null,
        statistikJiwa.wredhaConfigured ? `Wredha ${statistikJiwa.wredha}` : null,
        `Balu Lanang ${statistikJiwa.balu_lanang}`,
        `Balu Istri ${statistikJiwa.balu_istri}`,
      ].filter(Boolean);
      summary.push(`Statistik jiwa Mipil: ${jiwaParts.join(" · ")}`);
    }
    const headers = ["Iuran", "Terkumpul wajib", "Punia", "Sisa", "Tunggakan (krama)"];
    const rows =
      data.paturunan.per_iuran.length > 0
        ? data.paturunan.per_iuran.map((i) => [
            i.iuran_nama,
            i.total_dibayar_wajib,
            i.total_punia,
            i.total_sisa,
            i.jumlah_tunggakan,
          ])
        : [["—", "—", "—", "—", "—"]];
    openPdfPreview({
      filename: "laporan-eksekutif",
      judul: "Ringkasan Eksekutif",
      periode,
      headers,
      rows,
      summaryLines: summary,
      alignRight: [1, 2, 3, 4],
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
            Gambaran gabungan untuk pengurus — keuangan dan tunggakan terkini.
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
            onClick={load}
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
          <div className={cn("grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6", isPhone && "gap-1.5")}>
            <MetricCard
              label="Krama aktif"
              value={String(data.demografi.total_krama)}
              sub={`${data.demografi.mipil} Mipil · ${data.demografi.krama_tamiu} KT · ${data.demografi.tamiu} Tamiu`}
            />
            <MetricCard label="Paturunan terkumpul" value={formatRupiah(data.paturunan.total_wajib)} sub={`Punia ${formatRupiah(data.paturunan.total_punia)}`} />
            <MetricCard label="Sisa paturunan" value={formatRupiah(data.paturunan.total_sisa)} sub={`${data.paturunan.jumlah_tunggakan} krama`} alert={data.paturunan.jumlah_tunggakan > 0} />
            <MetricCard
              label={`Dudukan ${formatBulanIndonesia(bulanIni, tahunIni).split(" ")[0]}`}
              value={formatRupiah(data.dudukan_bulan_ini.total_dibayar)}
              sub={`Keringanan ${formatRupiah(data.dudukan_bulan_ini.total_keringanan)}`}
            />
            <MetricCard
              label="Tunggakan dudukan"
              value={String(data.tunggakan_dudukan.jumlah_krama)}
              sub={formatRupiah(data.tunggakan_dudukan.total_sisa)}
              alert={data.tunggakan_dudukan.jumlah_krama > 0}
            />
            <MetricCard
              label="Pemasih perhatian"
              value={String(data.perhatian_pemasih.tidak_aktif + data.perhatian_pemasih.akan_habis)}
              sub={`${data.perhatian_pemasih.akan_habis} akan habis`}
              alert={data.perhatian_pemasih.tidak_aktif > 0}
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
                Krama Mipil <strong className="tabular-nums">{data.demografi.mipil}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-white px-2 py-1">
                <UserCircle size={12} className="text-copper-700" />
                Krama Tamiu <strong className="tabular-nums">{data.demografi.krama_tamiu}</strong>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-white px-2 py-1">
                <UserSquare size={12} className="text-copper-700" />
                Tamiu <strong className="tabular-nums">{data.demografi.tamiu}</strong>
              </span>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <JenisKramaBreakdownTable
                title="Krama Mipil"
                total={data.demografi.mipil}
                rows={data.demografi.per_jenis.mipil}
              />
              <JenisKramaBreakdownTable
                title="Krama Tamiu"
                total={data.demografi.krama_tamiu}
                rows={data.demografi.per_jenis.krama_tamiu}
              />
              <JenisKramaBreakdownTable
                title="Tamiu"
                total={data.demografi.tamiu}
                rows={data.demografi.per_jenis.tamiu}
              />
            </div>
          </Card>

          <Card
            title="Statistik jiwa Mipil"
            className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-copper-100 bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted flex items-center gap-1">
                  <Sparkles size={12} className="text-copper-700" />
                  Yowana
                </p>
                <p className="text-lg font-bold tabular-nums text-copper-900 mt-0.5">
                  {statistikJiwa?.yowanaConfigured ? statistikJiwa.yowana : "—"}
                </p>
                <p className="text-[10px] text-muted mt-0.5">{statistikJiwaSub.yowana}</p>
                <Link
                  to="/laporan/mipil?tab=statistik&jenis=yowana"
                  className="text-[11px] text-copper-800 hover:underline mt-1 inline-block"
                >
                  Daftar Yowana →
                </Link>
              </div>
              <div className="rounded-lg border border-copper-100 bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted flex items-center gap-1">
                  <UserRound size={12} className="text-copper-700" />
                  Wredha
                </p>
                <p className="text-lg font-bold tabular-nums text-copper-900 mt-0.5">
                  {statistikJiwa?.wredhaConfigured ? statistikJiwa.wredha : "—"}
                </p>
                <p className="text-[10px] text-muted mt-0.5">{statistikJiwaSub.wredha}</p>
                <Link
                  to="/laporan/mipil?tab=statistik&jenis=wredha"
                  className="text-[11px] text-copper-800 hover:underline mt-1 inline-block"
                >
                  Daftar Wredha →
                </Link>
              </div>
              <div className="rounded-lg border border-copper-100 bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted flex items-center gap-1">
                  <UserCircle size={12} className="text-copper-700" />
                  Balu Lanang
                </p>
                <p className="text-lg font-bold tabular-nums text-copper-900 mt-0.5">
                  {statistikJiwa?.balu_lanang ?? "—"}
                </p>
                <p className="text-[10px] text-muted mt-0.5">Cerai hidup/mati · laki-laki</p>
                <Link
                  to="/laporan/mipil?tab=statistik&jenis=balu_lanang"
                  className="text-[11px] text-copper-800 hover:underline mt-1 inline-block"
                >
                  Daftar Balu Lanang →
                </Link>
              </div>
              <div className="rounded-lg border border-copper-100 bg-white px-3 py-2.5">
                <p className="text-[11px] text-muted flex items-center gap-1">
                  <UserSquare size={12} className="text-copper-700" />
                  Balu Istri
                </p>
                <p className="text-lg font-bold tabular-nums text-copper-900 mt-0.5">
                  {statistikJiwa?.balu_istri ?? "—"}
                </p>
                <p className="text-[10px] text-muted mt-0.5">Cerai hidup/mati · perempuan</p>
                <Link
                  to="/laporan/mipil?tab=statistik&jenis=balu_istri"
                  className="text-[11px] text-copper-800 hover:underline mt-1 inline-block"
                >
                  Daftar Balu Istri →
                </Link>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap gap-1">
            <Link to="/laporan/tunggakan-paturunan" className="text-[11px] text-copper-800 hover:underline inline-flex items-center gap-0.5">
              <AlertTriangle size={12} /> Tunggakan paturunan
            </Link>
            <span className="text-muted text-[11px]">·</span>
            <Link to="/laporan/tunggakan-dudukan" className="text-[11px] text-copper-800 hover:underline inline-flex items-center gap-0.5">
              <AlertTriangle size={12} /> Tunggakan dudukan
            </Link>
            <span className="text-muted text-[11px]">·</span>
            <Link to="/laporan/keringanan-dudukan" className="text-[11px] text-copper-800 hover:underline">
              Audit keringanan
            </Link>
            <span className="text-muted text-[11px]">·</span>
            <Link to="/krama-pemasih/perhatian" className="text-[11px] text-copper-800 hover:underline">
              Daftar perhatian pemasih
            </Link>
          </div>

          <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-semibold text-copper-900">Tren realisasi</h3>
              <div className="flex gap-1">
                <Button
                  variant={bulanTren === 6 ? "primary" : "secondary"}
                  className={cn("text-[11px] px-2", isPhone ? "h-11 min-w-[5rem]" : "h-7")}
                  onClick={() => setBulanTren(6)}
                >
                  6 bulan
                </Button>
                <Button
                  variant={bulanTren === 12 ? "primary" : "secondary"}
                  className={cn("text-[11px] px-2", isPhone ? "h-11 min-w-[5rem]" : "h-7")}
                  onClick={() => setBulanTren(12)}
                >
                  12 bulan
                </Button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-copper-800 mb-1 flex items-center gap-1">
                  <HandCoins size={14} /> Dudukan — uang masuk vs keringanan
                </p>
                <TrendBars
                  items={data.tren_dudukan}
                  series={[
                    { key: "dibayar", label: "Uang masuk", getValue: (i) => (i as typeof data.tren_dudukan[0]).dibayar, color: "bg-copper-600" },
                    { key: "keringanan", label: "Keringanan", getValue: (i) => (i as typeof data.tren_dudukan[0]).keringanan, color: "bg-violet-400" },
                  ]}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-copper-800 mb-1 flex items-center gap-1">
                  <Coins size={14} /> Paturunan — masuk per bulan (tanggal bayar)
                </p>
                <TrendBars
                  items={data.tren_paturunan}
                  series={[
                    { key: "wajib", label: "Wajib", getValue: (i) => (i as typeof data.tren_paturunan[0]).wajib, color: "bg-copper-600" },
                    { key: "punia", label: "Punia", getValue: (i) => (i as typeof data.tren_paturunan[0]).punia, color: "bg-sky-400" },
                  ]}
                />
              </div>
            </div>
          </Card>

          {data.paturunan.per_iuran.length > 0 && (
            <Card title="Paturunan per iuran" className={cn(LAPORAN_TABLE, isPhone && LAPORAN_CARD_PHONE)}>
              <div className="overflow-x-auto">
                <table className={LAPORAN_TABLE_ELEMENT}>
                  <thead>
                    <tr className={LAPORAN_HEAD_ROW}>
                      <th>Iuran</th>
                      <th className="text-right">Terkumpul wajib</th>
                      <th className="text-right">Punia</th>
                      <th className="text-right">Sisa</th>
                      <th className="text-right">Tunggakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paturunan.per_iuran.map((i) => (
                      <tr key={i.iuran_id} className="border-b border-copper-50">
                        <td>{i.iuran_nama}</td>
                        <td className="text-right tabular-nums">{formatRupiah(i.total_dibayar_wajib)}</td>
                        <td className="text-right tabular-nums">{formatRupiah(i.total_punia)}</td>
                        <td className="text-right tabular-nums">{formatRupiah(i.total_sisa)}</td>
                        <td className="text-right tabular-nums">
                          {i.jumlah_tunggakan > 0 ? (
                            <Link
                              to="/laporan/tunggakan-paturunan"
                              className="text-amber-800 font-medium hover:underline"
                            >
                              {i.jumlah_tunggakan}
                            </Link>
                          ) : (
                            "0"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card
            title={`Dudukan ${formatBulanIndonesia(bulanIni, tahunIni)}`}
            className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}
          >
            <div className={cn("flex flex-wrap gap-2 text-xs", isPhone && "flex-col items-start gap-1")}>
              <span>Tagihan <strong>{formatRupiah(data.dudukan_bulan_ini.total_tagihan)}</strong></span>
              <span>Uang masuk <strong>{formatRupiah(data.dudukan_bulan_ini.total_dibayar)}</strong></span>
              <span>Keringanan <strong className="text-violet-800">{formatRupiah(data.dudukan_bulan_ini.total_keringanan)}</strong></span>
              <span>Sisa <strong>{formatRupiah(data.dudukan_bulan_ini.total_sisa)}</strong></span>
              <span>Belum lunas <strong>{data.dudukan_bulan_ini.jumlah_belum_lunas}</strong></span>
              <Link to="/laporan/dudukan" className="text-copper-800 hover:underline ml-auto">
                Detail laporan →
              </Link>
            </div>
          </Card>

          <Card className="!p-3">
            <div className="flex items-start gap-2 text-xs text-muted">
              <Users size={16} className="shrink-0 mt-0.5" />
              <p>
                Tren paturunan dihitung dari <strong>tanggal pembayaran</strong> (bukan snapshot tagihan).
                Tren dudukan per <strong>periode kalender</strong> (tagihan vs realisasi bulan tersebut).
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
