import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, HandCoins, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { canEditKeuangan, isPetugasLapangan } from "../../lib/auth-roles";
import {
  filterSetoranTelat,
  isSetoranTelatSnoozed,
  markSetoranTelatNotifSent,
  ringkasanTeksSetoranTelat,
  SETORAN_TELAT_UPDATED_EVENT,
  shouldSendSetoranTelatNotif,
  snoozeSetoranTelat,
  buildPesanWhatsAppSetoranTelat,
} from "../../lib/setoran-telat";
import {
  listUangBelumDisetorPerPetugas,
  type UangBelumDisetorPetugas,
} from "../../lib/services/setoran";
import { getPetugasLapanganSaya } from "../../lib/services/pungut";
import {
  hasWhatsAppContact,
  openWhatsAppChat,
} from "../../lib/whatsapp";
import {
  notificationPermission,
  requestNotificationPermission,
  showAppNotification,
} from "../../lib/web-notification";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { Button } from "../ui/Button";

async function maybeNotifyPetugas(row: UangBelumDisetorPetugas): Promise<void> {
  if (!row.petugas_id || !shouldSendSetoranTelatNotif(row.petugas_id)) return;
  const ok = await showAppNotification({
    title: "Setoran belum diserahkan",
    body: `Anda masih memegang ${formatRupiah(row.total)} sejak lebih dari sehari. Segera setor ke bendahara.`,
    tag: `setoran-telat-${row.petugas_id}`,
    url: "/pungut",
  });
  if (ok) markSetoranTelatNotifSent(row.petugas_id);
}

/** Banner untuk petugas lapangan yang uangnya sudah >1 hari di tangan. */
export function SetoranTelatPetugasBanner() {
  const { user } = useAuth();
  const petugas = isPetugasLapangan(user?.peran);
  const [row, setRow] = useState<UangBelumDisetorPetugas | null>(null);
  const [notifPerm, setNotifPerm] = useState(notificationPermission());

  const refresh = useCallback(async () => {
    if (!petugas || !user?.id) {
      setRow(null);
      return;
    }
    try {
      const saya = await getPetugasLapanganSaya(user.id);
      if (!saya) {
        setRow(null);
        return;
      }
      const all = await listUangBelumDisetorPerPetugas();
      const mine = filterSetoranTelat(all).find((r) => r.petugas_id === saya.id) ?? null;
      if (mine && isSetoranTelatSnoozed(mine.petugas_id, "petugas")) {
        setRow(null);
        return;
      }
      setRow(mine);
      if (mine) void maybeNotifyPetugas(mine);
    } catch {
      setRow(null);
    }
  }, [petugas, user?.id]);

  useEffect(() => {
    void refresh();
    const onUpd = () => void refresh();
    window.addEventListener(SETORAN_TELAT_UPDATED_EVENT, onUpd);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener(SETORAN_TELAT_UPDATED_EVENT, onUpd);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  if (!petugas || !row) return null;

  return (
    <div
      role="status"
      className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
    >
      <div className="flex items-start gap-2">
        <HandCoins size={16} className="shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Uang di tangan lebih dari sehari</p>
          <p className="mt-0.5 leading-relaxed opacity-90">{ringkasanTeksSetoranTelat(row)}</p>
          <p className="mt-0.5 leading-relaxed opacity-90">
            Serahkan ke bendahara agar pembayaran masuk buku kas.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {notifPerm !== "granted" && notifPerm !== "unsupported" && notifPerm !== "denied" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                icon={Bell}
                className="h-8 text-[11px]"
                onClick={() => {
                  void requestNotificationPermission().then((p) => {
                    setNotifPerm(p);
                    if (p === "granted") void maybeNotifyPetugas(row);
                  });
                }}
              >
                Aktifkan notifikasi
              </Button>
            ) : null}
            {notifPerm === "denied" ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-900/80">
                <BellOff size={12} aria-hidden />
                Notifikasi diblokir di pengaturan browser
              </span>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-amber-300 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-amber-950 hover:bg-white"
              onClick={() => {
                snoozeSetoranTelat(row.petugas_id, "petugas", 1);
                setRow(null);
              }}
            >
              Nanti (1 hari)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Banner bendahara/admin: daftar petugas yang telat setor + WA. */
export function SetoranTelatBendaharaBanner({
  ringkasan,
  onRefresh,
}: {
  ringkasan: UangBelumDisetorPetugas[];
  onRefresh?: () => void;
}) {
  const { user } = useAuth();
  const boleh = canEditKeuangan(user?.peran);
  const [waBusy, setWaBusy] = useState<string | null>(null);
  const [snoozeTick, setSnoozeTick] = useState(0);

  useEffect(() => {
    const onUpd = () => setSnoozeTick((n) => n + 1);
    window.addEventListener(SETORAN_TELAT_UPDATED_EVENT, onUpd);
    return () => window.removeEventListener(SETORAN_TELAT_UPDATED_EVENT, onUpd);
  }, []);

  if (!boleh) return null;

  const telat = filterSetoranTelat(ringkasan).filter(
    (r) => !isSetoranTelatSnoozed(r.petugas_id, "bendahara")
  );
  // snoozeTick memaksa re-render setelah snooze
  void snoozeTick;
  if (!telat.length) return null;

  async function kirimWa(row: UangBelumDisetorPetugas) {
    if (!row.petugas_id || !hasWhatsAppContact(row.petugas_nomor_kontak)) return;
    setWaBusy(row.petugas_id);
    try {
      await openWhatsAppChat(row.petugas_nomor_kontak!, buildPesanWhatsAppSetoranTelat(row));
    } finally {
      setWaBusy(null);
    }
  }

  return (
    <div
      role="status"
      className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
    >
      <div className="flex items-start gap-2">
        <HandCoins size={16} className="shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {telat.length} petugas belum menyetor lebih dari sehari
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {telat.map((r) => (
              <li
                key={r.petugas_id ?? r.petugas_nama}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200/80 bg-white/50 px-2 py-1.5"
              >
                <span className="min-w-0">
                  <span className="font-medium">{r.petugas_nama}</span>
                  <span className="block text-[11px] opacity-90">{ringkasanTeksSetoranTelat(r)}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {hasWhatsAppContact(r.petugas_nomor_kontak) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      icon={MessageCircle}
                      className="h-8 text-[11px]"
                      disabled={waBusy === r.petugas_id}
                      onClick={() => void kirimWa(r)}
                    >
                      {waBusy === r.petugas_id ? "Membuka…" : "WhatsApp"}
                    </Button>
                  ) : (
                    <Link
                      to="/master?tab=tim"
                      className="inline-flex items-center rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-white"
                    >
                      Isi kontak
                    </Link>
                  )}
                  <button
                    type="button"
                    className="inline-flex items-center rounded-md border border-amber-300 bg-white/70 px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-white"
                    onClick={() => {
                      snoozeSetoranTelat(r.petugas_id, "bendahara", 1);
                      onRefresh?.();
                    }}
                  >
                    Nanti
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
