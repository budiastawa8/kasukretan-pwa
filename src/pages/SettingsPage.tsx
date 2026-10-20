import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  getDesaAdatWithMedia,
  upsertDesaAdat,
  isDesaConfigured,
  hasAnyKrama,
  DESA_ADAT_UPDATED_EVENT,
} from "../lib/services/desa";
import { formatNomorKartu } from "../lib/penomoran";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import { CloudBackupPanel } from "../components/settings/CloudBackupPanel";
import { CloudRestorePanel } from "../components/settings/CloudRestorePanel";
import { CloudSubscriptionPanel } from "../components/settings/CloudSubscriptionPanel";
import { CloudSyncPanel } from "../components/settings/CloudSyncPanel";
import { PortalBulkPinPanel } from "../components/settings/PortalBulkPinPanel";
import { PetugasAkunPanel } from "../components/settings/PetugasAkunPanel";
import { LanNetworkPanel } from "../components/settings/LanNetworkPanel";
import { UsersPanel } from "../components/settings/UsersPanel";
import { WhatsAppTemplatePanel } from "../components/settings/WhatsAppTemplatePanel";
import { AppAboutPanel } from "../components/settings/AppAboutPanel";
import { ChangePasswordPanel } from "../components/settings/ChangePasswordPanel";
import { isAdmin } from "../lib/auth-roles";
import {
  isOnlineModuleEnabledSync,
  refreshOnlineModuleLicense,
  useOnlineModuleEnabled,
} from "../lib/online-module";
import { isDesktopApp } from "../lib/runtime";
import { parseSettingsTab, type SettingsTab } from "../lib/settings-routes";
import { cn } from "../lib/utils";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { LIST_CARD, LIST_CARD_PHONE } from "../components/ui/list-compact";

type WilayahFormState = {
  kode_kabupaten: string;
  nama_kabupaten: string;
  kode_kecamatan: string;
  nama_kecamatan: string;
  kode_desa_adat: string;
  nama_desa_adat: string;
};

const emptyForm = (): WilayahFormState => ({
  kode_kabupaten: "",
  nama_kabupaten: "",
  kode_kecamatan: "",
  nama_kecamatan: "",
  kode_desa_adat: "",
  nama_desa_adat: "",
});

function desaToForm(d: {
  kode_kabupaten: string;
  nama_kabupaten: string;
  kode_kecamatan: string;
  nama_kecamatan: string;
  kode_desa_adat: string;
  nama_desa_adat: string;
}): WilayahFormState {
  return {
    kode_kabupaten: d.kode_kabupaten,
    nama_kabupaten: d.nama_kabupaten,
    kode_kecamatan: d.kode_kecamatan,
    nama_kecamatan: d.nama_kecamatan,
    kode_desa_adat: d.kode_desa_adat,
    nama_desa_adat: d.nama_desa_adat,
  };
}

type TabDef = {
  id: SettingsTab;
  label: string;
  adminOnly?: boolean;
  desktopOnly?: boolean;
};

const TAB_DEFS: TabDef[] = [
  { id: "umum", label: "Umum" },
  { id: "akun", label: "Akun" },
  { id: "database", label: "Database", adminOnly: true },
  { id: "pengguna", label: "Pengguna", adminOnly: true },
  { id: "online", label: "Modul Online", adminOnly: true },
  { id: "jaringan", label: "Jaringan", adminOnly: true, desktopOnly: true },
];

export function SettingsPage() {
  const isPhone = useIsPhoneClient();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const admin = isAdmin(user?.peran);
  const canEdit = admin;
  const desktop = isDesktopApp();
  const onlineFromHook = useOnlineModuleEnabled();
  const [onlineBump, setOnlineBump] = useState(0);
  const onlineEnabled = useMemo(() => {
    void onlineBump;
    return onlineFromHook || isOnlineModuleEnabledSync();
  }, [onlineBump, onlineFromHook]);
  const tab = parseSettingsTab(searchParams.get("tab"));

  const [form, setForm] = useState<WilayahFormState>(emptyForm());
  const [saved, setSaved] = useState(false);
  const [hasKrama, setHasKrama] = useState(false);

  const visibleTabs = useMemo(
    () =>
      TAB_DEFS.filter((t) => {
        if (t.adminOnly && !admin) return false;
        if (t.desktopOnly && !desktop) return false;
        return true;
      }),
    [admin, desktop]
  );

  useEffect(() => {
    if ((tab === "database" || tab === "pengguna" || tab === "online") && !admin) {
      setSearchParams({}, { replace: true });
    } else if (tab === "jaringan" && (!admin || !desktop)) {
      setSearchParams({}, { replace: true });
    }
  }, [tab, admin, desktop, setSearchParams]);

  useEffect(() => {
    getDesaAdatWithMedia().then((d) => {
      if (d) setForm(desaToForm(d));
    });
    hasAnyKrama().then(setHasKrama);
  }, []);

  const preview =
    form.kode_kabupaten.length === 2 &&
    form.kode_kecamatan.length === 2 &&
    form.kode_desa_adat.length === 4
      ? formatNomorKartu(
          {
            kode_kabupaten: form.kode_kabupaten,
            kode_kecamatan: form.kode_kecamatan,
            kode_desa_adat: form.kode_desa_adat,
          },
          "01",
          1
        )
      : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const existing = await getDesaAdatWithMedia();
    await upsertDesaAdat({
      kode_kabupaten: form.kode_kabupaten,
      nama_kabupaten: form.nama_kabupaten,
      kode_kecamatan: form.kode_kecamatan,
      nama_kecamatan: form.nama_kecamatan,
      kode_desa_adat: form.kode_desa_adat,
      nama_desa_adat: form.nama_desa_adat,
      logo_url: existing?.logo_url ?? null,
      logo_mda_url: existing?.logo_mda_url ?? null,
      jenis_umur_nyada: existing?.jenis_umur_nyada ?? null,
      jenis_krama_mipil_id: existing?.jenis_krama_mipil_id ?? null,
    });
    setSaved(true);
    window.dispatchEvent(new CustomEvent(DESA_ADAT_UPDATED_EVENT));
    setTimeout(() => setSaved(false), 3000);
  }

  function selectTab(next: SettingsTab) {
    if (next === "umum") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: next }, { replace: true });
    }
  }

  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "umum";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold">Pengaturan</h2>
        <p className="text-xs text-muted mt-0.5">
          Wilayah desa, akun Anda, backup database, dan pengguna staf.
        </p>
      </div>

      <div className="flex gap-1 p-0.5 rounded-md bg-copper-100/80 border border-copper-200 w-full sm:w-fit overflow-x-auto app-scroll-x">
        {visibleTabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={cn(
              "px-3 py-2 sm:py-1 text-xs rounded font-medium transition-colors shrink-0",
              isPhone ? "h-10 min-h-10" : "min-h-9 sm:min-h-0",
              activeTab === id
                ? "bg-copper-800 text-white shadow-sm"
                : "text-copper-800 hover:bg-copper-200/80"
            )}
            onClick={() => selectTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "umum" && (
        <div className="space-y-4">
          <Card
            title="Setup Wilayah & Desa"
            className={cn(LIST_CARD, isPhone && LIST_CARD_PHONE)}
          >
            <form onSubmit={save} className="space-y-4">
              <p className="text-sm text-muted leading-relaxed">
                Kode wilayah untuk penomoran kartu. Logo, prajuru, dan ketentuan nyada/luput
                dikelola di{" "}
                <Link to="/master" className="text-copper-800 underline font-medium">
                  Master Data ? Profil Desa
                </Link>
                .
              </p>

              <div
                className={cn(
                  "grid gap-4",
                  isPhone ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"
                )}
              >
                <div className="space-y-4">
                  <div>
                    <Label>Kode kabupaten (2 digit)</Label>
                    <Input
                      maxLength={2}
                      value={form.kode_kabupaten}
                      onChange={(e) =>
                        setForm({ ...form, kode_kabupaten: e.target.value.replace(/\D/g, "") })
                      }
                      disabled={hasKrama}
                    />
                  </div>
                  <div>
                    <Label>Nama kabupaten</Label>
                    <Input
                      value={form.nama_kabupaten}
                      onChange={(e) => setForm({ ...form, nama_kabupaten: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Kode kecamatan (2 digit)</Label>
                    <Input
                      maxLength={2}
                      value={form.kode_kecamatan}
                      onChange={(e) =>
                        setForm({ ...form, kode_kecamatan: e.target.value.replace(/\D/g, "") })
                      }
                      disabled={hasKrama}
                    />
                  </div>
                  <div>
                    <Label>Nama kecamatan</Label>
                    <Input
                      value={form.nama_kecamatan}
                      onChange={(e) => setForm({ ...form, nama_kecamatan: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Kode desa adat (4 digit)</Label>
                    <Input
                      maxLength={4}
                      value={form.kode_desa_adat}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          kode_desa_adat: e.target.value.replace(/\D/g, "").slice(0, 4),
                        })
                      }
                      disabled={hasKrama}
                    />
                  </div>
                  <div>
                    <Label>Nama desa adat</Label>
                    <Input
                      value={form.nama_desa_adat}
                      onChange={(e) => setForm({ ...form, nama_desa_adat: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm text-copper-900 bg-copper-100 border border-copper-300 p-3 rounded-lg">
                Kode wilayah agar diisi terlebih dahulu. Isikan kode wilayah dengan benar. Kode
                wilayah tidak bisa diubah setelah ada Krama yang terdaftar.
              </p>
              {preview && (
                <p className="text-sm bg-copper-50 p-3 rounded-lg border border-copper-100">
                  Preview nomor kartu: <span className="font-mono font-semibold">{preview}</span>
                </p>
              )}
              <p className="text-xs text-muted">
                Status:{" "}
                {isDesaConfigured({
                  kode_kabupaten: form.kode_kabupaten,
                  kode_kecamatan: form.kode_kecamatan,
                  kode_desa_adat: form.kode_desa_adat,
                  nama_desa_adat: form.nama_desa_adat,
                } as never)
                  ? "Siap terbit nomor kartu"
                  : "Belum lengkap"}
              </p>

              {canEdit && (
                <Button type="submit" icon={Check}>
                  Simpan
                </Button>
              )}
              {saved && <p className="text-sm text-green-600">Tersimpan.</p>}
            </form>
          </Card>

          {canEdit && <WhatsAppTemplatePanel />}

          <AppAboutPanel />
        </div>
      )}

      {activeTab === "akun" && <ChangePasswordPanel />}

      {activeTab === "database" && admin && (
        <>
          <CloudBackupPanel />
          <CloudRestorePanel />
        </>
      )}

      {activeTab === "pengguna" && admin && <UsersPanel />}

      {activeTab === "online" && admin && (
        <div className="space-y-4">
          <CloudSubscriptionPanel
            onActivated={() => {
              void refreshOnlineModuleLicense().then(() => setOnlineBump((n) => n + 1));
            }}
          />
          {onlineEnabled ? (
            <>
              <PortalBulkPinPanel />
              <PetugasAkunPanel />
              <CloudSyncPanel />
            </>
          ) : (
            <p className="text-sm text-muted rounded-lg border border-copper-200 bg-copper-50/60 px-4 py-3">
              Aktifkan langganan cloud di atas agar PIN portal, akun petugas, dan sinkronisasi
              tersedia. Di mode pengembangan (dev), modul online biasanya sudah terbuka.
            </p>
          )}
        </div>
      )}

      {activeTab === "jaringan" && admin && desktop && <LanNetworkPanel />}
    </div>
  );
}
