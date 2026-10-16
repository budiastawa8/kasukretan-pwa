import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPemasihPerBanjar, type PemasihPerBanjarRow } from "../lib/services/krama";
import { DESA_ADAT_UPDATED_EVENT, getDesaAdatWithMedia, isDesaConfigured } from "../lib/services/desa";
import { getLaporanEksekutif, type LaporanEksekutif } from "../lib/services/laporan-eksekutif";
import { listRingkasanSaldoDisplay, type RingkasanSaldoAkun } from "../lib/services/buku-kas";
import {
  bulanSaatIni,
  formatBulanIndonesia,
  formatRupiah,
  tahunSaatIni,
} from "../lib/dudukan-hitung";
import { Card } from "../components/ui/Card";
import {
  LIST_BODY_ROW,
  LIST_CARD,
  LIST_HEAD_ROW,
  LIST_TABLE,
  LIST_TABLE_ELEMENT,
} from "../components/ui/list-compact";
import { cn } from "../lib/utils";
import { cachedQuery } from "../lib/query-cache";
import { canUseStaffApp } from "../lib/runtime";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { DashboardMetricCard } from "../components/dashboard/DashboardMetricCard";
import { DashboardMipilPieChart } from "../components/dashboard/DashboardMipilPieChart";
import { DashboardPemasihBanjarBars } from "../components/dashboard/DashboardPemasihBanjarBars";
import { DashboardAlertsPanel } from "../components/dashboard/DashboardAlertsPanel";
import { BukuKasSaldoRingkasan } from "../components/keuangan/BukuKasSaldoRingkasan";
import { TrendBars } from "../components/laporan/TrendBars";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  BarChart3,
  Coins,
  HandCoins,
  Landmark,
  Sparkles,
  UserCircle,
  UserSquare,
  Users,
  Wallet,
} from "lucide-react";

function greetingJam(): string {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

function DashboardDesaLogo({ logoUrl }: { logoUrl: string }) {
  if (logoUrl) {
    return (
      <div className="flex h-14 w-14 sm:h-[4.75rem] sm:w-[4.75rem] shrink-0 items-center justify-center rounded-xl bg-copper-50 p-1.5 sm:p-2 shadow-md ring-1 ring-copper-100/50">
        <img
          src={logoUrl}
          alt="Logo Desa Adat"
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 sm:h-[4.75rem] sm:w-[4.75rem] shrink-0 items-center justify-center rounded-xl bg-copper-50/95 p-2 sm:p-3 backdrop-blur-sm ring-1 ring-copper-100/40">
      <Landmark size={28} className="text-copper-700" strokeWidth={1.5} />
    </div>
  );
}

function DashboardSection({
  title,
  subtitle,
  icon: Icon,
  accentClass,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentClass: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className={cn("rounded-lg p-1.5", accentClass)}>
          <Icon size={16} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-copper-950 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<LaporanEksekutif | null>(null);
  const [pemasihPerBanjar, setPemasihPerBanjar] = useState<PemasihPerBanjarRow[]>([]);
  const [saldoRows, setSaldoRows] = useState<RingkasanSaldoAkun[]>([]);
  const [totalSaldoRingkasan, setTotalSaldoRingkasan] = useState(0);
  const [desaNama, setDesaNama] = useState("");
  const [desaLogoUrl, setDesaLogoUrl] = useState("");
  const [desaOk, setDesaOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isPhone = useIsPhoneClient();
  const staffApp = canUseStaffApp();
  const bulanIni = bulanSaatIni();
  const tahunIni = tahunSaatIni();
  const bulanLabel = formatBulanIndonesia(bulanIni, tahunIni);

  const load = useCallback(async () => {
    if (!staffApp) return;
    setLoading(true);
    setError("");
    try {
      const [eksekutif, pemasihBanjar, saldoDisplay, desa] = await Promise.all([
        getLaporanEksekutif(6, { tanpaTren: isPhone }),
        isPhone
          ? Promise.resolve<PemasihPerBanjarRow[]>([])
          : cachedQuery("dashboard:pemasih-per-banjar", getPemasihPerBanjar),
        cachedQuery("dashboard:saldo-ringkasan", listRingkasanSaldoDisplay),
        getDesaAdatWithMedia(),
      ]);
      setData(eksekutif);
      setPemasihPerBanjar(pemasihBanjar);
      setSaldoRows(saldoDisplay.rows);
      setTotalSaldoRingkasan(saldoDisplay.totalSaldo);
      setDesaNama(desa?.nama_desa_adat?.trim() ?? "");
      setDesaLogoUrl(desa?.logo_url?.trim() ?? "");
      setDesaOk(isDesaConfigured(desa));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [staffApp, isPhone]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onDesaUpdated = () => {
      void load();
    };
    window.addEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
    return () => window.removeEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
  }, [load]);

  if (!staffApp) {
    return (
      <div className="space-y-5">
        <p className="text-muted text-sm">Pratinjau browser — gunakan aplikasi desktop atau klien LAN</p>
        <Card className="!p-5">
          <p className="text-sm text-muted leading-relaxed">
            Ringkasan krama dan keuangan membutuhkan PC server Electron, atau HP yang membuka URL
            LAN (scan QR di Pengaturan → Jaringan LAN).
          </p>
        </Card>
      </div>
    );
  }

  const totalSaldo = totalSaldoRingkasan;
  const jumlahAkunTransaksional = saldoRows.filter((r) => !r.is_kelompok).length;
  const dudukan = data?.dudukan_bulan_ini;
  const realisasiPct =
    dudukan && dudukan.total_tagihan > 0
      ? Math.round((dudukan.total_dibayar / dudukan.total_tagihan) * 100)
      : 0;

  const perhatianCount =
    (data?.perhatian_pemasih.tidak_aktif ?? 0) +
    (data?.perhatian_pemasih.akan_habis ?? 0);
  const tunggakanPaturunan = data?.paturunan.jumlah_tunggakan ?? 0;
  const tunggakanDudukan = data?.tunggakan_dudukan.jumlah_krama ?? 0;
  const hasAlerts =
    !desaOk ||
    perhatianCount > 0 ||
    tunggakanPaturunan > 0 ||
    tunggakanDudukan > 0;

  const alertPanelProps = {
    desaOk,
    akanHabis: data?.perhatian_pemasih.akan_habis ?? 0,
    tidakAktif: data?.perhatian_pemasih.tidak_aktif ?? 0,
    tunggakanPaturunan,
    tunggakanPaturunanSisa: data?.paturunan.total_sisa ?? 0,
    tunggakanDudukan,
    tunggakanDudukanSisa: data?.tunggakan_dudukan.total_sisa ?? 0,
  };

  const mipilCount = data?.demografi.mipil ?? 0;
  const kramaTamiuCount = data?.demografi.krama_tamiu ?? 0;
  const tamiuCount = data?.demografi.tamiu ?? 0;
  const totalKramaAktif = mipilCount + kramaTamiuCount + tamiuCount;

  return (
    <div className={cn(isPhone ? "space-y-3" : "space-y-6")}>
      {/* Kartu Desa Adat — hero paling atas */}
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-copper-900/20 px-4 shadow-md shadow-copper-950/25 sm:rounded-2xl sm:px-6",
          isPhone ? "py-3.5" : "min-h-0 py-5 sm:min-h-[9.5rem] sm:py-8",
          desaOk
            ? "bg-gradient-to-br from-copper-600 via-copper-800 to-red-900 text-white"
            : "bg-gradient-to-br from-red-900 via-[#8b3a2f] to-copper-950 text-white"
        )}
      >
        <div
          className="pointer-events-none absolute -right-6 -top-10 h-40 w-40 rounded-full bg-copper-300/20 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-8 -left-4 h-32 w-32 rounded-full bg-red-950/30 blur-xl"
          aria-hidden
        />
        <div className="relative flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-4 sm:gap-6 h-full">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <DashboardDesaLogo logoUrl={desaLogoUrl} />
            <div className="min-w-0">
              <p className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-widest text-copper-100/90">
                Desa Adat
              </p>
              <h2 className="text-xl sm:text-3xl font-bold tracking-tight mt-0.5 sm:mt-1 truncate text-copper-50">
                {desaNama || "Belum dikonfigurasi"}
              </h2>
              {!desaOk && (
                <p className="text-xs sm:text-sm text-copper-100/90 mt-1.5 sm:mt-2">
                  Lengkapi profil desa di Pengaturan agar laporan dan cetak berjalan benar.
                </p>
              )}
              {totalKramaAktif > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium backdrop-blur-sm">
                    <Users size={13} />
                    {totalKramaAktif} krama aktif
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs backdrop-blur-sm">
                    <Sparkles size={13} />
                    {bulanLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 text-left sm:text-right w-full sm:w-auto">
            <p className="text-sm sm:text-base font-medium text-copper-50/95">
              {greetingJam()}
              {user?.nama ? `, ${user.nama}` : ""}
            </p>
            <p className="text-xs sm:text-sm text-copper-100/75 mt-0.5 sm:mt-1 max-w-md sm:max-w-xs sm:ml-auto">
              Ringkasan {bulanLabel}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div
        className={cn(
          "grid gap-6 items-start",
          hasAlerts && "lg:grid-cols-[minmax(0,1fr)_min(18rem,22vw)]"
        )}
      >
        <div className={cn("min-w-0 space-y-6", isPhone && "space-y-3")}>
          {loading && !data ? (
            <p className="py-4 text-sm text-muted">Memuat ringkasan…</p>
          ) : data ? (
            <>
              {hasAlerts && isPhone && (
                <DashboardAlertsPanel {...alertPanelProps} />
              )}
              {/* Bagian Adat */}
              <DashboardSection
                title="Data Adat"
                subtitle="Komposisi krama dan pemasih per banjar"
                icon={Users}
                accentClass="bg-teal-100 text-teal-800"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <DashboardMetricCard
                    label="Krama Mipil"
                    value={String(mipilCount)}
                    sub={`${totalKramaAktif > 0 ? Math.round((mipilCount / totalKramaAktif) * 100) : 0}% dari total krama`}
                    icon={Users}
                    iconClass="bg-teal-100"
                    iconColorClass="text-teal-700"
                    href="/krama-mipil"
                  />
                  <DashboardMetricCard
                    label="Krama Tamiu"
                    value={String(kramaTamiuCount)}
                    sub="Pemasih — krama tamiu"
                    icon={UserCircle}
                    iconClass="bg-violet-100"
                    iconColorClass="text-violet-700"
                    href="/krama-pemasih"
                  />
                  <DashboardMetricCard
                    label="Tamiu"
                    value={String(tamiuCount)}
                    sub="Pemasih — tamiu"
                    icon={UserSquare}
                    iconClass="bg-amber-100"
                    iconColorClass="text-amber-700"
                    href="/krama-pemasih"
                  />
                </div>

                {!isPhone && (
                <div className="grid gap-4 lg:grid-cols-2 pt-1">
                  <Card
                    title="Jenis Krama Mipil"
                    className="border-teal-200/60 [&>div:first-child]:bg-teal-50/80 [&>div:first-child]:border-teal-200/60"
                  >
                    <DashboardMipilPieChart
                      items={(data.demografi.per_jenis.mipil ?? []).map((r) => ({
                        label: r.jenis_nama,
                        value: r.jumlah_krama,
                      }))}
                    />
                    <Link
                      to="/laporan/eksekutif"
                      className="mt-3 inline-flex text-[11px] text-teal-800 hover:underline items-center gap-0.5"
                    >
                      Detail komposisi <ArrowRight size={12} />
                    </Link>
                  </Card>
                  <Card
                    title="Pemasih per Banjar"
                    className="border-violet-200/60 [&>div:first-child]:bg-violet-50/80 [&>div:first-child]:border-violet-200/60"
                  >
                    <DashboardPemasihBanjarBars items={pemasihPerBanjar} />
                    <Link
                      to="/laporan/pemasih"
                      className="mt-3 inline-flex text-[11px] text-violet-800 hover:underline items-center gap-0.5"
                    >
                      Laporan Pemasih <ArrowRight size={12} />
                    </Link>
                  </Card>
                </div>
                )}
              </DashboardSection>

              {hasAlerts && !isPhone && (
                <div className="lg:hidden">
                  <DashboardAlertsPanel {...alertPanelProps} />
                </div>
              )}

              {/* Bagian Keuangan */}
              <DashboardSection
                title={`Keuangan ${bulanLabel.split(" ")[0]}`}
                subtitle="Saldo, paturunan, dan dudukan bulan berjalan"
                icon={Wallet}
                accentClass="bg-copper-100 text-copper-800"
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <DashboardMetricCard
                    label="Saldo buku kas"
                    value={formatRupiah(totalSaldo)}
                    sub={`${jumlahAkunTransaksional} akun transaksional`}
                    icon={Wallet}
                    href="/keuangan"
                  />
                  <DashboardMetricCard
                    label="Paturunan terkumpul"
                    value={formatRupiah(data.paturunan.total_wajib)}
                    sub={`Punia ${formatRupiah(data.paturunan.total_punia)} · sisa ${formatRupiah(data.paturunan.total_sisa)}`}
                    icon={Coins}
                    alert={data.paturunan.jumlah_tunggakan > 0}
                    href="/paturunan"
                  />
                  <DashboardMetricCard
                    label={`Dudukan ${bulanLabel.split(" ")[0]}`}
                    value={formatRupiah(dudukan?.total_dibayar ?? 0)}
                    sub={`Tagihan ${formatRupiah(dudukan?.total_tagihan ?? 0)} · sisa ${formatRupiah(dudukan?.total_sisa ?? 0)}`}
                    icon={HandCoins}
                    progress={
                      dudukan && dudukan.total_tagihan > 0
                        ? {
                            pct: realisasiPct,
                            label: `Realisasi ${realisasiPct}% · keringanan ${formatRupiah(dudukan.total_keringanan)}`,
                          }
                        : undefined
                    }
                    href="/dudukan"
                  />
                </div>
              </DashboardSection>

              {!isPhone && (
              <div className="grid gap-4">
                <Card className="!p-0 overflow-hidden">
                  <div className="border-b border-copper-200/80 bg-copper-50/60 px-4 py-2.5 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-copper-900 flex items-center gap-1.5">
                      <BarChart3 size={16} />
                      Tren 6 bulan terakhir
                    </h3>
                    <Link
                      to="/laporan/eksekutif"
                      className="text-[11px] text-copper-700 hover:underline inline-flex items-center gap-0.5"
                    >
                      Laporan lengkap <ArrowRight size={12} />
                    </Link>
                  </div>
                  <div className="p-4 grid gap-5 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-copper-800 mb-2 flex items-center gap-1">
                        <HandCoins size={13} /> Dudukan — uang masuk vs keringanan
                      </p>
                      <TrendBars
                        items={data.tren_dudukan}
                        series={[
                          {
                            key: "dibayar",
                            label: "Uang masuk",
                            getValue: (i) => (i as (typeof data.tren_dudukan)[0]).dibayar,
                            color: "bg-copper-600",
                          },
                          {
                            key: "keringanan",
                            label: "Keringanan",
                            getValue: (i) => (i as (typeof data.tren_dudukan)[0]).keringanan,
                            color: "bg-violet-400",
                          },
                        ]}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-copper-800 mb-2 flex items-center gap-1">
                        <Coins size={13} /> Paturunan — masuk per bulan
                      </p>
                      <TrendBars
                        items={data.tren_paturunan}
                        series={[
                          {
                            key: "wajib",
                            label: "Wajib",
                            getValue: (i) => (i as (typeof data.tren_paturunan)[0]).wajib,
                            color: "bg-copper-600",
                          },
                          {
                            key: "punia",
                            label: "Punia",
                            getValue: (i) => (i as (typeof data.tren_paturunan)[0]).punia,
                            color: "bg-sky-400",
                          },
                        ]}
                      />
                    </div>
                  </div>
                </Card>
              </div>
              )}

              {isPhone ? (
                <Card className="!p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-muted">Saldo buku kas</p>
                      <p className="text-lg font-bold tabular-nums text-copper-950">
                        {formatRupiah(totalSaldo)}
                      </p>
                    </div>
                    <Link
                      to="/keuangan"
                      className="inline-flex h-10 items-center gap-1 rounded-md border border-copper-200 bg-copper-50 px-3 text-xs font-medium text-copper-900"
                    >
                      Buku Kas <ArrowRight size={12} />
                    </Link>
                  </div>
                </Card>
              ) : (
              <Card title="Posisi keuangan">
                <BukuKasSaldoRingkasan rows={saldoRows} totalSaldo={totalSaldo} loading={loading} />
                <div className="mt-3 pt-3 border-t border-copper-100 flex flex-wrap gap-3 text-xs">
                  <Link to="/keuangan" className="text-copper-800 hover:underline font-medium inline-flex items-center gap-1">
                    Buka Buku Kas <ArrowRight size={12} />
                  </Link>
                  <Link to="/laporan/buku-kas" className="text-copper-700 hover:underline">
                    Laporan buku kas
                  </Link>
                </div>
              </Card>
              )}

              {data.paturunan.per_iuran.length > 0 && !isPhone && (
                <Card title="Paturunan per iuran" className={cn(LIST_CARD, LIST_TABLE)}>
                  <div className="overflow-x-auto -mx-1">
                    <table className={LIST_TABLE_ELEMENT}>
                      <thead>
                        <tr className={LIST_HEAD_ROW}>
                          <th>Iuran</th>
                          <th className="text-right">Terkumpul</th>
                          <th className="text-right">Punia</th>
                          <th className="text-right">Sisa</th>
                          <th className="text-right">Tunggakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.paturunan.per_iuran.map((i) => (
                          <tr key={i.iuran_id} className={LIST_BODY_ROW}>
                            <td className="text-copper-900">{i.iuran_nama}</td>
                            <td className="text-right tabular-nums">{formatRupiah(i.total_dibayar_wajib)}</td>
                            <td className="text-right tabular-nums text-muted">
                              {formatRupiah(i.total_punia)}
                            </td>
                            <td className="text-right tabular-nums">{formatRupiah(i.total_sisa)}</td>
                            <td className="text-right tabular-nums">
                              {i.jumlah_tunggakan > 0 ? (
                                <Link
                                  to="/laporan/tunggakan-paturunan"
                                  className="text-amber-800 font-semibold hover:underline"
                                >
                                  {i.jumlah_tunggakan} krama
                                </Link>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-copper-800 pb-1">
                <Link to="/laporan/eksekutif" className="hover:underline inline-flex items-center gap-1">
                  <BarChart3 size={13} /> Ringkasan eksekutif
                </Link>
                <Link to="/laporan/tunggakan-paturunan" className="hover:underline">
                  Tunggakan paturunan
                </Link>
                <Link to="/laporan/tunggakan-dudukan" className="hover:underline">
                  Tunggakan dudukan
                </Link>
                <Link to="/krama-pemasih/perhatian" className="hover:underline">
                  Pemasih perhatian
                </Link>
                <Link to="/laporan" className="hover:underline">
                  Semua laporan
                </Link>
              </div>
            </>
          ) : null}
        </div>

        {hasAlerts && (
          <aside className="hidden lg:block">
            <DashboardAlertsPanel {...alertPanelProps} className="sticky top-4" />
          </aside>
        )}
      </div>
    </div>
  );
}
