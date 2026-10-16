import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DESA_ADAT_UPDATED_EVENT, getDesaAdatWithMedia, isDesaConfigured } from "../lib/services/desa";
import {
  getDemografiKrama,
  type LaporanEksekutifDemografi,
} from "../lib/services/laporan-eksekutif";
import { Card } from "../components/ui/Card";
import { cn } from "../lib/utils";
import { canUseStaffApp } from "../lib/runtime";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { DashboardMetricCard } from "../components/dashboard/DashboardMetricCard";
import { JenisKramaBreakdownTable } from "../components/laporan/JenisKramaBreakdownTable";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  Landmark,
  UserCircle,
  UserSquare,
  Users,
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

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<LaporanEksekutifDemografi | null>(null);
  const [desaNama, setDesaNama] = useState("");
  const [desaLogoUrl, setDesaLogoUrl] = useState("");
  const [desaOk, setDesaOk] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isPhone = useIsPhoneClient();
  const staffApp = canUseStaffApp();

  const load = useCallback(async () => {
    if (!staffApp) return;
    setLoading(true);
    setError("");
    try {
      const [demografi, desa] = await Promise.all([
        getDemografiKrama(),
        getDesaAdatWithMedia(),
      ]);
      setData(demografi);
      setDesaNama(desa?.nama_desa_adat?.trim() ?? "");
      setDesaLogoUrl(desa?.logo_url?.trim() ?? "");
      setDesaOk(isDesaConfigured(desa));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [staffApp]);

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
            Ringkasan krama membutuhkan PC server Electron, atau HP yang membuka URL
            LAN (scan QR di Pengaturan → Jaringan LAN).
          </p>
        </Card>
      </div>
    );
  }

  const mipilCount = data?.mipil ?? 0;
  const kramaTamiuCount = data?.krama_tamiu ?? 0;
  const tamiuCount = data?.tamiu ?? 0;
  const totalKramaAktif = mipilCount + kramaTamiuCount + tamiuCount;

  return (
    <div className={cn(isPhone ? "space-y-3" : "space-y-6")}>
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
              Komposisi krama aktif
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading && !data ? (
        <p className="py-4 text-sm text-muted">Memuat ringkasan…</p>
      ) : data ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg p-1.5 bg-teal-100 text-teal-800">
              <Users size={16} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-copper-950 tracking-tight">Komposisi krama</h3>
              <p className="text-[11px] text-muted">Jumlah aktif dan rincian per jenis</p>
            </div>
          </div>

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

          <div className="grid gap-3 lg:grid-cols-3">
            <JenisKramaBreakdownTable
              title="Jenis Krama Mipil"
              total={data.mipil}
              rows={data.per_jenis.mipil}
            />
            <JenisKramaBreakdownTable
              title="Jenis Krama Tamiu"
              total={data.krama_tamiu}
              rows={data.per_jenis.krama_tamiu}
            />
            <JenisKramaBreakdownTable
              title="Jenis Tamiu"
              total={data.tamiu}
              rows={data.per_jenis.tamiu}
            />
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-copper-800 pb-1">
            <Link to="/laporan/eksekutif" className="hover:underline inline-flex items-center gap-1">
              Ringkasan eksekutif <ArrowRight size={12} />
            </Link>
            <Link to="/laporan" className="hover:underline">
              Semua laporan
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
