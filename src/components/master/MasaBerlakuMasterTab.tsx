import { useCallback, useEffect, useState } from "react";
import {
  listJenisKramaTamiu,
  listJenisMipil,
  listJenisTamiu,
  updateJenisKramaTamiuIlikita,
  updateJenisMipilMasaBerlaku,
  updateJenisTamiuIlikita,
} from "../../lib/services/master";
import { DESA_ADAT_UPDATED_EVENT, getDesaAdat } from "../../lib/services/desa";
import { updateDesaIlikitaKebijakan } from "../../lib/services/pemasih-perpanjangan";
import type { DesaAdat, JenisKramaMipilRow, JenisKramaTamiuRow, JenisTamiuRow } from "../../lib/types";
import { MASTER_CARD_PHONE, MASTER_CARD_TITLED, MASTER_PAGE } from "./master-compact";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Check } from "lucide-react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";

type JenisWithMasa = { id: string; nama: string; masa_berlaku_tahun?: number | null };

type JenisPemasihIlikita = {
  id: string;
  nama: string;
  masa_berlaku_tahun?: number | null;
  auto_perpanjang?: number | null;
};

function jenisMasaBerlakuAktif(j: { masa_berlaku_tahun?: number | null }): boolean {
  return j.masa_berlaku_tahun != null && j.masa_berlaku_tahun > 0;
}

function MasaBerlakuSection({
  title,
  subtitle,
  items,
  canEdit,
  onSave,
  onSaved,
  onError,
}: {
  title: string;
  subtitle: string;
  items: JenisWithMasa[];
  canEdit: boolean;
  onSave: (id: string, tahun: number | null) => Promise<void>;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isPhone = useIsPhoneClient();
  const cardClass = cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const nextDraft: Record<string, string> = {};
    for (const j of items) {
      nextDraft[j.id] = jenisMasaBerlakuAktif(j) ? String(j.masa_berlaku_tahun) : "";
    }
    setDraft(nextDraft);
  }, [items]);

  async function saveRow(id: string, nama: string) {
    const raw = draft[id] ?? "";
    const tahun = Number(raw);
    if (!Number.isFinite(tahun) || tahun < 1) {
      onError(`Isi masa berlaku (tahun) untuk ${nama}`);
      return;
    }
    setSavingId(id);
    try {
      await onSave(id, tahun);
      onSaved(`Masa berlaku ${nama} disimpan`);
    } catch (e) {
      onError(String(e));
    } finally {
      setSavingId(null);
    }
  }

  if (!items.length) {
    return (
      <Card title={title} className={cardClass}>
        <p className="text-sm text-muted leading-snug">{subtitle}</p>
        <p className="text-sm text-muted mt-1.5 leading-snug">
          Belum ada jenis. Tambahkan dulu di tab <strong>Jenis &amp; Tarif</strong>.
        </p>
      </Card>
    );
  }

  return (
    <Card title={title} className={cardClass}>
      <p className="text-sm text-muted mb-2 leading-snug">{subtitle}</p>
      {!isPhone && (
        <div className="text-xs font-semibold text-copper-800 grid grid-cols-[1fr_5.5rem_4.5rem] gap-2 px-1 pb-1 border-b border-copper-200 leading-snug">
          <span>Jenis</span>
          <span className="text-center">Tahun</span>
          <span />
        </div>
      )}
      <ul className={cn("text-sm", isPhone ? "space-y-2" : "divide-y divide-copper-100")}>
        {items.map((j) => (
          <li
            key={j.id}
            className={cn(
              isPhone
                ? "rounded-lg border border-copper-200 bg-copper-50/40 px-3 py-2.5 space-y-2"
                : "grid grid-cols-[1fr_5.5rem_4.5rem] gap-2 items-center py-1.5 px-1 leading-snug"
            )}
          >
            <span className="font-medium text-copper-950 leading-tight">{j.nama}</span>
            <Input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              className={cn("text-center text-sm", isPhone ? "" : "py-1")}
              disabled={!canEdit || savingId === j.id}
              value={draft[j.id] ?? ""}
              placeholder="—"
              onChange={(e) => setDraft((d) => ({ ...d, [j.id]: e.target.value }))}
              aria-label={`Masa berlaku ${j.nama} (tahun)`}
            />
            {canEdit ? (
              <Button
                type="button"
                variant="secondary"
                className={cn("text-xs", isPhone ? "h-10 w-full" : "px-2 py-1")}
                icon={Check}
                disabled={savingId === j.id}
                onClick={() => saveRow(j.id, j.nama)}
              >
                Simpan
              </Button>
            ) : (
              !isPhone && <span className="text-xs text-muted text-center">—</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PemasihJenisIlikitaSection({
  title,
  subtitle,
  items,
  canEdit,
  onSave,
  onSaved,
  onError,
}: {
  title: string;
  subtitle: string;
  items: JenisPemasihIlikita[];
  canEdit: boolean;
  onSave: (id: string, tahun: number | null, autoPerpanjang: boolean) => Promise<void>;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isPhone = useIsPhoneClient();
  const cardClass = cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adaMasaBerlaku, setAdaMasaBerlaku] = useState<Record<string, boolean>>({});
  const [autoPerpanjang, setAutoPerpanjang] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const nextDraft: Record<string, string> = {};
    const nextAda: Record<string, boolean> = {};
    const nextAuto: Record<string, boolean> = {};
    for (const j of items) {
      const aktif = jenisMasaBerlakuAktif(j);
      nextAda[j.id] = aktif;
      nextDraft[j.id] = aktif ? String(j.masa_berlaku_tahun) : "";
      nextAuto[j.id] = aktif && j.auto_perpanjang === 1;
    }
    setDraft(nextDraft);
    setAdaMasaBerlaku(nextAda);
    setAutoPerpanjang(nextAuto);
  }, [items]);

  async function saveRow(id: string, nama: string) {
    const aktif = adaMasaBerlaku[id] === true;
    if (!aktif) {
      setSavingId(id);
      try {
        await onSave(id, null, false);
        onSaved(`${nama}: tanpa masa berlaku (perpanjangan otomatis nonaktif)`);
      } catch (e) {
        onError(String(e));
      } finally {
        setSavingId(null);
      }
      return;
    }

    const raw = draft[id] ?? "";
    const tahun = Number(raw);
    if (!Number.isFinite(tahun) || tahun < 1) {
      onError(`Isi lama masa berlaku (tahun) untuk ${nama}`);
      return;
    }
    setSavingId(id);
    try {
      await onSave(id, tahun, autoPerpanjang[id] === true);
      onSaved(`Pengaturan Pemasih ${nama} disimpan`);
    } catch (e) {
      onError(String(e));
    } finally {
      setSavingId(null);
    }
  }

  if (!items.length) {
    return (
      <Card title={title} className={cardClass}>
        <p className="text-sm text-muted leading-snug">{subtitle}</p>
        <p className="text-sm text-muted mt-1.5 leading-snug">
          Belum ada jenis. Tambahkan dulu di tab <strong>Jenis &amp; Tarif</strong>.
        </p>
      </Card>
    );
  }

  return (
    <Card title={title} className={cardClass}>
      <p className="text-sm text-muted mb-3 leading-snug">{subtitle}</p>
      <ul className="space-y-2">
        {items.map((j) => {
          const aktif = adaMasaBerlaku[j.id] === true;
          const autoOn = aktif && autoPerpanjang[j.id] === true;
          return (
            <li
              key={j.id}
              className="rounded-lg border border-copper-200 bg-copper-50/40 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-copper-950 leading-tight">{j.nama}</p>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className={cn("text-xs", isPhone ? "h-10 w-full sm:w-auto" : "px-2 py-1")}
                    icon={Check}
                    disabled={savingId === j.id}
                    onClick={() => saveRow(j.id, j.nama)}
                  >
                    Simpan
                  </Button>
                ) : null}
              </div>
              <div className={cn("grid gap-2", isPhone ? "grid-cols-1" : "sm:grid-cols-2")}>
                <label className="flex items-start gap-2 rounded-md bg-white/80 border border-copper-100 px-2.5 py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    disabled={!canEdit || savingId === j.id}
                    checked={aktif}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setAdaMasaBerlaku((d) => ({ ...d, [j.id]: on }));
                      if (!on) {
                        setDraft((d) => ({ ...d, [j.id]: "" }));
                        setAutoPerpanjang((d) => ({ ...d, [j.id]: false }));
                      }
                    }}
                    aria-label={`Ada masa berlaku ${j.nama}`}
                  />
                  <span>
                    <span className="block text-sm font-medium text-copper-950">Ada masa berlaku</span>
                    <span className="block text-xs text-muted leading-snug mt-0.5">
                      Jika nonaktif, jenis ini tidak punya batas Berlaku S/D.
                    </span>
                    {aktif && (
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="text-xs text-muted shrink-0">Lama</span>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          inputMode="numeric"
                          className={cn(
                            "text-center text-sm",
                            isPhone ? "w-24 min-h-11" : "w-16 py-0.5"
                          )}
                          disabled={!canEdit || savingId === j.id}
                          value={draft[j.id] ?? ""}
                          placeholder="th"
                          onChange={(e) => setDraft((d) => ({ ...d, [j.id]: e.target.value }))}
                          aria-label={`Masa berlaku ${j.nama} (tahun)`}
                        />
                        <span className="text-xs text-muted">tahun</span>
                      </span>
                    )}
                  </span>
                </label>
                <label
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-2 ${
                    aktif
                      ? "bg-white/80 border-copper-100 cursor-pointer"
                      : "bg-copper-50/80 border-copper-100/80 cursor-not-allowed opacity-70"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    disabled={!canEdit || savingId === j.id || !aktif}
                    checked={autoOn}
                    onChange={(e) =>
                      setAutoPerpanjang((d) => ({ ...d, [j.id]: e.target.checked }))
                    }
                    aria-label={`Perpanjangan otomatis ${j.nama}`}
                  />
                  <span>
                    <span className="block text-sm font-medium text-copper-950">
                      Perpanjangan otomatis
                    </span>
                    <span className="block text-xs text-muted leading-snug mt-0.5">
                      {aktif
                        ? "Saat masa habis, jenis ini diperpanjang sendiri (tanpa biaya admin)."
                        : "Aktifkan masa berlaku dulu agar saklar ini bisa dipakai."}
                    </span>
                  </span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function IlikitaKebijakanCard({
  canEdit,
  desa,
  onDesaChange,
  onSaved,
  onError,
}: {
  canEdit: boolean;
  desa: DesaAdat | null;
  onDesaChange: (desa: DesaAdat) => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState<"enforce" | "charge" | null>(null);

  async function save(
    field: "enforce" | "charge",
    patch: {
      enforceMasaBerlakuPipil?: boolean;
      chargeBiayaAdminPemasih?: boolean;
    }
  ) {
    setSaving(field);
    try {
      const updated = await updateDesaIlikitaKebijakan(patch);
      onDesaChange(updated);
      onSaved("Kebijakan ilikita disimpan");
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(null);
    }
  }

  const enforceOn = desa?.enforce_masa_berlaku_pipil !== 0;
  const chargeOn = desa?.charge_biaya_admin_pemasih === 1;
  const isPhone = useIsPhoneClient();

  return (
    <Card
      title="Kebijakan Ilikita"
      className={cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE)}
    >
      <p className="text-sm text-muted mb-3 leading-snug">
        Pengaturan umum Pipil dan biaya administrasi. Perpanjangan otomatis Pemasih diatur per jenis
        di daftar di bawah.
      </p>
      <ul className="text-sm space-y-3">
        <li>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={!canEdit || saving === "enforce"}
              checked={enforceOn}
              onChange={(e) =>
                void save("enforce", { enforceMasaBerlakuPipil: e.target.checked })
              }
            />
            <span>
              <span className="font-medium text-copper-950">Berlakukan masa berlaku Pipil</span>
              <span className="block text-xs text-muted mt-0.5 leading-snug">
                Jika nonaktif, status Pipil tidak diturunkan karena habis masa berlaku dan kolom
                Berlaku S/D disembunyikan dari cetak Pipil serta kartu Krama Adat.
              </span>
            </span>
          </label>
        </li>
        <li>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              disabled={!canEdit || saving === "charge"}
              checked={chargeOn}
              onChange={(e) =>
                void save("charge", { chargeBiayaAdminPemasih: e.target.checked })
              }
            />
            <span>
              <span className="font-medium text-copper-950">Kenakan biaya administrasi Pemasih</span>
              <span className="block text-xs text-muted mt-0.5 leading-snug">
                Saat pendaftaran Pemasih baru atau perpanjangan manual, catat pemasukan ke Dana
                Kasukretan Lainnya sesuai tarif di Master → Jenis &amp; Tarif. Perpanjangan otomatis
                tidak dikenakan biaya.
              </span>
            </span>
          </label>
        </li>
      </ul>
    </Card>
  );
}

export function MasaBerlakuMasterTab({
  canEdit,
  onSaved,
  onError,
}: {
  canEdit: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isPhone = useIsPhoneClient();
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [jenisKT, setJenisKT] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [desa, setDesa] = useState<DesaAdat | null>(null);

  const refresh = useCallback(async () => {
    const [m, kt, t, d] = await Promise.all([
      listJenisMipil(),
      listJenisKramaTamiu(),
      listJenisTamiu(),
      getDesaAdat(),
    ]);
    setJenisMipil(m);
    setJenisKT(kt);
    setJenisT(t);
    setDesa(d);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onDesaUpdated = () => {
      void getDesaAdat().then(setDesa);
    };
    window.addEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
    return () => window.removeEventListener(DESA_ADAT_UPDATED_EVENT, onDesaUpdated);
  }, []);

  return (
    <div className={MASTER_PAGE}>
      <p className="text-sm text-muted leading-snug">
        Masa berlaku <strong>Pipil</strong> dihitung per jenis Krama Mipil. Untuk{" "}
        <strong>Pemasih</strong>, setiap jenis (misalnya Tamiu Rajeg Mula dan Rajeg Anyar) punya saklar
        sendiri: ada masa berlaku, dan perpanjangan otomatis.
      </p>
      <IlikitaKebijakanCard
        canEdit={canEdit}
        desa={desa}
        onDesaChange={setDesa}
        onSaved={onSaved}
        onError={onError}
      />
      <MasaBerlakuSection
        title="Pipil (Krama Mipil)"
        subtitle="Masa berlaku Pipil per jenis Krama Mipil."
        items={jenisMipil}
        canEdit={canEdit}
        onSave={updateJenisMipilMasaBerlaku}
        onSaved={(msg) => {
          onSaved(msg);
          refresh();
        }}
        onError={onError}
      />
      <div className={cn("grid gap-3", isPhone ? "grid-cols-1" : "lg:grid-cols-2")}>
        <PemasihJenisIlikitaSection
          title="Pemasih Krama Tamiu"
          subtitle="Atur masing-masing jenis Krama Tamiu. Saklar tidak saling mempengaruhi jenis lain."
          items={jenisKT}
          canEdit={canEdit}
          onSave={updateJenisKramaTamiuIlikita}
          onSaved={(msg) => {
            onSaved(msg);
            refresh();
          }}
          onError={onError}
        />
        <PemasihJenisIlikitaSection
          title="Pemasih Tamiu"
          subtitle="Atur masing-masing jenis Tamiu (contoh: Rajeg Mula, Rajeg Anyar) secara terpisah."
          items={jenisT}
          canEdit={canEdit}
          onSave={updateJenisTamiuIlikita}
          onSaved={(msg) => {
            onSaved(msg);
            refresh();
          }}
          onError={onError}
        />
      </div>
    </div>
  );
}
