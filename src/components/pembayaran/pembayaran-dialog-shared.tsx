import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, History, Wallet } from "lucide-react";
import {
  akunPembayaranOptionLabel,
  listAkunKeuangan,
} from "../../lib/services/akun-keuangan";
import { listTimKasukretan } from "../../lib/services/master";
import { isJabatanPenerimaSemuaBanjar } from "../../lib/petugas-jabatan";
import type { AkunKeuanganRow, TimKasukretan } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";

export const PEMBAYARAN_DIALOG_TAB =
  "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors";

export const PEMBAYARAN_DIALOG_ZONE_HEAD = "border-b border-copper-200/80 pb-1 mb-0.5";

export function StatMini({
  label,
  value,
  className,
  compact = false,
}: {
  label: string;
  value: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex flex-col min-w-0">
      <span className={cn("text-muted leading-none", compact ? "text-[10px]" : "text-xs")}>
        {label}
      </span>
      <span
        className={cn(
          "font-semibold tabular-nums leading-tight",
          compact ? "text-sm" : "text-sm",
          className
        )}
      >
        {value}
      </span>
    </span>
  );
}

export function ZoneHeading({
  title,
  hint,
  tone = "bayar",
  zoneHeadClassName = PEMBAYARAN_DIALOG_ZONE_HEAD,
}: {
  title: string;
  hint?: string;
  tone?: "bayar" | "riwayat";
  zoneHeadClassName?: string;
}) {
  return (
    <header className={zoneHeadClassName}>
      <h4
        className={cn(
          "text-sm font-semibold leading-tight",
          tone === "bayar" ? "text-copper-950" : "text-copper-900"
        )}
      >
        {title}
      </h4>
      {hint ? <p className="text-xs text-muted leading-tight mt-px">{hint}</p> : null}
    </header>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-copper-600 leading-snug">{children}</p>;
}

export function PembayaranDialogTabs({
  tab,
  onTabChange,
  riwayatCount,
  tabClassName = PEMBAYARAN_DIALOG_TAB,
}: {
  tab: "bayar" | "riwayat";
  onTabChange: (tab: "bayar" | "riwayat") => void;
  riwayatCount?: number;
  tabClassName?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Wilayah bayar dan riwayat"
      className="flex gap-1 p-1 rounded-lg bg-copper-100/90 border border-copper-200"
    >
      <button
        type="button"
        role="tab"
        aria-selected={tab === "bayar"}
        className={cn(
          tabClassName,
          tab === "bayar"
            ? "bg-white text-copper-950 shadow-sm ring-1 ring-copper-300"
            : "text-muted hover:text-copper-800"
        )}
        onClick={() => onTabChange("bayar")}
      >
        <Wallet size={16} aria-hidden />
        Bayar
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "riwayat"}
        className={cn(
          tabClassName,
          tab === "riwayat"
            ? "bg-white text-copper-950 shadow-sm ring-1 ring-copper-200"
            : "text-muted hover:text-copper-800"
        )}
        onClick={() => onTabChange("riwayat")}
      >
        <History size={16} aria-hidden />
        Riwayat{riwayatCount != null && riwayatCount > 0 ? ` (${riwayatCount})` : ""}
      </button>
    </div>
  );
}

export function usePembayaranAkunDanPetugas(options: {
  open: boolean;
  banjarId: string;
  listAkunTransaksional: () => Promise<AkunKeuanganRow[]>;
  getDefaultAkunId: () => Promise<string>;
  /** Akun petugas lapangan: petugas selalu dirinya sendiri. */
  lockedPetugasId?: string;
}) {
  const [petugasList, setPetugasList] = useState<TimKasukretan[]>([]);
  const [akunList, setAkunList] = useState<AkunKeuanganRow[]>([]);
  const [akunLabelCtx, setAkunLabelCtx] = useState<AkunKeuanganRow[]>([]);
  const [petugasId, setPetugasId] = useState("");
  const [akunKeuanganId, setAkunKeuanganId] = useState("");

  const loadPetugas = useCallback(async () => {
    if (!options.banjarId) {
      setPetugasList([]);
      return;
    }
    const all = await listTimKasukretan();
    const banjarId = options.banjarId;
    setPetugasList(
      all
        .filter((t) => t.banjar_id === banjarId || isJabatanPenerimaSemuaBanjar(t.jabatan))
        .sort((a, b) => {
          const aHome = a.banjar_id === banjarId ? 0 : 1;
          const bHome = b.banjar_id === banjarId ? 0 : 1;
          if (aHome !== bHome) return aHome - bHome;
          return a.nama.localeCompare(b.nama, "id");
        })
    );
  }, [options.banjarId]);

  const loadAkun = useCallback(async () => {
    const [akuns, allAkun, defaultId] = await Promise.all([
      options.listAkunTransaksional(),
      listAkunKeuangan(true),
      options.getDefaultAkunId().catch(() => ""),
    ]);
    setAkunList(akuns);
    setAkunLabelCtx(allAkun);
    setAkunKeuanganId(defaultId || akuns[0]?.id || "");
  }, [options.listAkunTransaksional, options.getDefaultAkunId]);

  useEffect(() => {
    if (!options.open) return;
    void loadPetugas();
    void loadAkun();
  }, [options.open, loadPetugas, loadAkun]);

  useEffect(() => {
    if (!options.open) return;
    if (options.lockedPetugasId) {
      if (petugasId !== options.lockedPetugasId) setPetugasId(options.lockedPetugasId);
      return;
    }
    if (petugasId || petugasList.length !== 1) return;
    setPetugasId(petugasList[0]!.id);
  }, [options.open, options.lockedPetugasId, petugasId, petugasList]);

  return {
    petugasList,
    akunList,
    akunLabelCtx,
    petugasId,
    setPetugasId,
    akunKeuanganId,
    setAkunKeuanganId,
    loadPetugas,
    loadAkun,
  };
}

export function PembayaranMetaFields({
  tanggal,
  onTanggalChange,
  petugasId,
  onPetugasIdChange,
  akunKeuanganId,
  onAkunKeuanganIdChange,
  keterangan,
  onKeteranganChange,
  petugasList,
  akunList,
  akunLabelCtx,
  banjarNama,
  keteranganPlaceholder = "Keterangan (opsional)",
}: {
  tanggal: string;
  onTanggalChange: (v: string) => void;
  petugasId: string;
  onPetugasIdChange: (v: string) => void;
  akunKeuanganId: string;
  onAkunKeuanganIdChange: (v: string) => void;
  keterangan: string;
  onKeteranganChange: (v: string) => void;
  petugasList: TimKasukretan[];
  akunList: AkunKeuanganRow[];
  akunLabelCtx: AkunKeuanganRow[];
  banjarNama?: string;
  keteranganPlaceholder?: string;
}) {
  return (
    <>
      <div className="grid gap-1.5 sm:grid-cols-2">
        <div>
          <Label>Tanggal</Label>
          <DateInput value={tanggal} onChange={onTanggalChange} required />
        </div>
        <div>
          <Label>Petugas</Label>
          <Select
            value={petugasId}
            onChange={(e) => onPetugasIdChange(e.target.value)}
            required
            disabled={petugasList.length === 0}
          >
            <option value="">Pilih petugas</option>
            {petugasList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama} ({p.jabatan})
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Diterima di</Label>
          <Select
            value={akunKeuanganId}
            onChange={(e) => onAkunKeuanganIdChange(e.target.value)}
            required
            disabled={akunList.length === 0}
          >
            <option value="">Pilih akun</option>
            {akunList.map((a) => (
              <option key={a.id} value={a.id}>
                {akunPembayaranOptionLabel(a, akunLabelCtx)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {petugasList.length === 0 && banjarNama && (
        <p className="text-xs text-amber-800 leading-tight">
          Belum ada petugas di banjar {banjarNama}. Tambahkan di Master → Tim Kasukretan.
        </p>
      )}
      {petugasList.length === 0 && !banjarNama && (
        <p className="text-xs text-amber-800 leading-tight">
          Belum ada petugas di banjar ini. Tambahkan di Master → Tim Kasukretan.
        </p>
      )}
      {akunList.length === 0 && (
        <p className="text-xs text-amber-800 leading-tight">
          Belum ada akun keuangan. Tambahkan di Master → Akun & Pos.
        </p>
      )}
      <Input
        placeholder={keteranganPlaceholder}
        value={keterangan}
        onChange={(e) => onKeteranganChange(e.target.value)}
      />
    </>
  );
}

const SETOR_LANGSUNG_KEY = "kasukretan.setor_langsung.v1";

function readSetorLangsung(): boolean {
  try {
    return localStorage.getItem(SETOR_LANGSUNG_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Pilihan disimpan per perangkat: HP petugas lapangan cukup mematikannya sekali. */
export function useSetorLangsung(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(readSetorLangsung);
  const update = useCallback((v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(SETOR_LANGSUNG_KEY, v ? "1" : "0");
    } catch {
      /* penyimpanan lokal tidak tersedia */
    }
  }, []);
  return [value, update];
}

export function SetorLangsungField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-1.5 text-xs text-copper-900 leading-snug cursor-pointer select-none">
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 shrink-0"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Uang sudah diterima bendahara (langsung masuk buku kas)
        {!checked && (
          <span className="block text-[11px] text-amber-800">
            Uang masih dipegang petugas — masuk buku kas setelah disetor di Keuangan → Setoran.
          </span>
        )}
      </span>
    </label>
  );
}

export function PetugasLapanganSetorNote() {
  return (
    <p className="text-[11px] text-amber-800 leading-snug">
      Uang ini dicatat sebagai pegangan Anda dan masuk buku kas setelah disetor ke bendahara.
    </p>
  );
}

/** Status setor satu pembayaran untuk daftar riwayat. */
export function StatusSetorBadge({
  tanggalSetor,
  setoranId,
}: {
  tanggalSetor?: string | null;
  setoranId?: string | null;
}) {
  if (!tanggalSetor) {
    return (
      <span className="inline-block text-[10px] font-medium px-1 rounded bg-amber-100 text-amber-900 ml-0.5">
        Belum disetor
      </span>
    );
  }
  if (!setoranId) return null;
  return (
    <span
      className="inline-block text-[10px] font-medium px-1 rounded bg-emerald-100 text-emerald-900 ml-0.5"
      title="Sudah disetor lewat setoran petugas — terkunci"
    >
      Disetor {formatTanggalLahir(tanggalSetor)}
    </span>
  );
}

export const PEMBAYARAN_PAGE_FLASH_MS = 4000;

export function PembayaranSavedBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2 text-sm text-emerald-900 bg-emerald-50 border border-emerald-300 rounded-md px-3 py-2.5 leading-snug shadow-sm"
    >
      <Check size={18} className="shrink-0 mt-0.5 text-emerald-700" aria-hidden />
      <span className="font-medium">{message}</span>
    </div>
  );
}

/** Tutup modal, refresh induk, tampilkan flash di halaman (bukan di modal). */
export function completePembayaranBaruSave(
  message: string,
  handlers: {
    onSuccess: () => void;
    onClose: () => void;
    onSaved?: (message: string) => void;
  }
): void {
  handlers.onSuccess();
  handlers.onSaved?.(message);
  handlers.onClose();
}

export function usePageOkFlash(durationMs = PEMBAYARAN_PAGE_FLASH_MS) {
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFlashTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showOkFlash = useCallback(
    (text: string) => {
      clearFlashTimer();
      setMessage(text);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setMessage("");
      }, durationMs);
    },
    [clearFlashTimer, durationMs]
  );

  useEffect(() => () => clearFlashTimer(), [clearFlashTimer]);

  return { okFlashMessage: message, showOkFlash };
}
