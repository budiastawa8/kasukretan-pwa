import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  serializeKramaFormSnapshot,
  type KramaFormSnapshotFields,
} from "../../lib/krama-form-snapshot";
import { useNavigate } from "react-router-dom";
import { useGuardedNavigate, useKramaFormGuard } from "../../context/KramaFormGuardContext";
import { Check, UserPlus, X } from "lucide-react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import {
  listBanjar,
  listTempek,
  listArahan,
  listJenisMipil,
  listJenisKramaTamiu,
  listJenisTamiu,
} from "../../lib/services/master";
import {
  getNyadaSuggestion,
  formatAlasanNyada,
  isKramaNyada,
  isUmurMencapaiBatasNyada,
  parseBatasUmurNyada,
  resolveJenisSetelahLepasNyada,
  resolvePengarepTanggalLahir,
  type NyadaSuggestion,
} from "../../lib/nyada-ketentuan";
import {
  isJenisBaluNglintik,
  isStatusPasangan,
  jenisDapukanKode,
  listJenisDapukanIds,
} from "../../lib/dapukan-ketentuan";
import { tentukanJenisDariStatusKawin } from "../../lib/jenis-cerai";
import { formatStatusKawin } from "../../lib/status-kawin";
import { getDesaAdat } from "../../lib/services/desa";
import { syncNyadaOtomatis, type NyadaManualInput } from "../../lib/services/nyada-otomatis";
import {
  addAnggota,
  createKrama,
  gantiPengarepMeninggal,
  getKramaDetail,
  releaseAnggotaManual,
  listRtBtnPemasih,
  setKramaKepala,
  updateAnggota,
  updateKrama,
} from "../../lib/services/krama";
import { kramaListPath } from "../../lib/krama-routes";
import type {
  AnggotaDraft,
  Arahan,
  Banjar,
  DesaAdat,
  JenisKramaMipilRow,
  JenisKramaTamiuRow,
  JenisTamiuRow,
  KlasifikasiKode,
  KramaDetail,
  Tempek,
} from "../../lib/types";
import {
  gelarKepalaLabel,
  isKepalaPenduduk,
  isGelarKepalaStatus,
} from "../../lib/status-keluarga";
import {
  formatAlasanTidakAktif,
  KRAMA_STATUS_OPTIONS,
  normalizeAlasanTidakAktif,
  normalizeKramaStatus,
  type AlasanTidakAktifKode,
} from "../../lib/krama-status";
import { KramaNonaktifDialog, type KramaNonaktifConfirmValues } from "./KramaNonaktifDialog";
import {
  PengarepMeninggalDialog,
  type PengarepMeninggalCandidate,
} from "./PengarepMeninggalDialog";
import { KramaNyadaSuggestionDialog } from "./KramaNyadaSuggestionDialog";
import { NyadaManualDialog } from "./NyadaManualDialog";
import { formatBerlakuSdKrama, hasMasaBerlakuTahun } from "../../lib/masa-berlaku";
import {
  formatStatusIlikitaEfektif,
  isKramaNonaktifTotal,
  statusIlikitaEfektif,
} from "../../lib/status-ilikita";
import { isAutoPerpanjangPemasihUntuk } from "../../lib/ilikita-kebijakan";
import { isPemasihAkanHabis, PEMASIH_PERINGATAN_HARI } from "../../lib/pemasih-perhatian";
import { cn, formatTanggalLahir, hitungUmur, today, uuid } from "../../lib/utils";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { CreatableCombobox } from "../ui/CreatableCombobox";
import { Card } from "../ui/Card";
import { AnggotaFormDialog, type AnggotaFormValues } from "./AnggotaFormDialog";
import { AnggotaKeluargaTable, type AnggotaTableRow } from "./AnggotaKeluargaTable";
import { KeluarPipilIntraDesaDialog } from "./KeluarPipilIntraDesaDialog";
import { ConfirmDialog } from "../ui/ConfirmDialog";

type DeleteAnggotaTarget = {
  key: string;
  nama: string;
  kind: "draft" | "pending" | "persisted";
};

function draftToKepalaPayload(a: AnggotaDraft): CreateKramaInputKepala {
  return {
    nama_lengkap: a.nama_lengkap,
    jenis_kelamin: a.jenis_kelamin,
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir,
    status_kawin: a.status_kawin,
    pekerjaan: a.pekerjaan,
    nama_ibu: a.nama_ibu,
    nama_ayah: a.nama_ayah,
    nik_atau_nika: a.nik_atau_nika,
    agama: a.agama,
    foto_url: a.foto_url,
  };
}

type CreateKramaInputKepala = {
  nama_lengkap: string;
  jenis_kelamin: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  status_kawin?: string;
  pekerjaan?: string;
  nama_ibu?: string;
  nama_ayah?: string;
  nik_atau_nika?: string;
  agama?: string;
  foto_url?: string;
};

const PIPIL_ANGGOTA_PENDING_NOTICE =
  "Perubahan anggota belum disimpan ke database. Klik «Simpan kartu» / «Simpan perubahan» di atas untuk menyimpan Pipil secara keseluruhan.";

function draftToTableRow(a: AnggotaDraft, isKepala?: boolean): AnggotaTableRow {
  return {
    key: a.clientId,
    nama_lengkap: a.nama_lengkap,
    jenis_kelamin: a.jenis_kelamin,
    status_keluarga: a.status_keluarga,
    status_kawin: a.status_kawin,
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir,
    pekerjaan: a.pekerjaan,
    nik_atau_nika: a.nik_atau_nika,
    isKepala,
  };
}

function mergeAnggotaFormIntoRow(row: AnggotaTableRow, values: AnggotaFormValues): AnggotaTableRow {
  return {
    ...row,
    nama_lengkap: values.nama_lengkap,
    jenis_kelamin: values.jenis_kelamin,
    status_keluarga: values.status_keluarga,
    status_kawin: values.status_kawin,
    tempat_lahir: values.tempat_lahir,
    tanggal_lahir: values.tanggal_lahir,
    pekerjaan: values.pekerjaan,
    nik_atau_nika: values.nik_atau_nika,
  };
}

function FieldReadonly({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label className="mb-0.5 text-xs">{label}</Label>
      <p
        className="flex min-h-10 items-center rounded-md border border-copper-100 bg-copper-50/60 px-2.5 py-1.5 text-sm leading-snug text-copper-950 break-words md:min-h-8"
        title={value || undefined}
      >
        {value || "—"}
      </p>
    </div>
  );
}

/** Padat di desktop; target sentuh lebih besar di HP (klien LAN). */
const KRAMA_FORM_SHELL =
  "leading-snug [&_label]:mb-0.5 [&_label]:text-xs [&_label]:font-medium [&_input]:min-h-10 [&_input]:py-2 md:[&_input]:min-h-8 md:[&_input]:py-1.5 [&_select]:min-h-10 [&_select]:py-2 md:[&_select]:min-h-8 md:[&_select]:py-1.5 [&_.flatpickr-input]:min-h-10 [&_.flatpickr-input]:py-2 md:[&_.flatpickr-input]:min-h-8 md:[&_.flatpickr-input]:py-1.5";
function FormSection({ title, first }: { title: string; first?: boolean }) {
  return (
    <div
      className={cn(
        "col-span-full flex items-center gap-2",
        !first && "border-t border-copper-100/90 pt-2 mt-0.5"
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-copper-500 shrink-0">
        {title}
      </span>
      <span className="h-px flex-1 bg-copper-100" aria-hidden />
    </div>
  );
}

function FormHint({ children }: { children: ReactNode }) {
  return <p className="text-[10px] text-copper-600 mt-0.5 leading-tight">{children}</p>;
}

export function KramaWizardForm({
  klasifikasi,
  title,
  kramaId,
}: {
  klasifikasi: KlasifikasiKode;
  title: string;
  kramaId?: string;
}) {
  const navigate = useGuardedNavigate();
  const navigateAfterSave = useNavigate();
  const { register, setSuppressUnsavedDialog } = useKramaFormGuard();
  const isPhone = useIsPhoneClient();
  const basePath = kramaListPath(klasifikasi);
  const isEdit = Boolean(kramaId);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEdit);
  const [krama, setKrama] = useState<KramaDetail | null>(null);
  const [nomorKartu, setNomorKartu] = useState("");

  const isPipil = klasifikasi === "MIPIL";
  const isKramaTamiu = klasifikasi === "KRAMA_TAMIU";
  const isTamiu = klasifikasi === "TAMIU";
  const isPemasih = isKramaTamiu || isTamiu;
  const usesTanggalPencatatan = isPipil || isPemasih;
  const gelarLabel = gelarKepalaLabel(klasifikasi);
  const cardTitle = isPipil
    ? "PIPIL KULAWARGA KRAMA DESA ADAT"
    : isKramaTamiu
      ? "PEMASIH KRAMA TAMIU"
      : "PEMASIH TAMIU";

  const [banjarId, setBanjarId] = useState("");
  const [banjarKode, setBanjarKode] = useState("");
  const [tempekId, setTempekId] = useState("");
  const [arahanId, setArahanId] = useState("");
  const [jenisMipilId, setJenisMipilId] = useState("");
  const [jenisSebelumCeraiId, setJenisSebelumCeraiId] = useState<string | null>(null);
  const [jenisKramaTamiuId, setJenisKramaTamiuId] = useState("");
  const [jenisTamiuId, setJenisTamiuId] = useState("");
  const [alamat, setAlamat] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [rtBtn, setRtBtn] = useState("");
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);
  const [asalDesa, setAsalDesa] = useState("");
  const [asalKec, setAsalKec] = useState("");
  const [asalKab, setAsalKab] = useState("");
  const [asalProv, setAsalProv] = useState("");
  const [nomorKontak, setNomorKontak] = useState("");
  const [statusKrama, setStatusKrama] = useState<"aktif" | "nonaktif">("aktif");
  const [alasanTidakAktif, setAlasanTidakAktif] = useState<AlasanTidakAktifKode | "">("");
  const [tanggalTidakAktif, setTanggalTidakAktif] = useState("");
  const [keteranganTidakAktif, setKeteranganTidakAktif] = useState("");
  const [tanggalPencatatan, setTanggalPencatatan] = useState(today);
  const [nonaktifModalOpen, setNonaktifModalOpen] = useState(false);
  const [meninggalPending, setMeninggalPending] = useState<KramaNonaktifConfirmValues | null>(
    null
  );
  const [meninggalBusy, setMeninggalBusy] = useState(false);
  const [meninggalError, setMeninggalError] = useState("");
  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [nyadaDialogOpen, setNyadaDialogOpen] = useState(false);
  const [nyadaSuggestion, setNyadaSuggestion] = useState<NyadaSuggestion | null>(null);
  const nyadaChoiceRef = useRef<((choice: "apply" | "skip" | "cancel") => void) | null>(null);
  const [nyadaManualOpen, setNyadaManualOpen] = useState(false);
  const nyadaManualRef = useRef<((values: NyadaManualInput | null) => void) | null>(null);

  const [anggotaDraft, setAnggotaDraft] = useState<AnggotaDraft[]>([]);
  /** clientId (baru) atau anggota_id (edit) — Pipil & Pemasih */
  const [kepalaAnggotaKey, setKepalaAnggotaKey] = useState("");
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [anggotaNotice, setAnggotaNotice] = useState("");
  const [anggotaNoticeWarning, setAnggotaNoticeWarning] = useState(false);
  /** Edit Pipil: perubahan anggota menunggu simpan kartu keseluruhan */
  const [anggotaEdits, setAnggotaEdits] = useState<Record<string, AnggotaFormValues>>({});
  const [anggotaPendingAdd, setAnggotaPendingAdd] = useState<AnggotaDraft[]>([]);
  const [initialKepalaAnggotaKey, setInitialKepalaAnggotaKey] = useState("");
  const [skpAnggotaId, setSkpAnggotaId] = useState<string | null>(null);
  const [deleteAnggotaTarget, setDeleteAnggotaTarget] = useState<DeleteAnggotaTarget | null>(
    null
  );
  const [deleteAnggotaBusy, setDeleteAnggotaBusy] = useState(false);
  const [deleteAnggotaError, setDeleteAnggotaError] = useState("");
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [arahan, setArahan] = useState<Arahan[]>([]);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [jenisKT, setJenisKT] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);

  const usesKepalaSelect = isPipil || isPemasih;

  const kepalaFromDraft = useMemo(() => {
    if (usesKepalaSelect) {
      return kepalaAnggotaKey
        ? anggotaDraft.find((a) => a.clientId === kepalaAnggotaKey)
        : undefined;
    }
    return anggotaDraft.find((a) => isGelarKepalaStatus(a.status_keluarga, klasifikasi));
  }, [anggotaDraft, usesKepalaSelect, kepalaAnggotaKey]);

  const jenisNama = useMemo(() => {
    if (isPipil) return jenisMipil.find((j) => j.id === jenisMipilId)?.nama;
    if (isKramaTamiu) return jenisKT.find((j) => j.id === jenisKramaTamiuId)?.nama;
    return jenisT.find((j) => j.id === jenisTamiuId)?.nama;
  }, [isPipil, isKramaTamiu, jenisMipil, jenisMipilId, jenisKT, jenisKramaTamiuId, jenisT, jenisTamiuId]);

  const paturunan = jenisMipil.find((j) => j.id === jenisMipilId)?.paturunan_persen;

  const [formBaseline, setFormBaseline] = useState<string | null>(null);

  const formFields: KramaFormSnapshotFields = useMemo(
    () => ({
      banjarId,
      tempekId,
      arahanId,
      jenisMipilId,
      jenisKramaTamiuId,
      jenisTamiuId,
      alamat,
      keterangan,
      rtBtn,
      asalDesa,
      asalKec,
      asalKab,
      asalProv,
      nomorKontak,
      statusKrama,
      alasanTidakAktif,
      tanggalTidakAktif,
      keteranganTidakAktif,
      tanggalPencatatan: usesTanggalPencatatan ? tanggalPencatatan : "",
    }),
    [
      banjarId,
      tempekId,
      arahanId,
      jenisMipilId,
      jenisKramaTamiuId,
      jenisTamiuId,
      alamat,
      keterangan,
      rtBtn,
      asalDesa,
      asalKec,
      asalKab,
      asalProv,
      nomorKontak,
      statusKrama,
      alasanTidakAktif,
      tanggalTidakAktif,
      keteranganTidakAktif,
      usesTanggalPencatatan,
      tanggalPencatatan,
    ]
  );

  function handleStatusAktifChange(next: "aktif" | "nonaktif") {
    if (next === "aktif") {
      setStatusKrama("aktif");
      setAlasanTidakAktif("");
      setTanggalTidakAktif("");
      setKeteranganTidakAktif("");
      return;
    }
    setNonaktifModalOpen(true);
  }

  function confirmNonaktif(values: KramaNonaktifConfirmValues) {
    if (values.alasanTidakAktif === "meninggal" && isPipil && isEdit && krama && kramaId) {
      setNonaktifModalOpen(false);
      setMeninggalError("");
      setMeninggalPending(values);
      return;
    }
    applyNonaktif(values);
  }

  function applyNonaktif(values: KramaNonaktifConfirmValues) {
    setStatusKrama("nonaktif");
    setAlasanTidakAktif(values.alasanTidakAktif);
    setTanggalTidakAktif(values.tanggalTidakAktif);
    setKeteranganTidakAktif(values.keteranganTidakAktif);
    setNonaktifModalOpen(false);
  }

  const deferMipilAnggotaSave = isPipil && isEdit;
  const hasPendingMipilAnggota =
    deferMipilAnggotaSave &&
    (Object.keys(anggotaEdits).length > 0 || anggotaPendingAdd.length > 0);
  const hasPendingNewPipilAnggota = isPipil && !isEdit && anggotaDraft.length > 0;

  const formSnapshot = useMemo(
    () =>
      serializeKramaFormSnapshot(formFields, {
        isEdit,
        anggotaDraft,
        mipilAnggotaPending: deferMipilAnggotaSave
          ? {
              edits: anggotaEdits,
              adds: anggotaPendingAdd,
              kepalaAnggotaKey,
            }
          : undefined,
      }),
    [
      formFields,
      isEdit,
      anggotaDraft,
      deferMipilAnggotaSave,
      anggotaEdits,
      anggotaPendingAdd,
      kepalaAnggotaKey,
    ]
  );

  const isFormDirty =
    !loadingData && formBaseline !== null && formSnapshot !== formBaseline;

  const showPipilAnggotaPendingBanner =
    isPipil && (hasPendingMipilAnggota || hasPendingNewPipilAnggota);

  const kodeDapukanKrama = jenisDapukanKode(krama?.jenis_krama_mipil_id, desa);
  const pengarepHanyaPasangan =
    !!kodeDapukanKrama || isJenisBaluNglintik(krama?.jenis_krama_mipil_id, desa);

  const penggantiPengarepCandidates = useMemo<PengarepMeninggalCandidate[]>(() => {
    if (!krama) return [];
    return krama.anggota_aktif
      .filter((a) => !isKepalaPenduduk(a.penduduk_id, krama.kepala.id))
      .filter((a) => !pengarepHanyaPasangan || isStatusPasangan(a.status_keluarga))
      .map((a) => ({
        anggota_id: a.anggota_id,
        nama_lengkap: a.nama_lengkap,
        status_keluarga: a.status_keluarga ?? "",
        tanggal_lahir: a.tanggal_lahir,
      }));
  }, [krama, pengarepHanyaPasangan]);

  const catatanDapukanMeninggal = useMemo(() => {
    if (!pengarepHanyaPasangan) return undefined;
    if (kodeDapukanKrama === "dapukan") {
      const baluNama = jenisMipil.find((j) => j.id === desa?.jenis_balu_dapukan_mipil_id)?.nama;
      const batas = parseBatasUmurNyada(desa?.batas_umur_dapukan);
      return `Krama Dapukan: istri/suami melanjutkan sebagai ${baluNama ?? "Krama Balu Dapukan"}${
        batas != null ? `, atau langsung Nyada bila sudah berumur ${batas} tahun` : ""
      }. Anak tidak menggantikan Pengarep.`;
    }
    return "Pengarep Krama Balu Dapukan / Balu Nglintik tidak digantikan anak. Bila tidak ada istri/suami, kartu dinonaktifkan.";
  }, [pengarepHanyaPasangan, kodeDapukanKrama, jenisMipil, desa]);

  async function handleGantiPengarepMeninggal(values: {
    penggantiAnggotaId: string;
    pertahankanNyada: boolean;
  }) {
    if (!kramaId || !meninggalPending) return;
    if (isFormDirty) {
      setMeninggalError(
        "Ada perubahan kartu yang belum disimpan. Simpan atau batalkan perubahan tersebut terlebih dahulu."
      );
      return;
    }
    setMeninggalBusy(true);
    setMeninggalError("");
    try {
      await gantiPengarepMeninggal({
        kramaId,
        penggantiAnggotaId: values.penggantiAnggotaId,
        tanggalMeninggal: meninggalPending.tanggalTidakAktif,
        pertahankanNyada: values.pertahankanNyada,
      });
      const pengganti = penggantiPengarepCandidates.find(
        (c) => c.anggota_id === values.penggantiAnggotaId
      );
      setMeninggalPending(null);
      setLoadingData(true);
      try {
        await loadKrama();
      } finally {
        setLoadingData(false);
      }
      setAnggotaNotice(
        `Pengarep diganti oleh ${pengganti?.nama_lengkap ?? "anggota terpilih"}. Pengarep sebelumnya tercatat meninggal.`
      );
      setAnggotaNoticeWarning(false);
    } catch (e) {
      setMeninggalError(String(e));
    } finally {
      setMeninggalBusy(false);
    }
  }

  const wasLoadingRef = useRef(true);

  useEffect(() => {
    if (loadingData) {
      wasLoadingRef.current = true;
      setFormBaseline(null);
      return;
    }
    if (wasLoadingRef.current) {
      wasLoadingRef.current = false;
      setFormBaseline(formSnapshot);
    }
  }, [loadingData, formSnapshot]);

  useEffect(() => {
    listBanjar().then(setBanjar);
    if (isPipil) {
      listJenisMipil().then(setJenisMipil);
      getDesaAdat().then(setDesa);
    }
    if (isKramaTamiu) listJenisKramaTamiu().then(setJenisKT);
    if (isTamiu) listJenisTamiu().then(setJenisT);
  }, [isPipil, isKramaTamiu, isTamiu]);

  useEffect(() => {
    if (banjarId) {
      listTempek(banjarId).then(setTempek);
      const b = banjar.find((x) => x.id === banjarId);
      if (b) setBanjarKode(b.kode);
    } else setTempek([]);
    if (!isPipil) setArahanId("");
  }, [banjarId, banjar, isPipil]);

  useEffect(() => {
    if (isPipil && tempekId) listArahan(tempekId).then(setArahan);
    else setArahan([]);
  }, [tempekId, isPipil]);

  useEffect(() => {
    if (!isPemasih) {
      setRtBtnOptions([]);
      return;
    }
    void listRtBtnPemasih({ banjarId: banjarId || undefined, statusKrama: "aktif" }).then(
      setRtBtnOptions
    );
  }, [isPemasih, banjarId]);

  async function loadKrama() {
    if (!kramaId) return;
    const k = await getKramaDetail(kramaId);
    if (!k) throw new Error("Krama tidak ditemukan");
    if (k.klasifikasi_kode !== klasifikasi) throw new Error("Jenis krama tidak sesuai");
    setKrama(k);
    setNomorKartu(k.nomor_kartu);
    setBanjarId(k.banjar_id);
    setBanjarKode(k.banjar_kode);
    setTempekId(k.tempek_id ?? "");
    setArahanId(k.arahan_id ?? "");
    setJenisMipilId(k.jenis_krama_mipil_id ?? "");
    setJenisSebelumCeraiId(k.jenis_sebelum_cerai_id ?? null);
    setJenisKramaTamiuId(k.jenis_krama_tamiu_id ?? "");
    setJenisTamiuId(k.jenis_tamiu_id ?? "");
    setAlamat(k.alamat ?? "");
    setKeterangan(k.keterangan ?? "");
    setRtBtn(k.rt_btn ?? "");
    setAsalDesa(k.asal_desa_adat ?? "");
    setAsalKec(k.asal_kecamatan ?? "");
    setAsalKab(k.asal_kabupaten ?? "");
    setAsalProv(k.asal_provinsi ?? "");
    setNomorKontak(k.nomor_kontak ?? "");
    setStatusKrama(normalizeKramaStatus(k.status_krama));
    setAlasanTidakAktif(normalizeAlasanTidakAktif(k.alasan_tidak_aktif) ?? "");
    setTanggalTidakAktif(k.tanggal_tidak_aktif?.slice(0, 10) ?? "");
    setKeteranganTidakAktif(k.keterangan_tidak_aktif ?? "");
    if (
      k.klasifikasi_kode === "MIPIL" ||
      k.klasifikasi_kode === "KRAMA_TAMIU" ||
      k.klasifikasi_kode === "TAMIU"
    ) {
      setTanggalPencatatan(k.tanggal_terdaftar?.slice(0, 10) || today());
    }
    if (
      k.klasifikasi_kode === "MIPIL" ||
      k.klasifikasi_kode === "KRAMA_TAMIU" ||
      k.klasifikasi_kode === "TAMIU"
    ) {
      const kepalaAnggota = k.anggota_aktif.find((a) =>
        isKepalaPenduduk(a.penduduk_id, k.kepala.id)
      );
      const kepalaKey = kepalaAnggota?.anggota_id ?? "";
      setKepalaAnggotaKey(kepalaKey);
      setInitialKepalaAnggotaKey(kepalaKey);
    }
    if (k.klasifikasi_kode === "MIPIL") {
      setAnggotaEdits({});
      setAnggotaPendingAdd([]);
    }
  }

  useEffect(() => {
    if (!kramaId) return;
    setLoadingData(true);
    loadKrama()
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingData(false));
  }, [kramaId, klasifikasi]);

  const tableRows: AnggotaTableRow[] = isEdit
    ? deferMipilAnggotaSave
      ? [
          ...(krama?.anggota_aktif.map((a) => {
            const row: AnggotaTableRow = {
              key: a.anggota_id,
              nama_lengkap: a.nama_lengkap,
              jenis_kelamin: a.jenis_kelamin,
              status_keluarga: a.status_keluarga,
              status_kawin: a.status_kawin,
              tempat_lahir: a.tempat_lahir,
              tanggal_lahir: a.tanggal_lahir,
              pekerjaan: a.pekerjaan,
              nik_atau_nika: a.nik_atau_nika,
              nika: a.nika,
              nrkt: a.nrkt,
              nrt: a.nrt,
              isKepala: usesKepalaSelect && isKepalaPenduduk(a.penduduk_id, krama!.kepala.id),
            };
            const edit = anggotaEdits[a.anggota_id];
            return edit ? mergeAnggotaFormIntoRow(row, edit) : row;
          }) ?? []),
          ...anggotaPendingAdd.map((a) =>
            draftToTableRow(a, usesKepalaSelect && a.clientId === kepalaAnggotaKey)
          ),
        ]
      : (krama?.anggota_aktif.map((a) => ({
          key: a.anggota_id,
          nama_lengkap: a.nama_lengkap,
          jenis_kelamin: a.jenis_kelamin,
          status_keluarga: a.status_keluarga,
          status_kawin: a.status_kawin,
          tempat_lahir: a.tempat_lahir,
          tanggal_lahir: a.tanggal_lahir,
          pekerjaan: a.pekerjaan,
          nik_atau_nika: a.nik_atau_nika,
          nika: a.nika,
          nrkt: a.nrkt,
          nrt: a.nrt,
          isKepala: usesKepalaSelect && isKepalaPenduduk(a.penduduk_id, krama!.kepala.id),
        })) ?? [])
    : anggotaDraft.map((a) =>
        draftToTableRow(a, usesKepalaSelect && a.clientId === kepalaAnggotaKey)
      );

  const pipilFamilyForDialog = useMemo(() => {
    if (!isPipil || dialogMode === null) return [];
    const excludeKey = dialogMode === "edit" ? editingKey : null;
    return tableRows
      .filter((r) => r.key !== excludeKey)
      .map((r) => ({
        nama_lengkap: r.nama_lengkap,
        status_keluarga: r.status_keluarga,
      }));
  }, [isPipil, dialogMode, editingKey, tableRows]);

  const kepalaDisplay = useMemo(() => {
    if (usesKepalaSelect) {
      if (isEdit && krama) {
        const fromTable = tableRows.find((r) => r.key === kepalaAnggotaKey);
        if (fromTable) {
          const dbAnggota = krama.anggota_aktif.find((a) => a.anggota_id === fromTable.key);
          return {
            nama_lengkap: fromTable.nama_lengkap,
            jenis_kelamin: fromTable.jenis_kelamin,
            agama: dbAnggota?.agama ?? krama.kepala.agama,
          };
        }
        return {
          nama_lengkap: krama.kepala.nama_lengkap,
          jenis_kelamin: krama.kepala.jenis_kelamin,
          agama: krama.kepala.agama,
        };
      }
      if (kepalaFromDraft) {
        return {
          nama_lengkap: kepalaFromDraft.nama_lengkap,
          jenis_kelamin: kepalaFromDraft.jenis_kelamin,
          agama: kepalaFromDraft.agama,
        };
      }
      return null;
    }
    if (isEdit && krama?.kepala) {
      return {
        nama_lengkap: krama.kepala.nama_lengkap,
        jenis_kelamin: krama.kepala.jenis_kelamin,
        agama: krama.kepala.agama,
      };
    }
    if (kepalaFromDraft) {
      return {
        nama_lengkap: kepalaFromDraft.nama_lengkap,
        jenis_kelamin: kepalaFromDraft.jenis_kelamin,
        agama: kepalaFromDraft.agama,
      };
    }
    return null;
  }, [usesKepalaSelect, isEdit, krama, kepalaAnggotaKey, kepalaFromDraft, tableRows]);

  function notifyAnggotaPendingMipil() {
    setAnggotaNotice(PIPIL_ANGGOTA_PENDING_NOTICE);
    setAnggotaNoticeWarning(true);
  }

  async function handleKepalaAnggotaChange(anggotaKey: string) {
    if (!anggotaKey) {
      setKepalaAnggotaKey("");
      return;
    }
    setKepalaAnggotaKey(anggotaKey);
    if (isEdit && kramaId && !deferMipilAnggotaSave) {
      try {
        await setKramaKepala(kramaId, anggotaKey);
        await loadKrama();
      } catch (e) {
        setError(String(e));
      }
    }
  }

  function openAddAnggota() {
    setAnggotaNotice("");
    setAnggotaNoticeWarning(false);
    setEditingKey(null);
    setDialogMode("add");
  }

  function openEditAnggota(key: string) {
    setAnggotaNotice("");
    setAnggotaNoticeWarning(false);
    setEditingKey(key);
    setDialogMode("edit");
  }

  async function saveAnggotaAdd(values: AnggotaFormValues) {
    if (!isEdit || !kramaId) {
      saveAnggotaDraft(values);
      return;
    }
    if (deferMipilAnggotaSave) {
      const clientId = uuid();
      const statusAwal =
        isGelarKepalaStatus(values.status_keluarga, klasifikasi) && isPipil
          ? "Istri"
          : values.status_keluarga;
      setAnggotaPendingAdd((prev) => [...prev, { ...values, clientId, status_keluarga: statusAwal }]);
      if (usesKepalaSelect && !kepalaAnggotaKey) {
        setKepalaAnggotaKey(clientId);
      }
      notifyAnggotaPendingMipil();
      setDialogMode(null);
      setEditingKey(null);
      return;
    }
    try {
      const statusAwal =
        isGelarKepalaStatus(values.status_keluarga, klasifikasi) && isPipil
          ? "Istri"
          : values.status_keluarga;
      await addAnggota({
        kramaId,
        statusKeluarga: statusAwal,
        penduduk: {
          nama_lengkap: values.nama_lengkap,
          jenis_kelamin: values.jenis_kelamin,
          tempat_lahir: values.tempat_lahir,
          tanggal_lahir: values.tanggal_lahir,
          status_kawin: values.status_kawin,
          pekerjaan: values.pekerjaan,
          nama_ibu: values.nama_ibu,
          nama_ayah: values.nama_ayah,
          nik_atau_nika: values.nik_atau_nika,
          agama: values.agama,
          foto_url: values.foto_url,
        },
      });
      await loadKrama();
      setAnggotaNotice("Anggota baru berhasil ditambahkan.");
      setAnggotaNoticeWarning(false);
      setDialogMode(null);
      setEditingKey(null);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }

  function saveAnggotaDraft(values: AnggotaFormValues) {
    if (dialogMode === "add") {
      const clientId = uuid();
      let list = [...anggotaDraft, { ...values, clientId }];
      if (usesKepalaSelect && !kepalaAnggotaKey) {
        setKepalaAnggotaKey(clientId);
      }
      setAnggotaDraft(list);
      notifyAnggotaPendingMipil();
    } else if (editingKey) {
      setAnggotaDraft((prev) => {
        const list = prev.map((a) =>
          a.clientId === editingKey ? { ...a, ...values, clientId: editingKey } : a
        );
        return list;
      });
      notifyAnggotaPendingMipil();
    }
    setDialogMode(null);
    setEditingKey(null);
  }

  async function saveAnggotaEdit(values: AnggotaFormValues) {
    if (!kramaId || !editingKey || !krama) {
      throw new Error("Data krama tidak lengkap. Muat ulang halaman lalu coba lagi.");
    }
    if (deferMipilAnggotaSave) {
      const pending = anggotaPendingAdd.find((a) => a.clientId === editingKey);
      if (pending) {
        setAnggotaPendingAdd((prev) =>
          prev.map((a) => (a.clientId === editingKey ? { ...a, ...values, clientId: editingKey } : a))
        );
      } else {
        setAnggotaEdits((prev) => ({ ...prev, [editingKey]: values }));
      }
      notifyAnggotaPendingMipil();
      setDialogMode(null);
      setEditingKey(null);
      return;
    }
    try {
      const editingAnggota = krama.anggota_aktif.find((a) => a.anggota_id === editingKey);
      const isKepalaMember = Boolean(
        editingAnggota && isKepalaPenduduk(editingAnggota.penduduk_id, krama.kepala.id)
      );
      await updateAnggota({
        kramaId,
        anggotaId: editingKey,
        statusKeluarga: isKepalaMember ? undefined : values.status_keluarga,
        penduduk: {
          nama_lengkap: values.nama_lengkap,
          jenis_kelamin: values.jenis_kelamin,
          tempat_lahir: values.tempat_lahir,
          tanggal_lahir: values.tanggal_lahir,
          status_kawin: values.status_kawin,
          pekerjaan: values.pekerjaan,
          nama_ibu: values.nama_ibu,
          nama_ayah: values.nama_ayah,
          nik_atau_nika: values.nik_atau_nika,
          agama: values.agama,
          foto_url: values.foto_url,
        },
      });
      await loadKrama();
      setAnggotaNotice("Perubahan anggota berhasil disimpan.");
      setAnggotaNoticeWarning(false);
      setDialogMode(null);
      setEditingKey(null);
    } catch (e) {
      setError(String(e));
      throw e;
    }
  }

  async function flushPendingMipilAnggota(): Promise<void> {
    if (!kramaId || !deferMipilAnggotaSave) return;
    const clientToAnggotaId = new Map<string, string>();
    for (const draft of anggotaPendingAdd) {
      const statusAwal =
        isGelarKepalaStatus(draft.status_keluarga, klasifikasi) && isPipil
          ? "Istri"
          : draft.status_keluarga;
      const anggotaId = await addAnggota({
        kramaId,
        statusKeluarga: statusAwal,
        penduduk: {
          nama_lengkap: draft.nama_lengkap,
          jenis_kelamin: draft.jenis_kelamin,
          tempat_lahir: draft.tempat_lahir,
          tanggal_lahir: draft.tanggal_lahir,
          status_kawin: draft.status_kawin,
          pekerjaan: draft.pekerjaan,
          nama_ibu: draft.nama_ibu,
          nama_ayah: draft.nama_ayah,
          nik_atau_nika: draft.nik_atau_nika,
          agama: draft.agama,
          foto_url: draft.foto_url,
        },
      });
      clientToAnggotaId.set(draft.clientId, anggotaId);
    }
    for (const [anggotaId, values] of Object.entries(anggotaEdits)) {
      const editingAnggota = krama?.anggota_aktif.find((a) => a.anggota_id === anggotaId);
      const isKepalaMember = Boolean(
        editingAnggota && isKepalaPenduduk(editingAnggota.penduduk_id, krama!.kepala.id)
      );
      await updateAnggota({
        kramaId,
        anggotaId,
        statusKeluarga: isKepalaMember ? undefined : values.status_keluarga,
        penduduk: {
          nama_lengkap: values.nama_lengkap,
          jenis_kelamin: values.jenis_kelamin,
          tempat_lahir: values.tempat_lahir,
          tanggal_lahir: values.tanggal_lahir,
          status_kawin: values.status_kawin,
          pekerjaan: values.pekerjaan,
          nama_ibu: values.nama_ibu,
          nama_ayah: values.nama_ayah,
          nik_atau_nika: values.nik_atau_nika,
          agama: values.agama,
          foto_url: values.foto_url,
        },
      });
    }
    const resolvedKepalaKey = clientToAnggotaId.get(kepalaAnggotaKey) ?? kepalaAnggotaKey;
    if (resolvedKepalaKey && resolvedKepalaKey !== initialKepalaAnggotaKey) {
      await setKramaKepala(kramaId, resolvedKepalaKey);
    }
    setAnggotaEdits({});
    setAnggotaPendingAdd([]);
    setInitialKepalaAnggotaKey(resolvedKepalaKey);
    setAnggotaNotice("");
    setAnggotaNoticeWarning(false);
  }

  function anggotaNamaForKey(key: string): string {
    if (!isEdit) {
      return anggotaDraft.find((a) => a.clientId === key)?.nama_lengkap ?? "anggota ini";
    }
    if (deferMipilAnggotaSave) {
      const pending = anggotaPendingAdd.find((a) => a.clientId === key);
      if (pending) return pending.nama_lengkap;
      const edit = anggotaEdits[key];
      if (edit?.nama_lengkap) return edit.nama_lengkap;
    }
    return krama?.anggota_aktif.find((a) => a.anggota_id === key)?.nama_lengkap ?? "anggota ini";
  }

  function handleDeleteAnggota(key: string) {
    const nama = anggotaNamaForKey(key);
    if (!isEdit) {
      setDeleteAnggotaError("");
      setDeleteAnggotaTarget({ key, nama, kind: "draft" });
      return;
    }
    if (deferMipilAnggotaSave && anggotaPendingAdd.some((a) => a.clientId === key)) {
      setDeleteAnggotaError("");
      setDeleteAnggotaTarget({ key, nama, kind: "pending" });
      return;
    }
    setDeleteAnggotaError("");
    setDeleteAnggotaTarget({ key, nama, kind: "persisted" });
  }

  async function confirmDeleteAnggota() {
    if (!deleteAnggotaTarget) return;
    const { key, kind } = deleteAnggotaTarget;

    const kepalaPenggantiKey = () =>
      tableRows.find((r) => r.key !== key)?.key ?? "";

    if (kind === "draft") {
      setAnggotaDraft((prev) => prev.filter((a) => a.clientId !== key));
      if (kepalaAnggotaKey === key) setKepalaAnggotaKey(kepalaPenggantiKey());
      setDeleteAnggotaTarget(null);
      return;
    }

    if (kind === "pending") {
      setAnggotaPendingAdd((prev) => prev.filter((a) => a.clientId !== key));
      if (kepalaAnggotaKey === key) setKepalaAnggotaKey(kepalaPenggantiKey());
      setDeleteAnggotaTarget(null);
      return;
    }

    if (!kramaId) return;
    setDeleteAnggotaBusy(true);
    setDeleteAnggotaError("");
    try {
      await releaseAnggotaManual(kramaId, key);
      if (deferMipilAnggotaSave) {
        setAnggotaEdits((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      await loadKrama();
      setDeleteAnggotaTarget(null);
    } catch (e) {
      setDeleteAnggotaError(String(e));
    } finally {
      setDeleteAnggotaBusy(false);
    }
  }

  const deleteAnggotaMessage = useMemo(() => {
    if (!deleteAnggotaTarget) return "";
    const { nama, kind } = deleteAnggotaTarget;
    const kartu = isPipil ? "Pipil" : "Pemasih";
    if (kind === "persisted") {
      if (isPipil) {
        return `Hapus ${nama} dari kartu Pipil ini? Anggota dikeluarkan dari daftar aktif dan nomor NIKA-nya dilepas sehingga slot urut dapat dipakai lagi. Untuk keluar resmi (pindah/meninggal), gunakan menu Surat Keterangan Pindah atau Keluar Pipil.`;
      }
      return `Hapus ${nama} dari kartu ${kartu} ini? Anggota akan dikeluarkan dari daftar aktif.`;
    }
    const base = `Hapus ${nama} dari daftar anggota? Perubahan belum disimpan ke database.`;
    if (usesKepalaSelect && deleteAnggotaTarget.key === kepalaAnggotaKey) {
      const pengganti = tableRows.find((r) => r.key !== deleteAnggotaTarget.key);
      return pengganti
        ? `${base} ${nama} adalah ${gelarLabel}; ${pengganti.nama_lengkap} otomatis menjadi ${gelarLabel} pengganti.`
        : `${base} ${nama} adalah ${gelarLabel}; tambahkan ${gelarLabel} baru setelah ini.`;
    }
    return base;
  }, [deleteAnggotaTarget, isPipil, usesKepalaSelect, kepalaAnggotaKey, tableRows, gelarLabel]);

  function getDialogInitial(): AnggotaFormValues | undefined {
    if (dialogMode === "add") return undefined;
    if (!editingKey) return undefined;
    if (!isEdit) {
      const a = anggotaDraft.find((x) => x.clientId === editingKey);
      if (!a) return undefined;
      const { clientId: _c, ...rest } = a;
      return rest;
    }
    const pending = anggotaPendingAdd.find((x) => x.clientId === editingKey);
    if (pending) {
      const { clientId: _c, ...rest } = pending;
      return rest;
    }
    const edited = anggotaEdits[editingKey];
    if (edited) return edited;
    const a = krama?.anggota_aktif.find((x) => x.anggota_id === editingKey);
    if (!a) return undefined;
    return {
      nama_lengkap: a.nama_lengkap,
      jenis_kelamin: a.jenis_kelamin,
      status_keluarga: a.status_keluarga,
      tempat_lahir: a.tempat_lahir ?? undefined,
      tanggal_lahir: a.tanggal_lahir?.trim() || undefined,
      status_kawin: a.status_kawin ?? undefined,
      pekerjaan: a.pekerjaan ?? undefined,
      nama_ibu: a.nama_ibu ?? undefined,
      nama_ayah: a.nama_ayah ?? undefined,
      nik_atau_nika: a.nik_atau_nika ?? undefined,
      agama: a.agama ?? undefined,
      foto_url: a.foto_url ?? undefined,
    };
  }

  const persistForm = useCallback(
    async (opts?: {
      jenisMipilId?: string;
      nyadaManual?: NyadaManualInput;
    }): Promise<string | null> => {
    const mipilJenisId = opts?.jenisMipilId ?? jenisMipilId;
    setLoading(true);
    setError("");
    try {
      if (!isEdit) {
        if (usesKepalaSelect) {
          if (!kepalaAnggotaKey || !kepalaFromDraft) {
            throw new Error(`Tambahkan anggota lalu pilih Nama ${gelarLabel}`);
          }
        } else if (!kepalaFromDraft) {
          throw new Error(`Tambahkan anggota dan tetapkan satu ${gelarLabel}`);
        }
        const id = await createKrama({
          klasifikasiKode: klasifikasi,
          banjarId,
          banjarKode,
          tempekId: tempekId || undefined,
          arahanId: isPipil ? arahanId || undefined : undefined,
          alamat,
          keterangan: isPipil ? keterangan : undefined,
          rtBtn: isPemasih ? rtBtn : undefined,
          asalDesaAdat: isPemasih ? asalDesa : undefined,
          asalKecamatan: isPemasih ? asalKec : undefined,
          asalKabupaten: isPemasih ? asalKab : undefined,
          asalProvinsi: isTamiu ? asalProv : undefined,
          jenisMipilId: isPipil ? mipilJenisId : undefined,
          jenisKramaTamiuId: isKramaTamiu ? jenisKramaTamiuId : undefined,
          jenisTamiuId: isTamiu ? jenisTamiuId : undefined,
          nomorKontak,
          statusKrama,
          alasanTidakAktif: statusKrama === "nonaktif" ? alasanTidakAktif : undefined,
          tanggalTidakAktif: statusKrama === "nonaktif" ? tanggalTidakAktif : undefined,
          keteranganTidakAktif: statusKrama === "nonaktif" ? keteranganTidakAktif : undefined,
          tanggalTerdaftar: usesTanggalPencatatan ? tanggalPencatatan : undefined,
          anggota: anggotaDraft,
          kepalaAnggotaClientId: usesKepalaSelect ? kepalaAnggotaKey : undefined,
          kepala: draftToKepalaPayload(kepalaFromDraft!),
          jenisSebelumCeraiId: isPipil ? jenisSebelumCeraiId : undefined,
          nyadaManual: isPipil ? opts?.nyadaManual : undefined,
        });
        return id;
      }

      if (!kramaId || !krama) throw new Error("Data krama tidak ada");
      await updateKrama({
        kramaId,
        klasifikasiKode: klasifikasi,
        banjarId,
        banjarKode,
        tempekId: tempekId || undefined,
        arahanId: isPipil ? arahanId || undefined : undefined,
        alamat,
        keterangan: isPipil ? keterangan : undefined,
        rtBtn: isPemasih ? rtBtn : undefined,
        asalDesaAdat: isPemasih ? asalDesa : undefined,
        asalKecamatan: isPemasih ? asalKec : undefined,
        asalKabupaten: isPemasih ? asalKab : undefined,
        asalProvinsi: isTamiu ? asalProv : undefined,
        jenisMipilId: isPipil ? mipilJenisId : undefined,
        jenisKramaTamiuId: isKramaTamiu ? jenisKramaTamiuId : undefined,
        jenisTamiuId: isTamiu ? jenisTamiuId : undefined,
        nomorKontak,
        statusKrama,
        alasanTidakAktif: statusKrama === "nonaktif" ? alasanTidakAktif : undefined,
        tanggalTidakAktif: statusKrama === "nonaktif" ? tanggalTidakAktif : undefined,
        keteranganTidakAktif: statusKrama === "nonaktif" ? keteranganTidakAktif : undefined,
        tanggalTerdaftar: usesTanggalPencatatan ? tanggalPencatatan : undefined,
        kepala: {
          nama_lengkap: krama.kepala.nama_lengkap,
          jenis_kelamin: krama.kepala.jenis_kelamin,
          tempat_lahir: krama.kepala.tempat_lahir ?? undefined,
          tanggal_lahir: krama.kepala.tanggal_lahir ?? undefined,
          status_kawin: krama.kepala.status_kawin ?? undefined,
          pekerjaan: krama.kepala.pekerjaan ?? undefined,
          nama_ibu: krama.kepala.nama_ibu ?? undefined,
          nama_ayah: krama.kepala.nama_ayah ?? undefined,
          nik_atau_nika: krama.kepala.nik_atau_nika ?? undefined,
          agama: krama.kepala.agama ?? undefined,
          foto_url: krama.kepala.foto_url ?? undefined,
        },
        jenisSebelumCeraiId: isPipil ? jenisSebelumCeraiId : undefined,
        nyadaManual: isPipil ? opts?.nyadaManual : undefined,
      });
      if (deferMipilAnggotaSave) {
        await flushPendingMipilAnggota();
        await loadKrama();
      } else if (usesTanggalPencatatan) {
        await loadKrama();
      }
      return kramaId;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  },
  [
    isEdit,
    kepalaFromDraft,
    kepalaAnggotaKey,
    usesKepalaSelect,
    anggotaDraft,
    gelarLabel,
    klasifikasi,
    banjarId,
    banjarKode,
    tempekId,
    isPipil,
    arahanId,
    alamat,
    keterangan,
    isPemasih,
    rtBtn,
    asalDesa,
    asalKec,
    asalKab,
    isTamiu,
    asalProv,
    nomorKontak,
    statusKrama,
    alasanTidakAktif,
    tanggalTidakAktif,
    keteranganTidakAktif,
    tanggalPencatatan,
    jenisMipilId,
    jenisSebelumCeraiId,
    isKramaTamiu,
    jenisKramaTamiuId,
    jenisTamiuId,
    anggotaDraft,
    kramaId,
    krama,
    deferMipilAnggotaSave,
    anggotaEdits,
    anggotaPendingAdd,
    initialKepalaAnggotaKey,
    usesTanggalPencatatan,
  ]);

  const computeNyadaSuggestion = useCallback(
    async (desaForCheck: DesaAdat | null) => {
      const pengarepTgl = resolvePengarepTanggalLahir({
        isEdit,
        klasifikasi,
        krama,
        kepalaFromDraft,
      });
      return getNyadaSuggestion({
        klasifikasi,
        desa: desaForCheck,
        jenisMipilId,
        pengarepTanggalLahir: pengarepTgl,
        jenisMipilNama: (id) => jenisMipil.find((j) => j.id === id)?.nama,
      });
    },
    [isEdit, klasifikasi, krama, kepalaFromDraft, jenisMipilId, jenisMipil]
  );

  const saveWithNyadaCheck = useCallback(async (): Promise<string | null> => {
    if (!isPipil) {
      return persistForm();
    }

    let desaForCheck = desa;
    if (!desaForCheck) {
      desaForCheck = await getDesaAdat();
      if (desaForCheck) setDesa(desaForCheck);
    }

    const suggestion = await computeNyadaSuggestion(desaForCheck);
    let choice: "apply" | "skip" | "cancel" | null = null;
    if (suggestion) {
      setNyadaSuggestion(suggestion);
      setNyadaDialogOpen(true);
      setSuppressUnsavedDialog(true);
      try {
        choice = await new Promise<"apply" | "skip" | "cancel">((resolve) => {
          nyadaChoiceRef.current = resolve;
        });
      } finally {
        setNyadaDialogOpen(false);
        setNyadaSuggestion(null);
        setSuppressUnsavedDialog(false);
      }
      if (choice === "cancel") return null;
    }
    const jenisOverride = choice === "apply" ? suggestion?.jenisNyadaId : undefined;

    let nyadaManual: NyadaManualInput | undefined;
    const jenisLama = isEdit ? krama?.jenis_krama_mipil_id?.trim() || "" : "";
    const pengarepTgl = resolvePengarepTanggalLahir({ isEdit, klasifikasi, krama, kepalaFromDraft });
    if (
      !jenisOverride &&
      jenisMipilId !== jenisLama &&
      jenisMipilId === desaForCheck?.jenis_krama_mipil_id?.trim() &&
      !jenisDapukanKode(jenisLama, desaForCheck) &&
      !isUmurMencapaiBatasNyada(pengarepTgl, desaForCheck?.jenis_umur_nyada)
    ) {
      setNyadaManualOpen(true);
      setSuppressUnsavedDialog(true);
      try {
        const hasil = await new Promise<NyadaManualInput | null>((resolve) => {
          nyadaManualRef.current = resolve;
        });
        if (!hasil) return null;
        nyadaManual = hasil;
      } finally {
        setNyadaManualOpen(false);
        setSuppressUnsavedDialog(false);
      }
    }

    const savedId = await persistForm({
      jenisMipilId: jenisOverride,
      nyadaManual,
    });
    if (savedId && jenisOverride) setJenisMipilId(jenisOverride);
    if (savedId && statusKrama === "aktif") {
      // Pengarep/tanggal lahir bisa berubah lewat anggota setelah updateKrama.
      const berubah = await syncNyadaOtomatis({ kramaId: savedId }).catch(() => 0);
      if (berubah > 0) {
        const terbaru = await getKramaDetail(savedId).catch(() => null);
        if (terbaru) setJenisMipilId(terbaru.jenis_krama_mipil_id ?? "");
      }
    }
    return savedId;
  }, [
    isPipil,
    isEdit,
    klasifikasi,
    krama,
    kepalaFromDraft,
    jenisMipilId,
    desa,
    statusKrama,
    computeNyadaSuggestion,
    persistForm,
    setSuppressUnsavedDialog,
  ]);

  function resolveNyadaChoice(choice: "apply" | "skip" | "cancel") {
    nyadaChoiceRef.current?.(choice);
    nyadaChoiceRef.current = null;
  }

  function resolveNyadaManual(values: NyadaManualInput | null) {
    nyadaManualRef.current?.(values);
    nyadaManualRef.current = null;
  }

  useEffect(() => {
    return () => setSuppressUnsavedDialog(false);
  }, [setSuppressUnsavedDialog]);

  useEffect(() => {
    register({
      isDirty: isFormDirty,
      onSave: async () => {
        const savedId = await saveWithNyadaCheck();
        if (!savedId) return false;
        setFormBaseline(formSnapshot);
        return true;
      },
    });
    return () => register(null);
  }, [register, isFormDirty, saveWithNyadaCheck, formSnapshot]);

  async function submit() {
    const savedId = await saveWithNyadaCheck();
    if (!savedId) return;
    setFormBaseline(formSnapshot);
    register(null);
    // Lewati guard "simpan perubahan?" — data baru saja disimpan; baseline React belum ter-update.
    navigateAfterSave(`${basePath}/${savedId}`);
  }

  const nomorLabel = isPipil ? "NPK" : isKramaTamiu ? "NPKT" : "NPT";

  const kramaNonaktifEfektif =
    statusKrama === "nonaktif" || (isEdit && krama ? isKramaNonaktifTotal(krama) : false);
  const statusIlikitaLabel = kramaNonaktifEfektif
    ? "Tidak Aktif"
    : isEdit && krama
      ? formatStatusIlikitaEfektif(klasifikasi, krama)
      : "Aktif";
  const ilikitaPerpanjanganRelevan = statusKrama === "aktif";

  const masaBerlakuTahunPreview = useMemo(() => {
    if (!usesTanggalPencatatan) return null;
    if (isEdit && krama?.masa_berlaku_tahun != null) return krama.masa_berlaku_tahun;
    if (isPipil) return jenisMipil.find((j) => j.id === jenisMipilId)?.masa_berlaku_tahun ?? null;
    const row = isKramaTamiu
      ? jenisKT.find((j) => j.id === jenisKramaTamiuId)
      : jenisT.find((j) => j.id === jenisTamiuId);
    return row?.masa_berlaku_tahun ?? null;
  }, [
    usesTanggalPencatatan,
    isEdit,
    krama?.masa_berlaku_tahun,
    isPipil,
    jenisMipil,
    jenisMipilId,
    isKramaTamiu,
    jenisKT,
    jenisKramaTamiuId,
    jenisT,
    jenisTamiuId,
  ]);

  const berlakuSdPreview = useMemo(() => {
    if (!usesTanggalPencatatan || !ilikitaPerpanjanganRelevan || masaBerlakuTahunPreview == null) {
      return "";
    }
    const stub = {
      klasifikasi_kode: klasifikasi,
      tanggal_terdaftar: tanggalPencatatan,
      tanggal_berlaku_mulai_pemasih: isPemasih ? tanggalPencatatan : null,
      masa_berlaku_tahun: masaBerlakuTahunPreview,
      anggota_aktif: krama?.anggota_aktif ?? [],
      kepala: krama?.kepala,
    } as KramaDetail;
    return formatBerlakuSdKrama(stub);
  }, [
    usesTanggalPencatatan,
    isPemasih,
    ilikitaPerpanjanganRelevan,
    masaBerlakuTahunPreview,
    klasifikasi,
    tanggalPencatatan,
    krama,
  ]);

  const pemasihAkanHabisPreview = useMemo(() => {
    if (!isPemasih || !ilikitaPerpanjanganRelevan || masaBerlakuTahunPreview == null) {
      return false;
    }
    const stub = {
      ...(krama ?? {}),
      klasifikasi_kode: klasifikasi,
      status_krama: statusKrama,
      status_pemasih: "aktif",
      tanggal_terdaftar: tanggalPencatatan,
      tanggal_berlaku_mulai_pemasih: tanggalPencatatan,
      masa_berlaku_tahun: masaBerlakuTahunPreview,
      anggota_aktif: krama?.anggota_aktif ?? [],
      kepala: krama?.kepala ?? { id: "", nama_lengkap: "" },
    } as KramaDetail;
    return isPemasihAkanHabis(stub);
  }, [
    isPemasih,
    ilikitaPerpanjanganRelevan,
    krama,
    klasifikasi,
    statusKrama,
    tanggalPencatatan,
    masaBerlakuTahunPreview,
  ]);

  const pemasihAutoPerpanjangPreview = useMemo(() => {
    if (!isPemasih) return false;
    const row = isKramaTamiu
      ? jenisKT.find((j) => j.id === jenisKramaTamiuId)
      : jenisT.find((j) => j.id === jenisTamiuId);
    return isAutoPerpanjangPemasihUntuk(
      {
        klasifikasi_kode: klasifikasi,
        masa_berlaku_tahun: masaBerlakuTahunPreview,
        auto_perpanjang_pemasih: row?.auto_perpanjang ?? 0,
      },
      desa
    );
  }, [
    isPemasih,
    isKramaTamiu,
    jenisKT,
    jenisKramaTamiuId,
    jenisT,
    jenisTamiuId,
    klasifikasi,
    masaBerlakuTahunPreview,
    desa,
  ]);

  const pengarepKetentuan = useMemo(
    () => ({
      batasUmurNyada: parseBatasUmurNyada(desa?.jenis_umur_nyada),
      nyadaBerlakuMulai: desa?.nyada_berlaku_mulai,
      jenisNyadaId: desa?.jenis_krama_mipil_id,
      jenisCeraiMatiId: desa?.jenis_cerai_mati_mipil_id,
      jenisCeraiHidupId: desa?.jenis_cerai_hidup_mipil_id,
      jenisDapukanIds: listJenisDapukanIds(desa),
    }),
    [desa]
  );

  const isPengarepForm = useMemo(() => {
    if (!isPipil || dialogMode === null) return false;
    if (isEdit && dialogMode === "edit" && krama && editingKey) {
      const a = krama.anggota_aktif.find((x) => x.anggota_id === editingKey);
      return Boolean(a && isKepalaPenduduk(a.penduduk_id, krama.kepala.id));
    }
    if (!isEdit && dialogMode === "edit" && editingKey && kepalaAnggotaKey) {
      return editingKey === kepalaAnggotaKey;
    }
    if (!isEdit && dialogMode === "add" && !kepalaAnggotaKey) return true;
    return false;
  }, [isPipil, dialogMode, isEdit, krama, editingKey, kepalaAnggotaKey]);

  const tambahPengarepPertama =
    !isEdit && usesKepalaSelect && dialogMode === "add" && !kepalaAnggotaKey;
  const perluPengarepDulu = !isEdit && usesKepalaSelect && tableRows.length === 0;

  const kepalaStatusKawin = isPipil
    ? (tableRows.find((r) => r.key === kepalaAnggotaKey)?.status_kawin ?? null)
    : null;
  const kepalaStatusKawinSig = `${kepalaAnggotaKey}|${kepalaStatusKawin ?? ""}`;
  const kepalaStatusKawinSigRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPipil || (isEdit && !krama)) {
      kepalaStatusKawinSigRef.current = null;
      return;
    }
    const sebelumnya = kepalaStatusKawinSigRef.current;
    kepalaStatusKawinSigRef.current = kepalaStatusKawinSig;
    if (sebelumnya === null && isEdit) return;
    if (sebelumnya === kepalaStatusKawinSig) return;

    const hasil = tentukanJenisDariStatusKawin({
      statusKawin: kepalaStatusKawin,
      jenisId: jenisMipilId,
      jenisSebelumCeraiId,
      desa,
    });
    if (!hasil) return;
    setJenisMipilId(hasil.jenisId);
    setJenisSebelumCeraiId(hasil.jenisSebelumCeraiId);
    const namaJenis = jenisMipil.find((j) => j.id === hasil.jenisId)?.nama ?? "jenis baru";
    const sebab =
      hasil.alasan === "kawin_lagi"
        ? `${gelarLabel} kembali berstatus Kawin`
        : `${gelarLabel} berstatus ${formatStatusKawin(kepalaStatusKawin)}`;
    setAnggotaNotice(
      `${sebab} — Jenis Krama Mipil otomatis diubah menjadi ${namaJenis}. Klik «${
        isEdit ? "Simpan perubahan" : "Simpan kartu"
      }» untuk menyimpan.`
    );
    setAnggotaNoticeWarning(true);
  }, [
    isPipil,
    isEdit,
    krama,
    kepalaStatusKawinSig,
    kepalaStatusKawin,
    jenisMipilId,
    jenisSebelumCeraiId,
    desa,
    jenisMipil,
    gelarLabel,
  ]);

  if (loadingData) {
    return <p className="text-muted">Memuat data...</p>;
  }

  const anggotaDulu = !isEdit && usesKepalaSelect;
  const anggotaCard = (
    <Card compact className={KRAMA_FORM_SHELL}>
      <div className="flex flex-col gap-2 mb-1.5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-copper-950">Anggota Keluarga</h3>
        <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:shrink-0">
          <Button
            type="button"
            variant={perluPengarepDulu ? "primary" : "secondary"}
            icon={UserPlus}
            className="h-9 sm:h-8 px-2.5 text-xs justify-center"
            onClick={openAddAnggota}
          >
            {perluPengarepDulu ? gelarLabel : "Anggota"}
          </Button>
        </div>
      </div>
      {perluPengarepDulu && (
        <p className="text-[11px] rounded px-2 py-1 mb-1.5 border leading-snug text-amber-900 bg-amber-50 border-amber-200">
          Isi data {gelarLabel} terlebih dahulu (tombol «{gelarLabel}»). Anggota
          pertama otomatis menjadi {gelarLabel}; data kartu di bawah dapat diisi setelahnya.
        </p>
      )}
      {anggotaNotice && (
        <p
          className={cn(
            "text-[11px] rounded px-2 py-1 mb-1.5 border leading-snug",
            anggotaNoticeWarning
              ? "text-amber-900 bg-amber-50 border-amber-200"
              : "text-green-800 bg-green-50 border-green-100"
          )}
        >
          {anggotaNotice}
        </p>
      )}
      <AnggotaKeluargaTable
        klasifikasi={klasifikasi}
        rows={tableRows}
        canEdit
        draftMode={!isEdit}
        kramaId={kramaId}
        onEdit={openEditAnggota}
        onDelete={handleDeleteAnggota}
        onSkpAnggota={
          isEdit && klasifikasi === "MIPIL" && statusKrama === "aktif" && krama
            ? (key) => setSkpAnggotaId(key)
            : undefined
        }
        onRefresh={isEdit ? loadKrama : undefined}
      />
    </Card>
  );

  return (
    <div className={cn("max-w-6xl space-y-2.5 leading-snug", isPhone ? "pb-[4.5rem]" : "pb-0")}>
      <div className="flex flex-col gap-2 border-b border-copper-200/90 pb-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-copper-950 sm:text-lg">{title}</h2>
          <p className="text-xs leading-snug text-muted sm:truncate">{cardTitle}</p>
        </div>
        <div className={cn("shrink-0 gap-1.5", isPhone ? "hidden" : "flex")}>
          <Button
            type="button"
            variant="secondary"
            icon={X}
            className="h-8 px-2.5 text-xs"
            onClick={() => navigate(basePath)}
          >
            Batal
          </Button>
          <Button type="button" icon={Check} className="h-8 px-2.5 text-xs" onClick={submit} disabled={loading}>
            {loading ? "Menyimpan..." : isEdit ? "Simpan perubahan" : "Simpan kartu"}
          </Button>
        </div>
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}

      {showPipilAnggotaPendingBanner && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
          {PIPIL_ANGGOTA_PENDING_NOTICE}
        </p>
      )}

      {anggotaDulu && anggotaCard}

      <Card
        compact
        className={cn("print:shadow-none", KRAMA_FORM_SHELL, perluPengarepDulu && "opacity-60")}
      >
        <div className="flex flex-col gap-1.5 rounded-md border border-copper-200/80 bg-gradient-to-r from-copper-50/90 to-transparent px-2.5 py-1.5 mb-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-copper-500 shrink-0">
              Kartu
            </span>
            <span className="text-sm font-semibold text-copper-900 truncate">{cardTitle}</span>
          </div>
          <span className="font-mono text-[11px] sm:text-xs text-copper-700 shrink-0">
            {nomorLabel}: {isEdit ? nomorKartu : "(otomatis)"}
          </span>
        </div>

        <fieldset
          disabled={perluPengarepDulu}
          title={perluPengarepDulu ? `Tambahkan ${gelarLabel} terlebih dahulu` : undefined}
          className="m-0 min-w-0 border-0 p-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-3 gap-y-2.5"
        >
          <FormSection title="Identitas & status" first />
          {usesKepalaSelect && (
            <div>
              <Label>Nama {gelarLabel}</Label>
              <Select
                value={kepalaAnggotaKey}
                onChange={(e) => void handleKepalaAnggotaChange(e.target.value)}
                required={tableRows.length > 0}
                disabled={!tableRows.length}
              >
                <option value="">
                  {tableRows.length ? "Pilih anggota" : "Tambahkan anggota terlebih dahulu"}
                </option>
                {tableRows.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.nama_lengkap}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {/* Readonly jenis hanya di md+ — di HP cukup Select di bawah (hindari duplikat) */}
          <FieldReadonly
            className="hidden md:block"
            label={isPipil ? "Jenis Krama Mipil" : isKramaTamiu ? "Jenis Krama Tamiu" : "Jenis Tamiu"}
            value={isEdit ? krama?.jenis_nama : jenisNama}
          />
          <FieldReadonly
            label={isPipil ? "Jenis kelamin (pengarep)" : "Jenis kelamin (pengajeg)"}
            value={kepalaDisplay?.jenis_kelamin}
          />
          {isTamiu && <FieldReadonly label="Agama" value={kepalaDisplay?.agama} />}
          {usesTanggalPencatatan ? (
            <div>
              <Label>Tanggal pencatatan</Label>
              <DateInput
                value={tanggalPencatatan}
                onChange={setTanggalPencatatan}
                required
                disabled={perluPengarepDulu}
                className="!min-h-10 !py-2 md:!min-h-8 md:!py-1.5"
              />
              <FormHint>
                {isPipil
                  ? "Masa berlaku Pipil, cetakan kartu, dan data anggota."
                  : `Masa berlaku & peringatan ${PEMASIH_PERINGATAN_HARI} hari sebelum habis.`}
              </FormHint>
            </div>
          ) : null}
          {isPipil && paturunan != null && (
            <FieldReadonly label="% Paturunan" value={`${paturunan}%`} />
          )}
          <FieldReadonly
            label={isPipil ? "Status Pipil" : "Status Pemasih"}
            value={statusIlikitaLabel}
          />
          {usesTanggalPencatatan &&
            ilikitaPerpanjanganRelevan &&
            hasMasaBerlakuTahun(masaBerlakuTahunPreview) && (
            <FieldReadonly label="Berlaku S/D (pratinjau)" value={berlakuSdPreview || "—"} />
          )}

          <FormSection title="Wilayah & kontak" />
          <div>
            <Label>Banjar</Label>
            <Select value={banjarId} onChange={(e) => setBanjarId(e.target.value)} required>
              <option value="">Pilih banjar</option>
              {banjar.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.kode} — {b.nama}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tempek</Label>
            <Select value={tempekId} onChange={(e) => setTempekId(e.target.value)} required>
              <option value="">Pilih tempek</option>
              {tempek.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama}
                </option>
              ))}
            </Select>
          </div>
          {isPipil && (
            <div>
              <Label>Arahan (opsional)</Label>
              <Select value={arahanId} onChange={(e) => setArahanId(e.target.value)}>
                <option value="">—</option>
                {arahan.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {isPipil && (
            <div>
              <Label>Jenis Krama Mipil</Label>
              <Select value={jenisMipilId} onChange={(e) => setJenisMipilId(e.target.value)} required>
                <option value="">Pilih jenis</option>
                {jenisMipil.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama} ({j.paturunan_persen}%)
                  </option>
                ))}
              </Select>
              {isEdit &&
                krama &&
                jenisMipilId === krama.jenis_krama_mipil_id &&
                isKramaNyada(krama.jenis_krama_mipil_id, desa) &&
                formatAlasanNyada(krama.alasan_nyada) && (
                  <FormHint>
                    Nyada: {formatAlasanNyada(krama.alasan_nyada)}
                    {krama.nyada_sejak ? ` · sejak ${formatTanggalLahir(krama.nyada_sejak)}` : ""}
                    {krama.keterangan_nyada ? ` · ${krama.keterangan_nyada}` : ""}
                  </FormHint>
                )}
              {isEdit && krama && jenisMipilId === krama.jenis_krama_mipil_id && kodeDapukanKrama && (
                <FormHint>
                  {kodeDapukanKrama === "balu_dapukan" ? "Balu Dapukan" : "Dapukan"}
                  {krama.nyada_sejak ? ` sejak ${formatTanggalLahir(krama.nyada_sejak)}` : ""}
                  {" · otomatis Nyada saat tidak ada lagi Anak belum kawin"}
                  {krama.dapukan_batas
                    ? ` atau paling lambat ${formatTanggalLahir(krama.dapukan_batas)}`
                    : ""}
                </FormHint>
              )}
            </div>
          )}
          {isKramaTamiu && (
            <div>
              <Label>Jenis Krama Tamiu</Label>
              <Select
                value={jenisKramaTamiuId}
                onChange={(e) => setJenisKramaTamiuId(e.target.value)}
                required
              >
                <option value="">Pilih jenis</option>
                {jenisKT.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {isTamiu && (
            <div>
              <Label>Jenis Tamiu</Label>
              <Select value={jenisTamiuId} onChange={(e) => setJenisTamiuId(e.target.value)} required>
                <option value="">Pilih jenis</option>
                {jenisT.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {isPemasih && (
            <div>
              <Label title="Pilih dari daftar pemasih di banjar atau ketik baru">RT/BTN</Label>
              <CreatableCombobox
                value={rtBtn}
                onChange={setRtBtn}
                options={rtBtnOptions}
                placeholder={banjarId ? "Pilih atau ketik RT/BTN" : "Pilih banjar dulu"}
                required
                disabled={!banjarId}
              />
            </div>
          )}
          <div className={cn(isPemasih ? "sm:col-span-2" : "lg:col-span-2")}>
            <Label>{isKramaTamiu ? "Alamat sekarang" : "Alamat"}</Label>
            <Input value={alamat} onChange={(e) => setAlamat(e.target.value)} required />
          </div>
          {isPipil && (
            <div>
              <Label>Keterangan</Label>
              <Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
            </div>
          )}
          {isPemasih && (
            <>
              <div>
                <Label>Desa asal</Label>
                <Input value={asalDesa} onChange={(e) => setAsalDesa(e.target.value)} required />
              </div>
              <div>
                <Label>Kecamatan asal</Label>
                <Input value={asalKec} onChange={(e) => setAsalKec(e.target.value)} required />
              </div>
              <div>
                <Label>Kabupaten asal</Label>
                <Input value={asalKab} onChange={(e) => setAsalKab(e.target.value)} required />
              </div>
              {isTamiu && (
                <div>
                  <Label>Provinsi asal</Label>
                  <Input value={asalProv} onChange={(e) => setAsalProv(e.target.value)} required />
                </div>
              )}
            </>
          )}
          <div>
            <Label>Nomor kontak</Label>
            <Input
              type="tel"
              inputMode="tel"
              value={nomorKontak}
              onChange={(e) => setNomorKontak(e.target.value.replace(/[^\d+\-\s]/g, ""))}
              placeholder="08xxxxxxxxxx"
            />
          </div>
          <div>
            <Label>Status aktif</Label>
            <Select
              value={statusKrama}
              onChange={(e) =>
                handleStatusAktifChange(e.target.value as "aktif" | "nonaktif")
              }
            >
              {KRAMA_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            {statusKrama === "nonaktif" && alasanTidakAktif && tanggalTidakAktif && (
              <FormHint>
                {formatAlasanTidakAktif(alasanTidakAktif)} · mulai{" "}
                {formatTanggalLahir(tanggalTidakAktif)}
                {" · "}
                <button
                  type="button"
                  className="underline hover:text-copper-900"
                  onClick={() => setNonaktifModalOpen(true)}
                >
                  Ubah
                </button>
              </FormHint>
            )}
          </div>
        </fieldset>

        {kramaNonaktifEfektif && (
          <p className="text-xs text-copper-800 bg-copper-50 border border-copper-200 rounded px-2.5 py-1 mt-2 leading-snug">
            Status aktif krama <strong>Nonaktif</strong> — Status Pipil dan Status Pemasih ikut{" "}
            <strong>Tidak Aktif</strong> (total). Tidak ada peringatan perpanjangan atau perpanjangan
            otomatis.
          </p>
        )}
        {isPemasih && ilikitaPerpanjanganRelevan && pemasihAkanHabisPreview && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1 mt-2 leading-snug">
            Masa berlaku Pemasih akan habis dalam {PEMASIH_PERINGATAN_HARI} hari.
            {pemasihAutoPerpanjangPreview
              ? " Jenis ini diperpanjang otomatis pada tanggal berlaku akhir."
              : " Perpanjangan tidak otomatis untuk jenis ini — gunakan menu detail setelah masa habis."}
          </p>
        )}
        {isPemasih &&
          isEdit &&
          krama &&
          ilikitaPerpanjanganRelevan &&
          statusIlikitaEfektif(klasifikasi, krama) === "tidak_aktif" && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded px-2.5 py-1 mt-2 leading-snug">
              Status Pemasih tidak aktif. Buka halaman detail kartu untuk melakukan perpanjangan.
            </p>
          )}
      </Card>

      {!anggotaDulu && anggotaCard}

      <AnggotaFormDialog
        key={
          dialogMode !== null ? `${dialogMode}:${editingKey ?? "new"}` : "anggota-closed"
        }
        open={dialogMode !== null}
        formSessionKey={
          dialogMode === null ? null : `${dialogMode}:${editingKey ?? "new"}`
        }
        klasifikasi={klasifikasi}
        title={
          tambahPengarepPertama
            ? `Tambah ${gelarLabel}`
            : dialogMode === "add"
              ? "Tambah Anggota"
              : "Edit Anggota"
        }
        pengarepBaru={tambahPengarepPertama}
        initial={getDialogInitial()}
        isKepalaMember={
          dialogMode === "edit" &&
          isEdit &&
          Boolean(
            krama &&
              editingKey &&
              krama.anggota_aktif.find((a) => a.anggota_id === editingKey)?.penduduk_id ===
                krama.kepala.id
          )
        }
        isPengarepForm={isPengarepForm}
        pengarepKetentuan={pengarepKetentuan}
        jenisMipil={jenisMipil}
        jenisMipilId={jenisMipilId}
        pipilFamilyMembers={pipilFamilyForDialog}
        onSave={
          dialogMode === "add"
            ? isEdit
              ? saveAnggotaAdd
              : saveAnggotaDraft
            : isEdit
              ? saveAnggotaEdit
              : saveAnggotaDraft
        }
        onCancel={() => {
          setDialogMode(null);
          setEditingKey(null);
        }}
      />

      <KramaNonaktifDialog
        open={nonaktifModalOpen}
        initial={{
          alasanTidakAktif,
          tanggalTidakAktif,
          keteranganTidakAktif,
        }}
        onConfirm={confirmNonaktif}
        onCancel={() => setNonaktifModalOpen(false)}
      />

      <PengarepMeninggalDialog
        open={meninggalPending !== null}
        pengarepNama={krama?.kepala.nama_lengkap ?? ""}
        tanggalMeninggal={meninggalPending?.tanggalTidakAktif ?? ""}
        candidates={penggantiPengarepCandidates}
        isNyada={isKramaNyada(krama?.jenis_krama_mipil_id, desa)}
        alasanNyada={krama?.alasan_nyada}
        batasUmurNyada={parseBatasUmurNyada(desa?.jenis_umur_nyada)}
        jenisTanpaNyadaNama={
          jenisMipil.find((j) => j.id === resolveJenisSetelahLepasNyada(krama, desa))?.nama
        }
        catatan={catatanDapukanMeninggal}
        busy={meninggalBusy}
        error={meninggalError}
        onGanti={(v) => void handleGantiPengarepMeninggal(v)}
        onNonaktifkan={() => {
          if (meninggalPending) applyNonaktif(meninggalPending);
          setMeninggalPending(null);
        }}
        onCancel={() => setMeninggalPending(null)}
      />

      <KramaNyadaSuggestionDialog
        open={nyadaDialogOpen}
        suggestion={nyadaSuggestion}
        onApplyJenis={() => resolveNyadaChoice("apply")}
        onSaveWithoutChange={() => resolveNyadaChoice("skip")}
        onCancel={() => resolveNyadaChoice("cancel")}
      />

      <NyadaManualDialog
        open={nyadaManualOpen}
        jenisNyadaNama={jenisMipil.find((j) => j.id === jenisMipilId)?.nama ?? "Nyada"}
        umurPengarep={hitungUmur(
          resolvePengarepTanggalLahir({ isEdit, klasifikasi, krama, kepalaFromDraft })
        )}
        batasUmurNyada={parseBatasUmurNyada(desa?.jenis_umur_nyada)}
        onConfirm={(v) => resolveNyadaManual(v)}
        onCancel={() => resolveNyadaManual(null)}
      />

      {isEdit && krama && skpAnggotaId && (
        <KeluarPipilIntraDesaDialog
          open={Boolean(skpAnggotaId)}
          onClose={() => setSkpAnggotaId(null)}
          krama={krama}
          anggotaId={skpAnggotaId}
          onDone={() => void loadKrama()}
        />
      )}

      <ConfirmDialog
        open={deleteAnggotaTarget !== null}
        title="Hapus anggota keluarga?"
        message={deleteAnggotaMessage}
        error={deleteAnggotaError}
        busy={deleteAnggotaBusy}
        onConfirm={() => void confirmDeleteAnggota()}
        onCancel={() => {
          if (deleteAnggotaBusy) return;
          setDeleteAnggotaTarget(null);
          setDeleteAnggotaError("");
        }}
      />

      {/* Aksi simpan di atas PhoneBottomDock (3.75rem + safe-area) */}
      {isPhone ? (
      <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 border-t border-copper-200 bg-card/95 px-3 py-2.5 shadow-[0_-6px_20px_rgba(61,35,16,0.12)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={X}
            className="h-11 flex-1 text-xs"
            onClick={() => navigate(basePath)}
          >
            Batal
          </Button>
          <Button
            type="button"
            icon={Check}
            className="h-11 flex-[1.4] text-xs"
            onClick={submit}
            disabled={loading}
          >
            {loading ? "Menyimpan..." : isEdit ? "Simpan" : "Simpan kartu"}
          </Button>
        </div>
      </div>
      ) : null}
    </div>
  );
}
