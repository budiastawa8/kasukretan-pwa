import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPembayaranDudukanMulti,
  deletePembayaranDudukan,
  listRiwayatDudukanKrama,
  updatePembayaranDudukan,
} from "../../lib/services/dudukan-pembayaran";
import {
  createKeringananDudukanMulti,
  deleteKeringananDudukan,
  listKeringananDudukanKrama,
  updateKeringananDudukan,
} from "../../lib/services/dudukan-keringanan";
import {
  getKramaDudukanDetail,
  getTunggakanDudukanKrama,
  type DudukanKramaDetail,
  type DudukanTunggakanBulan,
} from "../../lib/services/dudukan";
import {
  listAkunForPembayaranDudukan,
  getDefaultAkunDudukanId,
  akunPembayaranOptionLabel,
} from "../../lib/services/akun-keuangan";
import { normalizeTanggalIsoForInput } from "../../lib/date-iso";
import {
  formatBulanIndonesia,
  formatBulanIndonesiaSingkat,
  formatPeriodeDudukanMmYyyy,
  formatRupiah,
} from "../../lib/dudukan-hitung";
import type { DudukanKeringananRow, DudukanPembayaranRow } from "../../lib/types";
import { cn, formatTanggalLahir, today } from "../../lib/utils";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { RupiahInput } from "../ui/RupiahInput";
import type { RupiahInputValue } from "../../lib/rupiah-input";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  completePembayaranBaruSave,
  PembayaranDialogTabs,
  PetugasLapanganSetorNote,
  SetorLangsungField,
  StatMini,
  StatusSetorBadge,
  usePembayaranAkunDanPetugas,
  useSetorLangsung,
  ZoneHeading,
} from "../pembayaran/pembayaran-dialog-shared";
import {
  DUDUKAN_BAYAR_DIALOG,
  DUDUKAN_DIALOG_ZONE_RIWAYAT,
} from "./dudukan-compact";
import { DudukanStatusBadge } from "./DudukanStatusBadge";
import { Check, Pencil, Trash2, X } from "lucide-react";

type BulanPilih = DudukanTunggakanBulan & {
  dipilih: boolean;
  jumlahInput: RupiahInputValue;
};

function periodeId(tahun: number, bulan: number) {
  return `${tahun}-${bulan}`;
}

function bisaKeringanan(b: DudukanTunggakanBulan) {
  return b.sisa > 0 && !b.keringanan_id && !b.di_muka;
}

export function DudukanPembayaranDialog({
  open,
  onClose,
  onSuccess,
  onSaved,
  canEdit,
  canDeleteFinancial = false,
  kramaId,
  initialTab = "bayar",
  initialEditingPaymentId = null,
  initialKeringananPeriode = null,
  lockedPetugasId,
  onPembayaranBaru,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSaved?: (message: string) => void;
  onPembayaranBaru?: (info: {
    items: { tahun: number; bulan: number; jumlah: number }[];
    tanggal: string;
  }) => void;
  canEdit: boolean;
  canDeleteFinancial?: boolean;
  kramaId: string;
  initialTab?: "bayar" | "riwayat";
  initialEditingPaymentId?: string | null;
  initialKeringananPeriode?: { tahun: number; bulan: number } | null;
  /** Mode petugas lapangan: petugas terkunci, selalu belum disetor, tanpa ubah/keringanan. */
  lockedPetugasId?: string;
}) {
  const isPhone = useIsPhoneClient();
  const petugasLapangan = Boolean(lockedPetugasId);
  const canKelola = canEdit && !petugasLapangan;
  const bisaHapus = (p: DudukanPembayaranRow) =>
    petugasLapangan
      ? p.petugas_id === lockedPetugasId && !p.tanggal_setor && !p.setoran_id
      : canDeleteFinancial;
  const [detail, setDetail] = useState<DudukanKramaDetail | null>(null);
  const [bulanList, setBulanList] = useState<BulanPilih[]>([]);
  const [riwayat, setRiwayat] = useState<DudukanPembayaranRow[]>([]);
  const [riwayatKeringanan, setRiwayatKeringanan] = useState<DudukanKeringananRow[]>([]);
  const {
    petugasList,
    akunList,
    akunLabelCtx,
    petugasId,
    setPetugasId,
    akunKeuanganId,
    setAkunKeuanganId,
  } = usePembayaranAkunDanPetugas({
    open,
    banjarId: detail?.banjar_id ?? "",
    listAkunTransaksional: listAkunForPembayaranDudukan,
    getDefaultAkunId: getDefaultAkunDudukanId,
    lockedPetugasId,
  });
  const [tanggal, setTanggal] = useState(today());
  const [keterangan, setKeterangan] = useState("");
  const [disetorLangsung, setDisetorLangsung] = useSetorLangsung();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJumlah, setEditJumlah] = useState<RupiahInputValue>("");
  const [editTanggal, setEditTanggal] = useState("");
  const [editPetugasId, setEditPetugasId] = useState("");
  const [editAkunKeuanganId, setEditAkunKeuanganId] = useState("");
  const [editKeterangan, setEditKeterangan] = useState("");

  const [editingKeringananId, setEditingKeringananId] = useState<string | null>(null);
  const [editKerJumlah, setEditKerJumlah] = useState<RupiahInputValue>("");
  const [editKerTanggal, setEditKerTanggal] = useState("");
  const [editKerPetugasId, setEditKerPetugasId] = useState("");
  const [editKerKeterangan, setEditKerKeterangan] = useState("");

  const [keringananMode, setKeringananMode] = useState(false);
  const [kerTanggal, setKerTanggal] = useState(today());
  const [kerPetugasId, setKerPetugasId] = useState("");
  const [kerKeterangan, setKerKeterangan] = useState("");
  const [tab, setTab] = useState<"bayar" | "riwayat">("bayar");
  const [tampilkanLunas, setTampilkanLunas] = useState(false);
  /** Mobile: pilih periode dulu, baru isi meta + simpan. */
  const [mobileBayarStep, setMobileBayarStep] = useState<"pilih" | "meta">("pilih");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteKeringananId, setDeleteKeringananId] = useState<string | null>(null);
  const [deleteKeringananBusy, setDeleteKeringananBusy] = useState(false);
  const [showKeterangan, setShowKeterangan] = useState(false);

  const bulanDenganSisa = useMemo(
    () => bulanList.filter((b) => b.sisa > 0),
    [bulanList]
  );
  const tunggakanBulan = useMemo(
    () => bulanList.filter((b) => b.sisa > 0 && !b.di_muka),
    [bulanList]
  );
  const totalSisa = useMemo(
    () => tunggakanBulan.reduce((sum, b) => sum + b.sisa, 0),
    [tunggakanBulan]
  );
  const totalBayar = useMemo(() => {
    return bulanList
      .filter((b) => b.dipilih)
      .reduce((sum, b) => {
        const n = b.jumlahInput === "" ? 0 : b.jumlahInput;
        return sum + (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
      }, 0);
  }, [bulanList]);
  const bulanDipilih = useMemo(
    () => bulanList.filter((b) => b.dipilih && b.sisa > 0),
    [bulanList]
  );
  const jumlahDipilih = bulanDipilih.length;
  const bulanBisaKeringanan = useMemo(
    () => bulanList.filter(bisaKeringanan),
    [bulanList]
  );
  const bulanKeringananDipilih = useMemo(
    () => bulanBisaKeringanan.filter((b) => b.dipilih),
    [bulanBisaKeringanan]
  );
  const totalKeringanan = useMemo(() => {
    return bulanKeringananDipilih.reduce((sum, b) => {
      const n = b.jumlahInput === "" ? 0 : b.jumlahInput;
      return sum + (Number.isFinite(n) && n > 0 ? Math.round(n) : 0);
    }, 0);
  }, [bulanKeringananDipilih]);
  const bulanLunas = useMemo(
    () => bulanList.length - bulanDenganSisa.length,
    [bulanList.length, bulanDenganSisa.length]
  );
  const bulanTabel = useMemo(
    () => (tampilkanLunas ? bulanList : bulanList.filter((b) => b.sisa > 0)),
    [bulanList, tampilkanLunas]
  );
  const jumlahRiwayat = riwayat.length + riwayatKeringanan.length;

  const loadData = useCallback(async () => {
    if (!open || !kramaId) return;
    setError("");
    try {
      const [d, tunggakan, rw, rk] = await Promise.all([
        getKramaDudukanDetail(kramaId),
        getTunggakanDudukanKrama(kramaId),
        listRiwayatDudukanKrama(kramaId),
        listKeringananDudukanKrama(kramaId),
      ]);
      setDetail(d);
      setBulanList(
        tunggakan.map((b) => ({
          ...b,
          dipilih: false,
          jumlahInput: "",
        }))
      );
      setRiwayat(rw);
      setRiwayatKeringanan(rk);
    } catch (err) {
      setError(String(err));
    }
  }, [open, kramaId]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setTampilkanLunas(false);
      setTanggal(today());
      setPetugasId("");
      setAkunKeuanganId("");
      setKeterangan("");
      setShowKeterangan(false);
      setError("");
      setEditingId(null);
      setEditingKeringananId(null);
      setKeringananMode(false);
      setMobileBayarStep("pilih");
      setBulanList([]);
      void loadData();
    }
  }, [open, loadData, initialTab]);

  const appliedEditIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      appliedEditIdRef.current = null;
      return;
    }
    if (!initialEditingPaymentId || !canEdit) return;
    if (appliedEditIdRef.current === initialEditingPaymentId) return;
    const row = riwayat.find((p) => p.id === initialEditingPaymentId);
    if (!row) return;
    appliedEditIdRef.current = initialEditingPaymentId;
    setTab("riwayat");
    mulaiEdit(row);
  }, [open, initialEditingPaymentId, canEdit, riwayat]);

  const appliedKeringananPeriodeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      appliedKeringananPeriodeRef.current = null;
      return;
    }
    if (!initialKeringananPeriode || !canEdit) return;
    const key = `${initialKeringananPeriode.tahun}-${initialKeringananPeriode.bulan}`;
    if (appliedKeringananPeriodeRef.current === key) return;
    const b = bulanList.find(
      (x) =>
        x.tahun === initialKeringananPeriode.tahun &&
        x.bulan === initialKeringananPeriode.bulan
    );
    if (!b || !bisaKeringanan(b)) return;
    appliedKeringananPeriodeRef.current = key;
    setTab("bayar");
    bukaKeringanan(b);
  }, [open, initialKeringananPeriode, canEdit, bulanList]);

  useEffect(() => {
    if (!open || kerPetugasId || petugasList.length !== 1) return;
    setKerPetugasId(petugasList[0]!.id);
  }, [open, kerPetugasId, petugasList]);

  useEffect(() => {
    if (isPhone && mobileBayarStep === "meta" && jumlahDipilih === 0) {
      setMobileBayarStep("pilih");
    }
  }, [isPhone, mobileBayarStep, jumlahDipilih]);

  function bukaKeringanan(b?: DudukanTunggakanBulan) {
    if (b && !bisaKeringanan(b)) return;
    const focusId = b ? periodeId(b.tahun, b.bulan) : null;
    setBulanList((prev) => {
      return prev.map((item) => {
        const eligible = bisaKeringanan(item);
        const isFocus = focusId != null && periodeId(item.tahun, item.bulan) === focusId;
        const checked = eligible && (isFocus || item.dipilih);
        return {
          ...item,
          dipilih: Boolean(checked),
          jumlahInput: checked
            ? item.jumlahInput !== ""
              ? item.jumlahInput
              : item.sisa
            : "",
        };
      });
    });
    setTab("bayar");
    setKeringananMode(true);
    setKerTanggal(today());
    setKerKeterangan("");
    setError("");
  }

  function batalKeringanan() {
    setKeringananMode(false);
    setBulanList((prev) =>
      prev.map((item) => ({ ...item, dipilih: false, jumlahInput: "" }))
    );
  }

  async function handleSimpanKeringanan() {
    if (!canEdit || !keringananMode) return;
    if (!kerPetugasId) {
      setError("Petugas wajib dipilih");
      return;
    }
    if (!kerKeterangan.trim()) {
      setError("Alasan keringanan wajib diisi");
      return;
    }
    const items = bulanKeringananDipilih
      .map((b) => ({
        tahun: b.tahun,
        bulan: b.bulan,
        jumlah: b.jumlahInput === "" ? 0 : b.jumlahInput,
      }))
      .filter((b) => Number.isFinite(b.jumlah) && b.jumlah > 0);
    if (!items.length) {
      setError("Centang minimal satu bulan dan isi jumlah keringanan");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createKeringananDudukanMulti({
        kramaId,
        tanggal: kerTanggal,
        petugasId: kerPetugasId,
        keterangan: kerKeterangan,
        items,
      });
      setKeringananMode(false);
      await loadData();
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function mulaiEditKeringanan(k: DudukanKeringananRow) {
    batalEdit();
    setEditingKeringananId(k.id);
    setEditKerJumlah(Math.round(Number(k.jumlah) || 0));
    setEditKerTanggal(normalizeTanggalIsoForInput(k.tanggal));
    setEditKerPetugasId(k.petugas_id ?? "");
    setEditKerKeterangan(k.keterangan ?? "");
    setError("");
  }

  function batalEditKeringanan() {
    setEditingKeringananId(null);
  }

  async function handleSimpanEditKeringanan(
    e: React.FormEvent,
    k: DudukanKeringananRow
  ) {
    e.preventDefault();
    if (!canEdit) return;
    if (!editKerPetugasId) {
      setError("Petugas wajib dipilih");
      return;
    }
    if (!editKerKeterangan.trim()) {
      setError("Alasan keringanan wajib diisi");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await updateKeringananDudukan(k.id, {
        kramaId,
        tahun: k.tahun,
        bulan: k.bulan,
        jumlah: editKerJumlah === "" ? 0 : editKerJumlah,
        tanggal: editKerTanggal,
        petugasId: editKerPetugasId,
        keterangan: editKerKeterangan,
      });
      batalEditKeringanan();
      await loadData();
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function requestHapusKeringanan(id: string) {
    if (!canDeleteFinancial) return;
    setDeleteKeringananId(id);
  }

  async function confirmHapusKeringanan() {
    if (!deleteKeringananId || !canDeleteFinancial) return;
    setDeleteKeringananBusy(true);
    setError("");
    try {
      if (editingKeringananId === deleteKeringananId) batalEditKeringanan();
      await deleteKeringananDudukan(deleteKeringananId);
      setDeleteKeringananId(null);
      await loadData();
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleteKeringananBusy(false);
    }
  }

  function toggleBulan(id: string, checked: boolean) {
    setBulanList((prev) =>
      prev.map((b) => {
        if (periodeId(b.tahun, b.bulan) !== id) return b;
        if (keringananMode ? !bisaKeringanan(b) : b.sisa <= 0) return b;
        return {
          ...b,
          dipilih: checked,
          jumlahInput: checked ? (b.jumlahInput !== "" ? b.jumlahInput : b.sisa) : "",
        };
      })
    );
  }

  function setJumlahBulan(id: string, value: RupiahInputValue) {
    setBulanList((prev) =>
      prev.map((b) =>
        periodeId(b.tahun, b.bulan) === id ? { ...b, jumlahInput: value } : b
      )
    );
  }

  function isiSisaBulan(id: string) {
    setBulanList((prev) =>
      prev.map((b) => {
        if (periodeId(b.tahun, b.bulan) !== id || b.sisa <= 0) return b;
        return { ...b, dipilih: true, jumlahInput: b.sisa };
      })
    );
  }

  /** Bayar semua tunggakan saja — bulan di muka (belum kewajiban) tidak ikut. */
  function isiSemuaSisa() {
    const adaTunggakan = tunggakanBulan.length > 0;
    setBulanList((prev) =>
      prev.map((b) => {
        const tunggakan = b.sisa > 0 && !b.di_muka;
        return tunggakan
          ? { ...b, dipilih: true, jumlahInput: b.sisa }
          : { ...b, dipilih: false, jumlahInput: "" };
      })
    );
    if (isPhone && adaTunggakan) setMobileBayarStep("meta");
  }

  function kosongkanPilihan() {
    setBulanList((prev) =>
      prev.map((b) => ({ ...b, dipilih: false, jumlahInput: "" }))
    );
    if (isPhone) setMobileBayarStep("pilih");
  }

  /** Pilih N bulan tunggakan terlama (urutan list = kronologis; di muka dikecualikan). */
  function pilihNBulanTerlama(n: number) {
    setBulanList((prev) => {
      const eligible = prev.filter((b) => b.sisa > 0 && !b.di_muka);
      const pick = new Set(
        eligible.slice(0, Math.max(0, n)).map((b) => periodeId(b.tahun, b.bulan))
      );
      return prev.map((b) => {
        const dipilih = pick.has(periodeId(b.tahun, b.bulan));
        return {
          ...b,
          dipilih,
          jumlahInput: dipilih ? b.sisa : "",
        };
      });
    });
  }

  function pilihSemuaKeringanan() {
    setBulanList((prev) =>
      prev.map((b) =>
        bisaKeringanan(b)
          ? { ...b, dipilih: true, jumlahInput: b.jumlahInput !== "" ? b.jumlahInput : b.sisa }
          : { ...b, dipilih: false, jumlahInput: "" }
      )
    );
  }

  function mulaiEdit(p: DudukanPembayaranRow) {
    batalEditKeringanan();
    setEditingId(p.id);
    setEditJumlah(Math.round(Number(p.jumlah) || 0));
    setEditTanggal(normalizeTanggalIsoForInput(p.tanggal));
    setEditPetugasId(p.petugas_id ?? "");
    setEditAkunKeuanganId(p.akun_keuangan_id ?? akunKeuanganId);
    setEditKeterangan(p.keterangan ?? "");
    setError("");
  }

  function batalEdit() {
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    if (!petugasId) {
      setError("Petugas wajib dipilih");
      return;
    }
    if (!akunKeuanganId) {
      setError("Akun penerimaan wajib dipilih");
      return;
    }

    const items = bulanList
      .filter((b) => b.dipilih && b.sisa > 0)
      .map((b) => ({
        tahun: b.tahun,
        bulan: b.bulan,
        jumlah: b.jumlahInput === "" ? 0 : b.jumlahInput,
      }))
      .filter((b) => Number.isFinite(b.jumlah) && b.jumlah > 0);

    if (!items.length) {
      setError("Pilih minimal satu bulan dan isi jumlah pembayaran");
      return;
    }

    setError("");
    setLoading(true);
    try {
      await createPembayaranDudukanMulti({
        kramaId,
        tanggal,
        petugasId,
        akunKeuanganId,
        keterangan: keterangan || undefined,
        items,
        disetorLangsung: petugasLapangan ? false : disetorLangsung,
      });
      onPembayaranBaru?.({ items, tanggal });
      setKeterangan("");
      completePembayaranBaruSave("Pembayaran dudukan berhasil disimpan.", {
        onSuccess,
        onClose,
        onSaved,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSimpanEdit(e: React.FormEvent, p: DudukanPembayaranRow) {
    e.preventDefault();
    if (!canEdit) return;
    if (!editPetugasId) {
      setError("Petugas wajib dipilih");
      return;
    }
    if (!editAkunKeuanganId) {
      setError("Akun penerimaan wajib dipilih");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await updatePembayaranDudukan(p.id, {
        kramaId,
        tahun: p.tahun,
        bulan: p.bulan,
        jumlah: editJumlah === "" ? 0 : editJumlah,
        tanggal: editTanggal,
        petugasId: editPetugasId,
        akunKeuanganId: editAkunKeuanganId,
        keterangan: editKeterangan || undefined,
      });
      batalEdit();
      await loadData();
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function requestHapus(p: DudukanPembayaranRow) {
    if (!bisaHapus(p)) return;
    setDeleteId(p.id);
  }

  async function confirmHapus() {
    if (!deleteId) return;
    setDeleteBusy(true);
    setError("");
    try {
      if (editingId === deleteId) batalEdit();
      await deletePembayaranDudukan(deleteId);
      setDeleteId(null);
      await loadData();
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  const petugasOptions = (
    <>
      <option value="">Pilih petugas</option>
      {petugasList.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nama} ({p.jabatan})
        </option>
      ))}
    </>
  );

  const akunOptions = (
    <>
      <option value="">Pilih akun</option>
      {akunList.map((a) => (
        <option key={a.id} value={a.id}>
          {akunPembayaranOptionLabel(a, akunLabelCtx)}
        </option>
      ))}
    </>
  );

  return (
    <>
    <Modal
      open={open}
      title="Pembayaran Dudukan"
      onClose={onClose}
      className={cn(
        "max-w-2xl [&>div:first-child]:py-2 [&_h3]:text-sm [&>div:last-child]:flex [&>div:last-child]:flex-col [&>div:last-child]:overflow-hidden [&>div:last-child]:min-h-0 [&>div:last-child]:p-2",
        isPhone
          ? "[&>div:last-child]:max-h-[min(94vh,900px)]"
          : "[&>div:last-child]:max-h-[min(88vh,720px)]"
      )}
    >
      <div className={cn(DUDUKAN_BAYAR_DIALOG, "flex flex-col min-h-0 flex-1 gap-1 overflow-hidden")}>
        {detail && (
          <div className="rounded border border-copper-200 bg-copper-50/50 px-2 py-1 shrink-0">
            <p className="text-base font-semibold text-copper-950 leading-tight">
              {detail.kepala_nama}
              <span className="font-mono text-xs font-normal text-copper-600 ml-1.5">
                {detail.nomor_kartu}
              </span>
            </p>
            <p className="text-xs text-muted truncate leading-tight">
              {detail.jenis_nama} · {detail.banjar_nama} · {formatRupiah(detail.tarif_bulanan)}/bln
            </p>
          </div>
        )}

        <div className="shrink-0">
          <PembayaranDialogTabs tab={tab} onTabChange={setTab} riwayatCount={jumlahRiwayat} />
        </div>

        {tab === "bayar" && (
          <section className="flex flex-col min-h-0 flex-1 gap-1 overflow-hidden" aria-label="Bayar dudukan">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 shrink-0 text-sm">
              <StatMini
                label="Tunggakan"
                value={tunggakanBulan.length > 0 ? `${tunggakanBulan.length} bln` : "—"}
              />
              <StatMini
                label="Sisa"
                value={totalSisa > 0 ? formatRupiah(totalSisa) : "—"}
                className={totalSisa > 0 ? "text-amber-900" : "text-copper-800"}
              />
              {!keringananMode && totalBayar > 0 && (
                <StatMini
                  label="Akan dibayar"
                  value={formatRupiah(totalBayar)}
                  className="text-copper-900"
                />
              )}
              {keringananMode && totalKeringanan > 0 && (
                <StatMini
                  label="Keringanan"
                  value={formatRupiah(totalKeringanan)}
                  className="text-violet-900"
                />
              )}
            </div>

        {canKelola && keringananMode && (
          <div className="flex flex-col min-h-0 flex-1 overflow-hidden rounded border border-violet-200 bg-violet-50/60">
            <p className="shrink-0 font-medium text-violet-950 text-sm leading-tight px-1.5 pt-1.5 pb-1">
              Keringanan — centang bulan yang diberi keringanan
              <span className="text-muted font-normal ml-1">
                ({bulanKeringananDipilih.length} bulan)
              </span>
            </p>
            <div className="min-h-0 flex-1 overflow-hidden mx-1.5 mb-1 rounded border border-violet-200 bg-white/90 flex flex-col">
              <div className="grid grid-cols-[1.5rem_minmax(7rem,2fr)_minmax(7rem,1.6fr)_minmax(8rem,2fr)_minmax(5rem,1fr)] gap-x-2 items-center shrink-0 border-b border-violet-100 px-1.5 py-1 bg-violet-50/80 text-[11px] font-medium text-muted">
                <span />
                <span className="text-[13px]">Periode</span>
                <span className="text-right text-[13px]">Sisa</span>
                <span className="flex flex-col leading-none items-start">
                  <span className="text-[11px]">Jumlah</span>
                  <button
                    type="button"
                    className="text-[9px] font-normal text-violet-800 hover:underline text-left"
                    onClick={pilihSemuaKeringanan}
                  >
                    pilih semua
                  </button>
                </span>
                <span />
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-violet-100">
                {bulanBisaKeringanan.length === 0 ? (
                  <li className="px-1.5 py-2 text-xs text-muted">
                    Tidak ada bulan yang bisa diberi keringanan.
                  </li>
                ) : (
                  bulanBisaKeringanan.map((b) => {
                    const id = periodeId(b.tahun, b.bulan);
                    return (
                      <li
                        key={id}
                        className="grid grid-cols-[1.5rem_minmax(7rem,2fr)_minmax(7rem,1.6fr)_minmax(8rem,2fr)_minmax(5rem,1fr)] gap-x-2 items-center px-1.5 py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={b.dipilih}
                          onChange={(e) => toggleBulan(id, e.target.checked)}
                          className="h-3.5 w-3.5 shrink-0"
                          aria-label={`Pilih keringanan ${formatBulanIndonesiaSingkat(b.bulan, b.tahun)}`}
                        />
                        <span className="text-[13px] font-medium tabular-nums whitespace-nowrap">
                          {formatBulanIndonesiaSingkat(b.bulan, b.tahun)}
                        </span>
                        <span className="text-[14px] font-semibold text-muted tabular-nums text-right truncate">
                          {formatRupiah(b.sisa)}
                        </span>
                        <RupiahInput
                          value={b.jumlahInput}
                          onChange={(v) => setJumlahBulan(id, v)}
                          disabled={!b.dipilih}
                          showPrefix={false}
                          className="h-7 text-xs w-full min-w-0 px-1 rounded-md"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 text-[11px] font-semibold px-1 min-w-0 justify-center"
                          onClick={() => isiSisaBulan(id)}
                          title={`Isi penuh ${formatRupiah(b.sisa)}`}
                        >
                          Penuh
                        </Button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
            <div className="shrink-0 space-y-1 border-t border-violet-200 bg-violet-50 px-1.5 py-1.5">
              <div className="grid gap-1 sm:grid-cols-2">
                <div>
                  <Label>Tanggal keputusan</Label>
                  <DateInput value={kerTanggal} onChange={setKerTanggal} />
                </div>
                <div>
                  <Label>Petugas</Label>
                  <Select
                    value={kerPetugasId}
                    onChange={(e) => setKerPetugasId(e.target.value)}
                    disabled={petugasList.length === 0}
                  >
                    {petugasOptions}
                  </Select>
                </div>
              </div>
              <Input
                placeholder="Alasan keringanan (wajib, berlaku untuk semua bulan tercentang)"
                value={kerKeterangan}
                onChange={(e) => setKerKeterangan(e.target.value)}
              />
              <div className="flex gap-1">
                <Button
                  type="button"
                  disabled={loading || petugasList.length === 0 || totalKeringanan <= 0}
                  className="h-9 text-sm flex-1"
                  onClick={() => void handleSimpanKeringanan()}
                >
                  {loading
                    ? "Menyimpan…"
                    : `Simpan keringanan (${bulanKeringananDipilih.length} bln · ${formatRupiah(totalKeringanan)})`}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 text-sm"
                  onClick={batalKeringanan}
                  disabled={loading}
                >
                  Batal
                </Button>
              </div>
            </div>
          </div>
        )}

        {canEdit && !keringananMode && bulanDenganSisa.length > 0 && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-1 min-h-0 flex-1 overflow-hidden">
            {/* Toolbar pilih cepat */}
            {(!isPhone || mobileBayarStep === "pilih") && (
              <div className="shrink-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {tunggakanBulan.length > 0 && (
                    <Button
                      type="button"
                      className={cn("text-xs font-semibold", isPhone ? "h-10 flex-1" : "h-8")}
                      onClick={isiSemuaSisa}
                      title="Hanya tunggakan — bulan di muka tidak ikut"
                    >
                      Bayar semua tunggakan
                      {` (${tunggakanBulan.length} bln · ${formatRupiah(totalSisa)})`}
                    </Button>
                  )}
                  {jumlahDipilih > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      className={cn("text-xs", isPhone ? "h-10" : "h-8")}
                      onClick={kosongkanPilihan}
                    >
                      Kosongkan
                    </Button>
                  )}
                  {canKelola && bulanBisaKeringanan.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        "text-xs text-violet-900",
                        isPhone ? "h-10" : "h-8"
                      )}
                      onClick={() => bukaKeringanan()}
                    >
                      Keringanan…
                    </Button>
                  )}
                </div>
                {tunggakanBulan.length > 3 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-muted mr-0.5">Cepat:</span>
                    {[3, 6]
                      .filter((n) => n < tunggakanBulan.length)
                      .map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="rounded-md border border-copper-200 bg-white px-2 py-1 text-[11px] font-medium text-copper-900 active:bg-copper-100"
                          onClick={() => pilihNBulanTerlama(n)}
                        >
                          {n} bln terlama
                        </button>
                      ))}
                    {bulanLunas > 0 && (
                      <button
                        type="button"
                        className="ml-auto text-[11px] text-copper-800 hover:underline"
                        onClick={() => setTampilkanLunas((v) => !v)}
                      >
                        {tampilkanLunas ? "Sembunyikan lunas" : `+${bulanLunas} lunas`}
                      </button>
                    )}
                  </div>
                )}
                {tunggakanBulan.length <= 3 && bulanLunas > 0 && (
                  <button
                    type="button"
                    className="text-[11px] text-copper-800 hover:underline"
                    onClick={() => setTampilkanLunas((v) => !v)}
                  >
                    {tampilkanLunas ? "Sembunyikan lunas" : `Tampilkan ${bulanLunas} lunas`}
                  </button>
                )}
              </div>
            )}

            {/* Daftar periode — mobile list atau desktop grid */}
            {(!isPhone || mobileBayarStep === "pilih") && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-copper-200 bg-white/80">
                {isPhone ? (
                  <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-copper-100">
                    {bulanTabel.map((b) => {
                      const id = periodeId(b.tahun, b.bulan);
                      const bisaBayar = b.sisa > 0;
                      return (
                        <li
                          key={id}
                          className={cn(
                            "px-2 py-2.5",
                            b.di_muka && bisaBayar && "bg-green-50/60",
                            b.telat && bisaBayar && "bg-amber-50/60",
                            !bisaBayar && "text-muted bg-copper-50/30",
                            b.dipilih && bisaBayar && "bg-copper-100/70"
                          )}
                        >
                          <div
                            role={bisaBayar ? "button" : undefined}
                            tabIndex={bisaBayar ? 0 : undefined}
                            onClick={() => {
                              if (bisaBayar) toggleBulan(id, !b.dipilih);
                            }}
                            onKeyDown={(e) => {
                              if (!bisaBayar) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleBulan(id, !b.dipilih);
                              }
                            }}
                            className={cn(
                              "flex items-center gap-3 min-h-[44px]",
                              bisaBayar && "cursor-pointer"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={b.dipilih && bisaBayar}
                              disabled={!bisaBayar}
                              onChange={(e) => toggleBulan(id, e.target.checked)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-5 w-5 shrink-0"
                              aria-label={`Pilih ${formatBulanIndonesiaSingkat(b.bulan, b.tahun)}`}
                            />
                            <div className="min-w-0 flex-1 leading-tight">
                              <span className="text-sm font-semibold tabular-nums text-copper-950">
                                {formatBulanIndonesiaSingkat(b.bulan, b.tahun)}
                              </span>
                              {b.di_muka && bisaBayar && (
                                <span className="ml-1 text-[10px] text-green-800">muka</span>
                              )}
                              {b.telat && bisaBayar && (
                                <span className="ml-1 text-[10px] text-amber-900">telat</span>
                              )}
                              {!bisaBayar && (
                                <div className="mt-0.5">
                                  <DudukanStatusBadge
                                    tagihan={b.tagihan}
                                    dibayar={b.dibayar}
                                    keringanan={b.keringanan}
                                  />
                                </div>
                              )}
                            </div>
                            {bisaBayar && !b.dipilih && (
                              <span className="shrink-0 text-sm font-semibold text-amber-900 tabular-nums">
                                {formatRupiah(b.sisa)}
                              </span>
                            )}
                          </div>
                          {bisaBayar && b.dipilih && (
                            <div
                              className="mt-2 flex items-center gap-2 pl-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <RupiahInput
                                value={b.jumlahInput}
                                onChange={(v) => setJumlahBulan(id, v)}
                                showPrefix={false}
                                className="h-10 text-sm flex-1 min-w-0 px-2 rounded-md"
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-10 text-xs font-semibold shrink-0"
                                onClick={() => isiSisaBulan(id)}
                              >
                                Penuh
                              </Button>
                              {canKelola && !b.di_muka && b.keringanan <= 0 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-10 text-xs font-semibold shrink-0 text-violet-900 px-2"
                                  onClick={() => bukaKeringanan(b)}
                                >
                                  Ker.
                                </Button>
                              )}
                            </div>
                          )}
                          {bisaBayar && b.keringanan > 0 && (
                            <p className="mt-1 pl-8 text-[11px] text-violet-900 tabular-nums">
                              Keringanan {formatRupiah(b.keringanan)}
                              {canDeleteFinancial && b.keringanan_id && (
                                <button
                                  type="button"
                                  className="ml-2 underline"
                                  onClick={() => requestHapusKeringanan(b.keringanan_id!)}
                                >
                                  hapus
                                </button>
                              )}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <>
                    <div className="grid grid-cols-[1.5rem_minmax(7rem,2.2fr)_minmax(7rem,1.8fr)_minmax(8rem,2fr)_minmax(5rem,1.1fr)_minmax(6rem,1.1fr)] gap-x-2 items-center shrink-0 border-b border-copper-100 px-1.5 py-1 bg-copper-50/80 text-[11px] font-medium text-muted">
                      <span />
                      <span className="text-[13px]">Periode</span>
                      <span className="text-right text-[13px]">Sisa</span>
                      <span className="text-[11px]">Bayar</span>
                      <span />
                      <span className="text-right text-[13px]">Keringanan</span>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto divide-y divide-copper-100">
                      {bulanTabel.map((b) => {
                        const id = periodeId(b.tahun, b.bulan);
                        const bisaBayar = b.sisa > 0;
                        return (
                          <li
                            key={id}
                            className={cn(
                              "grid grid-cols-[1.5rem_minmax(7rem,2.2fr)_minmax(7rem,1.8fr)_minmax(8rem,2fr)_minmax(5rem,1.1fr)_minmax(6rem,1.1fr)] gap-x-2 items-center px-1.5 py-1",
                              b.di_muka && bisaBayar && "bg-green-50/60",
                              b.telat && bisaBayar && "bg-amber-50/60",
                              !bisaBayar && "text-muted bg-copper-50/30"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={b.dipilih && bisaBayar}
                              disabled={!bisaBayar}
                              onChange={(e) => toggleBulan(id, e.target.checked)}
                              className="h-4 w-4 shrink-0"
                              aria-label={`Pilih ${formatBulanIndonesiaSingkat(b.bulan, b.tahun)}`}
                            />
                            <div className="leading-tight min-w-0">
                              <span className="text-[13px] font-medium tabular-nums whitespace-nowrap">
                                {formatBulanIndonesiaSingkat(b.bulan, b.tahun)}
                              </span>
                              {b.di_muka && bisaBayar && (
                                <span className="ml-0.5 text-[9px] text-green-800">muka</span>
                              )}
                              {b.telat && bisaBayar && (
                                <span className="ml-0.5 text-[9px] text-amber-900">telat</span>
                              )}
                            </div>
                            {bisaBayar ? (
                              <>
                                <span
                                  className="text-[14px] font-semibold text-muted tabular-nums text-right truncate"
                                  title="Sisa tagihan"
                                >
                                  {formatRupiah(b.sisa)}
                                </span>
                                <RupiahInput
                                  value={b.jumlahInput}
                                  onChange={(v) => setJumlahBulan(id, v)}
                                  disabled={!b.dipilih}
                                  showPrefix={false}
                                  className="h-7 text-xs w-full min-w-0 px-1 rounded-md"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-7 text-[11px] font-semibold px-1 min-w-0 justify-center"
                                  onClick={() => isiSisaBulan(id)}
                                  title={`Isi penuh ${formatRupiah(b.sisa)}`}
                                >
                                  Penuh
                                </Button>
                                {b.keringanan > 0 ? (
                                  <span className="inline-flex items-center justify-end gap-0">
                                    <span className="text-[12px] text-violet-900 tabular-nums truncate">
                                      {formatRupiah(b.keringanan)}
                                    </span>
                                    {canDeleteFinancial && b.keringanan_id && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        icon={Trash2}
                                        iconOnly
                                        title="Hapus keringanan"
                                        className="min-h-6 min-w-6"
                                        onClick={() => requestHapusKeringanan(b.keringanan_id!)}
                                      />
                                    )}
                                  </span>
                                ) : canKelola && !b.di_muka ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-7 text-[13px] font-semibold px-1 min-w-0 justify-end text-violet-900"
                                    onClick={() => bukaKeringanan(b)}
                                    title={`Keringanan sisa ${formatRupiah(b.sisa)}`}
                                  >
                                    Keringanan
                                  </Button>
                                ) : (
                                  <span />
                                )}
                              </>
                            ) : (
                              <>
                                <span />
                                <div className="col-span-3 flex justify-end min-w-0">
                                  <DudukanStatusBadge
                                    tagihan={b.tagihan}
                                    dibayar={b.dibayar}
                                    keringanan={b.keringanan}
                                  />
                                  {b.keringanan > 0 && canDeleteFinancial && b.keringanan_id && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      icon={Trash2}
                                      iconOnly
                                      title="Hapus keringanan"
                                      className="min-h-6 min-w-6 shrink-0"
                                      onClick={() => requestHapusKeringanan(b.keringanan_id!)}
                                    />
                                  )}
                                </div>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Mobile: lanjut ke meta */}
            {isPhone && mobileBayarStep === "pilih" && jumlahDipilih > 0 && (
              <div className="shrink-0 pt-1">
                <Button
                  type="button"
                  className="h-11 text-sm w-full font-semibold"
                  onClick={() => setMobileBayarStep("meta")}
                >
                  Lanjut · {formatRupiah(totalBayar)} ({jumlahDipilih} bln)
                </Button>
              </div>
            )}

            {/* Meta + simpan — selalu di desktop; di phone hanya step meta */}
            {(!isPhone || mobileBayarStep === "meta") && (
              <div
                className={cn(
                  "space-y-1.5 border-t border-copper-200 pt-1.5 bg-card",
                  isPhone && mobileBayarStep === "meta"
                    ? "flex-1 flex flex-col justify-end min-h-0"
                    : "shrink-0"
                )}
              >
                {isPhone && (
                  <div className="flex items-start justify-between gap-2 pb-0.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-copper-950 leading-tight">
                        {jumlahDipilih} bulan · {formatRupiah(totalBayar)}
                      </p>
                      <p className="text-[11px] text-muted truncate leading-tight">
                        {bulanDipilih
                          .slice(0, 4)
                          .map((b) => formatBulanIndonesiaSingkat(b.bulan, b.tahun))
                          .join(", ")}
                        {jumlahDipilih > 4 ? ` +${jumlahDipilih - 4}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 text-xs shrink-0"
                      onClick={() => setMobileBayarStep("pilih")}
                    >
                      Ubah periode
                    </Button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1">
                  <div>
                    <Label>Tanggal</Label>
                    <DateInput value={tanggal} onChange={setTanggal} required />
                  </div>
                  <div>
                    <Label>Petugas</Label>
                    <Select
                      value={petugasId}
                      onChange={(e) => setPetugasId(e.target.value)}
                      required
                      disabled={petugasList.length === 0 || petugasLapangan}
                    >
                      {petugasOptions}
                    </Select>
                  </div>
                  <div>
                    <Label>Diterima di</Label>
                    <Select
                      value={akunKeuanganId}
                      onChange={(e) => setAkunKeuanganId(e.target.value)}
                      required
                      disabled={akunList.length === 0}
                    >
                      {akunOptions}
                    </Select>
                  </div>
                </div>
                {petugasList.length === 0 && detail && (
                  <p className="text-[11px] text-amber-800 leading-tight">
                    Belum ada petugas di banjar {detail.banjar_nama}.
                  </p>
                )}
                {akunList.length === 0 && (
                  <p className="text-[11px] text-amber-800 leading-tight">
                    Belum ada akun keuangan.
                  </p>
                )}
                <button
                  type="button"
                  className="text-[11px] text-copper-700 hover:text-copper-950 underline-offset-2 hover:underline"
                  onClick={() => setShowKeterangan((v) => !v)}
                >
                  {showKeterangan ? "Sembunyikan catatan" : "Catatan (opsional)"}
                </button>
                {showKeterangan && (
                  <Input
                    placeholder="Keterangan pembayaran"
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                  />
                )}
                {petugasLapangan ? (
                  <PetugasLapanganSetorNote />
                ) : (
                  <SetorLangsungField checked={disetorLangsung} onChange={setDisetorLangsung} />
                )}
                <Button
                  type="submit"
                  disabled={
                    loading || petugasList.length === 0 || akunList.length === 0 || totalBayar <= 0
                  }
                  className={cn("text-sm w-full font-semibold", isPhone ? "h-11" : "h-9")}
                >
                  {loading ? "Menyimpan…" : `Simpan (${formatRupiah(totalBayar)})`}
                </Button>
              </div>
            )}
          </form>
        )}

        {canEdit && !keringananMode && bulanDenganSisa.length === 0 && (
          <p
            className={cn(
              "text-sm leading-tight",
              bulanList.some((b) => b.lunas_keringanan)
                ? "text-violet-900"
                : "text-green-800"
            )}
          >
            {bulanList.some((b) => b.lunas_keringanan)
              ? "Semua kewajiban sudah lunas (sebagian via keringanan)."
              : "Semua kewajiban dudukan sudah lunas."}
          </p>
        )}
          </section>
        )}

        {tab === "riwayat" && (
          <section className={DUDUKAN_DIALOG_ZONE_RIWAYAT} aria-label="Riwayat">
            <ZoneHeading
              title="Riwayat"
              hint="Data tercatat — ubah atau hapus di sini, bukan menambah uang masuk baru."
              tone="riwayat"
            />
          <div className="max-h-[min(50vh,280px)] overflow-y-auto space-y-1 pr-0.5">
            <div>
              <p className="text-sm font-semibold text-violet-950 mb-px leading-tight">
                Keringanan ({riwayatKeringanan.length})
              </p>
              {riwayatKeringanan.length === 0 ? (
                <p className="text-muted text-sm leading-tight">Belum ada keringanan.</p>
              ) : (
                <ul className="divide-y divide-copper-100">
                  {riwayatKeringanan.map((k) =>
                    editingKeringananId === k.id ? (
                      <li
                        key={k.id}
                        className="p-1 rounded border border-violet-200 bg-violet-50/60 space-y-1"
                      >
                        <p className="text-xs text-muted leading-tight">
                          {formatBulanIndonesia(k.bulan, k.tahun)}
                        </p>
                        <form
                          onSubmit={(e) => handleSimpanEditKeringanan(e, k)}
                          className="space-y-1"
                        >
                          <div className="grid gap-1 sm:grid-cols-2">
                            <div>
                              <Label>Jumlah</Label>
                              <RupiahInput value={editKerJumlah} onChange={setEditKerJumlah} required />
                            </div>
                            <div>
                              <Label>Tanggal</Label>
                              <DateInput
                                value={editKerTanggal}
                                onChange={setEditKerTanggal}
                                required
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <Label>Petugas</Label>
                              <Select
                                value={editKerPetugasId}
                                onChange={(e) => setEditKerPetugasId(e.target.value)}
                                required
                              >
                                {petugasOptions}
                              </Select>
                            </div>
                          </div>
                          <Input
                            placeholder="Alasan keringanan"
                            value={editKerKeterangan}
                            onChange={(e) => setEditKerKeterangan(e.target.value)}
                            required
                          />
                          <div className="flex gap-1">
                            <Button
                              type="submit"
                              icon={Check}
                              className="h-8 text-sm flex-1"
                              disabled={loading}
                            >
                              Simpan
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              icon={X}
                              className="h-8 text-sm"
                              onClick={batalEditKeringanan}
                              disabled={loading}
                            >
                              Batal
                            </Button>
                          </div>
                        </form>
                      </li>
                    ) : (
                      <li
                        key={k.id}
                        className="flex items-start justify-between gap-1 py-px text-sm leading-tight"
                      >
                        <span className="min-w-0 leading-tight">
                          <span className="text-muted">
                            {formatBulanIndonesia(k.bulan, k.tahun)}
                            <span className="mx-0.5">·</span>
                          </span>
                          <span className="font-medium tabular-nums text-violet-900">
                            {formatRupiah(Number(k.jumlah))}
                          </span>
                          <span className="text-muted mx-0.5">·</span>
                          {formatTanggalLahir(k.tanggal)}
                          {k.keterangan ? (
                            <span className="text-muted block truncate">{k.keterangan}</span>
                          ) : null}
                        </span>
                        {canKelola && (
                          <span className="flex shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Pencil}
                              iconOnly
                              title="Ubah"
                              className="min-h-8 min-w-8"
                              onClick={() => mulaiEditKeringanan(k)}
                            />
                            {canDeleteFinancial && (
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Trash2}
                              iconOnly
                              title="Hapus"
                              className="min-h-8 min-w-8"
                              onClick={() => requestHapusKeringanan(k.id)}
                            />
                            )}
                          </span>
                        )}
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-copper-900 mb-px leading-tight">
                Pembayaran ({riwayat.length})
              </p>
              {riwayat.length === 0 ? (
                <p className="text-muted text-sm leading-tight">Belum ada pembayaran.</p>
              ) : (
                <ul className="divide-y divide-copper-100">
                  {riwayat.map((p) =>
                    editingId === p.id ? (
                      <li
                        key={p.id}
                        className="p-1 rounded border border-copper-200 bg-copper-50/80 space-y-1"
                      >
                        <p className="text-xs text-muted leading-tight">
                          {formatBulanIndonesia(p.bulan, p.tahun)}
                        </p>
                        <form onSubmit={(e) => handleSimpanEdit(e, p)} className="space-y-1">
                          <div className="grid gap-1 sm:grid-cols-2">
                            <div>
                              <Label>Jumlah</Label>
                              <RupiahInput value={editJumlah} onChange={setEditJumlah} required />
                            </div>
                            <div>
                              <Label>Tanggal</Label>
                              <DateInput value={editTanggal} onChange={setEditTanggal} required />
                            </div>
                            <div>
                              <Label>Petugas</Label>
                              <Select
                                value={editPetugasId}
                                onChange={(e) => setEditPetugasId(e.target.value)}
                                required
                              >
                                {petugasOptions}
                              </Select>
                            </div>
                            <div>
                              <Label>Diterima di</Label>
                              <Select
                                value={editAkunKeuanganId}
                                onChange={(e) => setEditAkunKeuanganId(e.target.value)}
                                required
                              >
                                {akunOptions}
                              </Select>
                            </div>
                          </div>
                          <Input
                            placeholder="Keterangan"
                            value={editKeterangan}
                            onChange={(e) => setEditKeterangan(e.target.value)}
                          />
                          <div className="flex gap-1">
                            <Button
                              type="submit"
                              icon={Check}
                              className="h-8 text-sm flex-1"
                              disabled={loading}
                            >
                              Simpan
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              icon={X}
                              className="h-8 text-sm"
                              onClick={batalEdit}
                              disabled={loading}
                            >
                              Batal
                            </Button>
                          </div>
                        </form>
                      </li>
                    ) : (
                      <li
                        key={p.id}
                        className="flex items-start justify-between gap-1 py-px text-sm leading-tight"
                      >
                        <span className="min-w-0 leading-tight">
                          <span className="text-muted">
                            {formatBulanIndonesia(p.bulan, p.tahun)}
                            <span className="mx-0.5">·</span>
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatRupiah(Number(p.jumlah))}
                          </span>
                          <span className="text-muted mx-0.5">·</span>
                          {formatTanggalLahir(p.tanggal)}
                          {p.akun_keuangan_nama ? (
                            <span className="text-muted"> · {p.akun_keuangan_nama}</span>
                          ) : null}
                          <StatusSetorBadge tanggalSetor={p.tanggal_setor} setoranId={p.setoran_id} />
                          {p.keterangan ? (
                            <span className="text-muted block truncate">{p.keterangan}</span>
                          ) : null}
                        </span>
                        {canEdit && !p.setoran_id && (
                          <span className="flex shrink-0">
                            {canKelola && (
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Pencil}
                              iconOnly
                              title="Ubah"
                              className="min-h-8 min-w-8"
                              onClick={() => mulaiEdit(p)}
                            />
                            )}
                            {bisaHapus(p) && (
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Trash2}
                              iconOnly
                              title="Hapus"
                              className="min-h-8 min-w-8"
                              onClick={() => requestHapus(p)}
                            />
                            )}
                          </span>
                        )}
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          </div>
          </section>
        )}

        {error && <p className="text-red-600 text-sm leading-tight shrink-0">{error}</p>}
      </div>
    </Modal>

    <ConfirmDialog
      open={deleteId != null}
      title="Hapus pembayaran dudukan?"
      message={
        deleteId
          ? (() => {
              const p = riwayat.find((x) => x.id === deleteId);
              return p
                ? `Hapus pembayaran ${formatRupiah(Number(p.jumlah))} (${formatPeriodeDudukanMmYyyy(p.bulan, p.tahun)})? Tagihan periode tersebut akan muncul kembali sebagai tunggakan.`
                : "Hapus pembayaran ini? Tagihan periode tersebut akan muncul kembali sebagai tunggakan.";
            })()
          : ""
      }
      confirmLabel="Ya, hapus"
      busy={deleteBusy}
      onConfirm={() => void confirmHapus()}
      onCancel={() => {
        if (!deleteBusy) setDeleteId(null);
      }}
    />
    <ConfirmDialog
      open={deleteKeringananId != null}
      title="Hapus keringanan?"
      message="Hapus keringanan ini? Sisa tagihan periode terkait akan muncul kembali sebagai tunggakan."
      confirmLabel="Ya, hapus"
      busy={deleteKeringananBusy}
      onConfirm={() => void confirmHapusKeringanan()}
      onCancel={() => {
        if (!deleteKeringananBusy) setDeleteKeringananId(null);
      }}
    />
    </>
  );
}
