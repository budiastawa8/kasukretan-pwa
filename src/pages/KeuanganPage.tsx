import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { scrollAppMainToTop } from "../lib/scroll-main";
import { ArrowLeftRight, Pencil, Plus, RotateCcw, Trash2, Wallet } from "lucide-react";
import { normalizeTanggalIsoForInput } from "../lib/date-iso";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../lib/pagination";
import {
  isAkunKelompokRow,
  isAkunSubOfKelompok,
  listAkunKeuanganHierarkis,
  resolveAkunDisplayNama,
} from "../lib/services/akun-keuangan";
import {
  getSaldoAkun,
  loadBukuKasForAkun,
  listRingkasanSaldoDisplay,
  type RingkasanSaldoAkun,
} from "../lib/services/buku-kas";
import { listPosBiaya } from "../lib/services/pos-biaya";
import { listAlokasiKasDudukan } from "../lib/services/kas-dudukan-alokasi";
import { listPosPemasukan } from "../lib/services/pos-pemasukan";
import {
  createTransaksiPemasukan,
  deleteTransaksiPemasukan,
  getTransaksiPemasukan,
  listTransaksiPemasukan,
  updateTransaksiPemasukan,
  type PemasukanPosInput,
} from "../lib/services/pemasukan";
import {
  createTransaksiPengeluaran,
  deleteTransaksiPengeluaran,
  getTransaksiPengeluaran,
  listTransaksiPengeluaran,
  updateTransaksiPengeluaran,
  type PengeluaranPosInput,
} from "../lib/services/pengeluaran";
import {
  createTransaksiTransfer,
  deleteTransaksiTransfer,
  getTransaksiTransfer,
  listTransaksiTransfer,
  updateTransaksiTransfer,
} from "../lib/services/transfer-akun";
import { formatRupiah } from "../lib/dudukan-hitung";
import type {
  AkunKeuanganRow,
  BukuKasBaris,
  PosBiayaRow,
  PosPemasukanRow,
  TransaksiPemasukanRow,
  TransaksiPengeluaranRow,
  TransaksiTransferRow,
} from "../lib/types";
import { cn, formatTanggalLahir, today } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { canEditKeuangan } from "../lib/auth-roles";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DateInput } from "../components/ui/DateInput";
import { Input, Label, Select } from "../components/ui/Input";
import { RupiahInput } from "../components/ui/RupiahInput";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ListPagination } from "../components/ui/ListPagination";
import { BukuKasSaldoRingkasan } from "../components/keuangan/BukuKasSaldoRingkasan";
import { KasDudukanPlafonPanel } from "../components/keuangan/KasDudukanPlafonPanel";
import {
  LIST_CARD,
  LIST_CARD_PHONE,
  LIST_HEAD_ROW,
  LIST_TABLE,
  LIST_TABLE_ELEMENT,
} from "../components/ui/list-compact";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";

type Tab = "buku-kas" | "transfer" | "pemasukan" | "pengeluaran";

const POS_ROW_POS_CLASS = "w-full min-w-0 sm:min-w-[calc(10rem-50pt)] sm:flex-1";
const POS_ROW_JUMLAH_CLASS = "w-full sm:w-[calc(7rem+50pt)] sm:shrink-0";

const PHONE_ROW_CARD =
  "rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5";

const TAB_STYLES: Record<Tab, { active: string; inactive: string }> = {
  "buku-kas": {
    active: "bg-white text-copper-900 shadow-sm border border-copper-200",
    inactive: "text-muted hover:text-copper-800 hover:bg-white/60",
  },
  transfer: {
    active: "bg-sky-100 text-sky-950 shadow-sm border border-sky-300 ring-1 ring-sky-200/80",
    inactive: "text-sky-800 hover:bg-sky-50/90",
  },
  pemasukan: {
    active: "bg-emerald-100 text-emerald-950 shadow-sm border border-emerald-300 ring-1 ring-emerald-200/80",
    inactive: "text-emerald-800 hover:bg-emerald-50/90",
  },
  pengeluaran: {
    active: "bg-red-100 text-red-950 shadow-sm border border-red-300 ring-1 ring-red-200/80",
    inactive: "text-red-800 hover:bg-red-50/90",
  },
};

type PosBaris = PengeluaranPosInput & { key: string };
type PosMasukBaris = PemasukanPosInput & { key: string };

function emptyPosBaris(): PosBaris {
  return { key: crypto.randomUUID(), posBiayaId: "", jumlah: 0, keterangan: "" };
}

function emptyPosMasukBaris(): PosMasukBaris {
  return { key: crypto.randomUUID(), posPemasukanId: "", jumlah: 0, keterangan: "" };
}

function matchesNeedle(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true;
  return (haystack ?? "").toLowerCase().includes(needle);
}

export function KeuanganPage() {
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();
  const canEdit = canEditKeuangan(user?.peran);
  const [tab, setTab] = useState<Tab>("buku-kas");
  const [akun, setAkun] = useState<AkunKeuanganRow[]>([]);
  const [posBiaya, setPosBiaya] = useState<PosBiayaRow[]>([]);
  const [posPemasukan, setPosPemasukan] = useState<PosPemasukanRow[]>([]);
  const [akunId, setAkunId] = useState("");
  const [dari, setDari] = useState("");
  const [sampai, setSampai] = useState("");
  const [bukuKasQ, setBukuKasQ] = useState("");
  const [pmQ, setPmQ] = useState("");
  const [pgQ, setPgQ] = useState("");
  const [trfQ, setTrfQ] = useState("");
  const [saldoAwal, setSaldoAwal] = useState(0);
  const [saldoAkhir, setSaldoAkhir] = useState(0);
  const [baris, setBaris] = useState<BukuKasBaris[]>([]);
  const [bukuKasPage, setBukuKasPage] = useState(1);
  const [bukuKasPageSize, setBukuKasPageSize] = useState(LIST_PAGE_SIZE);
  const [riwayatKeluar, setRiwayatKeluar] = useState<TransaksiPengeluaranRow[]>([]);
  const [pengeluaranPage, setPengeluaranPage] = useState(1);
  const [pengeluaranPageSize, setPengeluaranPageSize] = useState(LIST_PAGE_SIZE);
  const [riwayatMasuk, setRiwayatMasuk] = useState<TransaksiPemasukanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ringkasanSaldo, setRingkasanSaldo] = useState<RingkasanSaldoAkun[]>([]);
  const [totalSaldoRingkasan, setTotalSaldoRingkasan] = useState(0);
  const [ringkasanLoading, setRingkasanLoading] = useState(false);
  const [error, setError] = useState("");

  const [pgTanggal, setPgTanggal] = useState(today());
  const [pgAkunId, setPgAkunId] = useState("");
  const [pgKet, setPgKet] = useState("");
  const [pgBaris, setPgBaris] = useState<PosBaris[]>([emptyPosBaris()]);
  const [pgBusy, setPgBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [pmTanggal, setPmTanggal] = useState(today());
  const [pmAkunId, setPmAkunId] = useState("");
  const [pmKet, setPmKet] = useState("");
  const [pmBaris, setPmBaris] = useState<PosMasukBaris[]>([emptyPosMasukBaris()]);
  const [pmBusy, setPmBusy] = useState(false);
  const [editingPmId, setEditingPmId] = useState<string | null>(null);
  const [editPmLoading, setEditPmLoading] = useState(false);
  const [deletePmId, setDeletePmId] = useState<string | null>(null);
  const [deletePmBusy, setDeletePmBusy] = useState(false);

  const [riwayatTransfer, setRiwayatTransfer] = useState<TransaksiTransferRow[]>([]);
  const [trfTanggal, setTrfTanggal] = useState(today());
  const [trfAsalId, setTrfAsalId] = useState("");
  const [trfTujuanId, setTrfTujuanId] = useState("");
  const [trfJumlah, setTrfJumlah] = useState<number | "">("");
  const [trfKet, setTrfKet] = useState("");
  const [trfSaldoAsal, setTrfSaldoAsal] = useState<number | null>(null);
  const [trfBusy, setTrfBusy] = useState(false);
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [editTransferLoading, setEditTransferLoading] = useState(false);
  const [deleteTransferId, setDeleteTransferId] = useState<string | null>(null);
  const [deleteTransferBusy, setDeleteTransferBusy] = useState(false);
  const [alokasiPosIds, setAlokasiPosIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      const [a, p, pm, alok] = await Promise.all([
        listAkunKeuanganHierarkis(true),
        listPosBiaya(true),
        listPosPemasukan(true),
        listAlokasiKasDudukan(),
      ]);
      setAkun(a);
      setPosBiaya(p);
      setPosPemasukan(pm);
      setAlokasiPosIds(new Set(alok.map((x) => x.pos_biaya_id)));
      if (a[0] && !akunId) setAkunId(a[0].id);
      const firstTransaksional = a.find((x) => !isAkunKelompokRow(x));
      if (firstTransaksional && !pgAkunId) setPgAkunId(firstTransaksional.id);
      if (firstTransaksional && !pmAkunId) setPmAkunId(firstTransaksional.id);
      if (firstTransaksional && !trfAsalId) setTrfAsalId(firstTransaksional.id);
      const secondTransaksional = a.find(
        (x) => !isAkunKelompokRow(x) && x.id !== firstTransaksional?.id
      );
      if (secondTransaksional && !trfTujuanId) setTrfTujuanId(secondTransaksional.id);
      else if (firstTransaksional && !trfTujuanId) setTrfTujuanId(firstTransaksional.id);
    })();
  }, []);

  useEffect(() => {
    scrollAppMainToTop();
  }, [tab]);

  const loadRingkasanSaldo = useCallback(async () => {
    setRingkasanLoading(true);
    try {
      const display = await listRingkasanSaldoDisplay();
      setRingkasanSaldo(display.rows);
      setTotalSaldoRingkasan(display.totalSaldo);
    } catch (e) {
      setError(String(e));
    } finally {
      setRingkasanLoading(false);
    }
  }, []);

  const loadBukuKas = useCallback(async () => {
    if (!akunId) return;
    setLoading(true);
    setError("");
    try {
      const r = await loadBukuKasForAkun({
        akunKeuanganId: akunId,
        dari: dari || undefined,
        sampai: sampai || undefined,
      });
      setSaldoAwal(r.saldo_awal);
      setSaldoAkhir(r.saldo_akhir);
      setBaris(r.baris);
      setBukuKasPage(1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [akunId, dari, sampai]);

  const loadPengeluaran = useCallback(async () => {
    setLoading(true);
    try {
      setRiwayatKeluar(await listTransaksiPengeluaran());
      setPengeluaranPage(1);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPemasukan = useCallback(async () => {
    setLoading(true);
    try {
      setRiwayatMasuk(await listTransaksiPemasukan({ limit: 50 }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransfer = useCallback(async () => {
    setLoading(true);
    try {
      setRiwayatTransfer(await listTransaksiTransfer({ limit: 50 }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRingkasanSaldo();
  }, [loadRingkasanSaldo]);

  useEffect(() => {
    if (tab === "buku-kas") void loadBukuKas();
    else if (tab === "pengeluaran") void loadPengeluaran();
    else if (tab === "pemasukan") void loadPemasukan();
    else void loadTransfer();
  }, [tab, loadBukuKas, loadPengeluaran, loadPemasukan, loadTransfer]);

  useEffect(() => {
    if (!trfAsalId) {
      setTrfSaldoAsal(null);
      return;
    }
    void getSaldoAkun(trfAsalId)
      .then(setTrfSaldoAsal)
      .catch(() => setTrfSaldoAsal(null));
  }, [trfAsalId, riwayatTransfer, baris, ringkasanSaldo]);

  const totalSaldoSemuaAkun = totalSaldoRingkasan;

  const akunTransaksional = useMemo(
    () => akun.filter((a) => !isAkunKelompokRow(a)),
    [akun]
  );

  const transferGroups = useMemo(() => {
    const kelompok = akun.filter((a) => isAkunKelompokRow(a));
    const groups: { label: string; items: typeof akunTransaksional }[] = [];
    for (const k of kelompok) {
      const items = akunTransaksional.filter((s) => s.parent_akun_id === k.id);
      if (items.length > 0) groups.push({ label: k.nama, items });
    }
    const standalone = akunTransaksional.filter((s) => !s.parent_akun_id);
    if (standalone.length > 0) groups.push({ label: "Akun mandiri", items: standalone });
    return groups;
  }, [akun, akunTransaksional]);

  const kelompokDenganMutasi = useMemo(
    () =>
      akun.filter(
        (a) =>
          isAkunKelompokRow(a) &&
          (a.jenis === "kas_dudukan" || a.jenis === "kas_paturunan") &&
          akunTransaksional.filter((s) => s.parent_akun_id === a.id).length >= 2
      ),
    [akun, akunTransaksional]
  );

  function renderTransferOptions(excludeId?: string) {
    return transferGroups.map((g) => (
      <optgroup key={g.label} label={g.label}>
        {g.items.map((a) => (
          <option key={a.id} value={a.id} disabled={excludeId != null && a.id === excludeId}>
            {resolveAkunDisplayNama(a, akun)}
          </option>
        ))}
      </optgroup>
    ));
  }

  function mulaiMutasiKelompok(kelompok: (typeof akun)[number]) {
    const subs = akunTransaksional.filter((s) => s.parent_akun_id === kelompok.id);
    const tunai = subs.find((s) => s.jenis === kelompok.jenis) ?? subs[0];
    const tujuan = subs.find((s) => s.id !== tunai?.id);
    if (!tunai || !tujuan) return;
    setTrfAsalId(tunai.id);
    setTrfTujuanId(tujuan.id);
    setTrfKet(`Mutasi internal ${kelompok.nama}`);
    setEditingTransferId(null);
  }

  const filteredBaris = useMemo(() => {
    const needle = bukuKasQ.trim().toLowerCase();
    if (!needle) return baris;
    return baris.filter((b) => matchesNeedle(b.uraian, needle));
  }, [baris, bukuKasQ]);

  const filteredRiwayatMasuk = useMemo(() => {
    const needle = pmQ.trim().toLowerCase();
    if (!needle) return riwayatMasuk;
    return riwayatMasuk.filter(
      (r) =>
        matchesNeedle(r.keterangan, needle) ||
        matchesNeedle(r.pos_keterangan, needle) ||
        matchesNeedle(r.akun_keuangan_nama, needle)
    );
  }, [riwayatMasuk, pmQ]);

  const filteredRiwayatKeluar = useMemo(() => {
    const needle = pgQ.trim().toLowerCase();
    if (!needle) return riwayatKeluar;
    return riwayatKeluar.filter(
      (r) =>
        matchesNeedle(r.keterangan, needle) ||
        matchesNeedle(r.pos_keterangan, needle) ||
        matchesNeedle(r.akun_keuangan_nama, needle)
    );
  }, [riwayatKeluar, pgQ]);

  const filteredRiwayatTransfer = useMemo(() => {
    const needle = trfQ.trim().toLowerCase();
    if (!needle) return riwayatTransfer;
    return riwayatTransfer.filter(
      (r) =>
        matchesNeedle(r.keterangan, needle) ||
        matchesNeedle(r.akun_asal_nama, needle) ||
        matchesNeedle(r.akun_tujuan_nama, needle)
    );
  }, [riwayatTransfer, trfQ]);

  const bukuKasSafePage = useMemo(
    () => clampPage(bukuKasPage, filteredBaris.length, bukuKasPageSize),
    [bukuKasPage, filteredBaris.length, bukuKasPageSize]
  );
  const pagedBaris = useMemo(
    () => paginateSlice(filteredBaris, bukuKasSafePage, bukuKasPageSize),
    [filteredBaris, bukuKasSafePage, bukuKasPageSize]
  );

  const pengeluaranSafePage = useMemo(
    () => clampPage(pengeluaranPage, filteredRiwayatKeluar.length, pengeluaranPageSize),
    [pengeluaranPage, filteredRiwayatKeluar.length, pengeluaranPageSize]
  );
  const pagedRiwayatKeluar = useMemo(
    () => paginateSlice(filteredRiwayatKeluar, pengeluaranSafePage, pengeluaranPageSize),
    [filteredRiwayatKeluar, pengeluaranSafePage, pengeluaranPageSize]
  );

  useEffect(() => {
    setBukuKasPage(1);
  }, [bukuKasQ]);

  useEffect(() => {
    setPengeluaranPage(1);
  }, [pgQ]);

  useEffect(() => {
    if (bukuKasPage !== bukuKasSafePage) setBukuKasPage(bukuKasSafePage);
  }, [bukuKasPage, bukuKasSafePage]);

  useEffect(() => {
    if (pengeluaranPage !== pengeluaranSafePage) setPengeluaranPage(pengeluaranSafePage);
  }, [pengeluaranPage, pengeluaranSafePage]);

  function pilihAkunDariRingkasan(id: string) {
    setAkunId(id);
    setTab("buku-kas");
  }

  const totalPg = pgBaris.reduce((s, b) => s + (Number(b.jumlah) > 0 ? Math.round(Number(b.jumlah)) : 0), 0);

  const pgAkun = useMemo(() => akun.find((a) => a.id === pgAkunId), [akun, pgAkunId]);
  const isPgKasDudukan = isAkunSubOfKelompok(pgAkun, "kas_dudukan", akun);
  const posUntukPengeluaran = useMemo(() => {
    if (!isPgKasDudukan) return posBiaya;
    return posBiaya.filter((p) => alokasiPosIds.has(p.id));
  }, [isPgKasDudukan, posBiaya, alokasiPosIds]);

  useEffect(() => {
    if (!isPgKasDudukan) return;
    setPgBaris((prev) =>
      prev.map((b) =>
        b.posBiayaId && !alokasiPosIds.has(b.posBiayaId) ? { ...b, posBiayaId: "" } : b
      )
    );
  }, [isPgKasDudukan, alokasiPosIds, pgAkunId]);
  const totalPm = pmBaris.reduce((s, b) => s + (Number(b.jumlah) > 0 ? Math.round(Number(b.jumlah)) : 0), 0);

  function resetFormPemasukan() {
    setEditingPmId(null);
    setPmTanggal(today());
    setPmKet("");
    setPmBaris([emptyPosMasukBaris()]);
    setError("");
    const first = akun.find((x) => !isAkunKelompokRow(x));
    if (first) setPmAkunId(first.id);
  }

  async function mulaiEditPemasukan(id: string) {
    if (!canEdit) return;
    setEditPmLoading(true);
    setError("");
    try {
      const row = await getTransaksiPemasukan(id);
      if (!row) throw new Error("Transaksi tidak ditemukan");
      setEditingPmId(id);
      setPmTanggal(normalizeTanggalIsoForInput(row.tanggal));
      setPmAkunId(row.akun_keuangan_id);
      setPmKet(row.keterangan ?? "");
      setPmBaris(
        row.pos?.length
          ? row.pos.map((p) => ({
              key: crypto.randomUUID(),
              posPemasukanId: p.pos_pemasukan_id,
              jumlah: Math.round(Number(p.jumlah) || 0),
              keterangan: p.keterangan ?? "",
            }))
          : [emptyPosMasukBaris()]
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setEditPmLoading(false);
    }
  }

  async function simpanPemasukan(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !user) return;
    setPmBusy(true);
    setError("");
    const pos = pmBaris.map((b) => ({
      posPemasukanId: b.posPemasukanId,
      jumlah: Number(b.jumlah),
      keterangan: b.keterangan || undefined,
    }));
    try {
      if (editingPmId) {
        await updateTransaksiPemasukan(editingPmId, {
          akunKeuanganId: pmAkunId,
          tanggal: pmTanggal,
          keterangan: pmKet || undefined,
          pos,
        });
      } else {
        await createTransaksiPemasukan({
          akunKeuanganId: pmAkunId,
          tanggal: pmTanggal,
          keterangan: pmKet || undefined,
          createdBy: user.id,
          pos,
        });
      }
      resetFormPemasukan();
      await Promise.all([loadPemasukan(), loadBukuKas(), loadRingkasanSaldo()]);
    } catch (err) {
      setError(String(err));
    } finally {
      setPmBusy(false);
    }
  }

  async function confirmHapusPemasukan() {
    if (!deletePmId) return;
    setDeletePmBusy(true);
    try {
      await deleteTransaksiPemasukan(deletePmId);
      if (editingPmId === deletePmId) resetFormPemasukan();
      setDeletePmId(null);
      await Promise.all([loadPemasukan(), loadBukuKas(), loadRingkasanSaldo()]);
    } catch (err) {
      setError(String(err));
    } finally {
      setDeletePmBusy(false);
    }
  }

  function resetFormPengeluaran() {
    setEditingId(null);
    setPgTanggal(today());
    setPgKet("");
    setPgBaris([emptyPosBaris()]);
    setError("");
    const first = akun.find((x) => !isAkunKelompokRow(x));
    if (first) setPgAkunId(first.id);
  }

  async function mulaiEditPengeluaran(id: string) {
    if (!canEdit) return;
    setEditLoading(true);
    setError("");
    try {
      const row = await getTransaksiPengeluaran(id);
      if (!row) throw new Error("Transaksi tidak ditemukan");
      setEditingId(id);
      setPgTanggal(normalizeTanggalIsoForInput(row.tanggal));
      setPgAkunId(row.akun_keuangan_id);
      setPgKet(row.keterangan ?? "");
      setPgBaris(
        row.pos?.length
          ? row.pos.map((p) => ({
              key: crypto.randomUUID(),
              posBiayaId: p.pos_biaya_id,
              jumlah: Math.round(Number(p.jumlah) || 0),
              keterangan: p.keterangan ?? "",
            }))
          : [emptyPosBaris()]
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setEditLoading(false);
    }
  }

  async function simpanPengeluaran(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !user) return;
    setPgBusy(true);
    setError("");
    const pos = pgBaris.map((b) => ({
      posBiayaId: b.posBiayaId,
      jumlah: Number(b.jumlah),
      keterangan: b.keterangan || undefined,
    }));
    try {
      if (editingId) {
        await updateTransaksiPengeluaran(editingId, {
          akunKeuanganId: pgAkunId,
          tanggal: pgTanggal,
          keterangan: pgKet || undefined,
          pos,
        });
      } else {
        await createTransaksiPengeluaran({
          akunKeuanganId: pgAkunId,
          tanggal: pgTanggal,
          keterangan: pgKet || undefined,
          createdBy: user.id,
          pos,
        });
      }
      resetFormPengeluaran();
      await Promise.all([loadPengeluaran(), loadBukuKas(), loadRingkasanSaldo()]);
    } catch (err) {
      setError(String(err));
    } finally {
      setPgBusy(false);
    }
  }

  function resetFormTransfer() {
    setEditingTransferId(null);
    setTrfTanggal(today());
    setTrfKet("");
    setTrfJumlah("");
    setError("");
    const trans = akun.filter((x) => !isAkunKelompokRow(x));
    if (trans[0]) setTrfAsalId(trans[0].id);
    if (trans[1]) setTrfTujuanId(trans[1].id);
    else if (trans[0]) setTrfTujuanId(trans[0].id);
  }

  async function mulaiEditTransfer(id: string) {
    if (!canEdit) return;
    setEditTransferLoading(true);
    setError("");
    try {
      const row = await getTransaksiTransfer(id);
      if (!row) throw new Error("Transaksi tidak ditemukan");
      setEditingTransferId(id);
      setTrfTanggal(normalizeTanggalIsoForInput(row.tanggal));
      setTrfAsalId(row.akun_asal_id);
      setTrfTujuanId(row.akun_tujuan_id);
      setTrfJumlah(row.jumlah);
      setTrfKet(row.keterangan ?? "");
    } catch (err) {
      setError(String(err));
    } finally {
      setEditTransferLoading(false);
    }
  }

  async function simpanTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !user) return;
    setTrfBusy(true);
    setError("");
    try {
      const payload = {
        akunAsalId: trfAsalId,
        akunTujuanId: trfTujuanId,
        tanggal: trfTanggal,
        jumlah: Number(trfJumlah),
        keterangan: trfKet || undefined,
      };
      if (editingTransferId) {
        await updateTransaksiTransfer(editingTransferId, payload);
      } else {
        await createTransaksiTransfer({ ...payload, createdBy: user.id });
      }
      resetFormTransfer();
      await Promise.all([loadTransfer(), loadBukuKas(), loadRingkasanSaldo()]);
    } catch (err) {
      setError(String(err));
    } finally {
      setTrfBusy(false);
    }
  }

  async function confirmHapusTransfer() {
    if (!deleteTransferId) return;
    setDeleteTransferBusy(true);
    try {
      await deleteTransaksiTransfer(deleteTransferId);
      if (editingTransferId === deleteTransferId) resetFormTransfer();
      setDeleteTransferId(null);
      await Promise.all([loadTransfer(), loadBukuKas(), loadRingkasanSaldo()]);
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleteTransferBusy(false);
    }
  }

  async function confirmHapusPengeluaran() {
    if (!deleteId) return;
    setDeleteBusy(true);
    try {
      await deleteTransaksiPengeluaran(deleteId);
      if (editingId === deleteId) resetFormPengeluaran();
      setDeleteId(null);
      await Promise.all([loadPengeluaran(), loadBukuKas(), loadRingkasanSaldo()]);
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-copper-950 flex items-center gap-2">
            <Wallet size={22} className="shrink-0" aria-hidden />
            Keuangan
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Buku kas, transfer, pemasukan, dan pengeluaran.
          </p>
        </div>
        <Link
          to="/laporan/buku-kas"
          className="text-xs text-copper-800 hover:underline shrink-0 self-start sm:self-auto"
        >
          Laporan Buku Kas →
        </Link>
      </div>

      <BukuKasSaldoRingkasan
        rows={ringkasanSaldo}
        totalSaldo={totalSaldoSemuaAkun}
        selectedAkunId={tab === "buku-kas" ? akunId : undefined}
        onSelectAkun={pilihAkunDariRingkasan}
        loading={ringkasanLoading}
        layout="three-col"
      />

      <div className="flex gap-1 p-0.5 rounded-md bg-copper-100/80 border border-copper-200 w-full sm:w-fit overflow-x-auto app-scroll-x">
        {(
          [
            ["buku-kas", "Buku Kas"],
            ["transfer", "Transfer"],
            ["pemasukan", "Pemasukan"],
            ["pengeluaran", "Pengeluaran"],
          ] as const
        ).map(([id, label]) => {
          const tabId = id as Tab;
          const styles = TAB_STYLES[tabId];
          return (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded font-medium transition-colors shrink-0",
              isPhone
                ? "h-11 min-h-11 px-4 text-sm"
                : "px-3 py-2 sm:px-3.5 sm:py-1.5 text-xs sm:text-sm min-h-9 sm:min-h-0",
              tab === id ? styles.active : styles.inactive
            )}
            onClick={() => setTab(tabId)}
          >
            {label}
          </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      {tab === "buku-kas" && (
        <Card title="Buku Kas" className={cn(LIST_CARD, isPhone && LIST_CARD_PHONE, LIST_TABLE)}>
          <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:flex-wrap sm:gap-3 sm:items-end">
            <div className="w-full sm:min-w-[12rem] sm:w-auto">
              <Label className="text-[11px]">Akun</Label>
              <Select value={akunId} onChange={(e) => setAkunId(e.target.value)}>
                {akun.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.parent_akun_id
                      ? `  ${resolveAkunDisplayNama(a, akun)}`
                      : resolveAkunDisplayNama(a, akun)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <div>
                <Label className="text-[11px]">Dari</Label>
                <DateInput value={dari} onChange={setDari} />
              </div>
              <div>
                <Label className="text-[11px]">Sampai</Label>
                <DateInput value={sampai} onChange={setSampai} />
              </div>
            </div>
            <div className="w-full sm:flex-1 sm:min-w-[160px]">
              <Label className="text-[11px]">Cari transaksi</Label>
              <Input
                className="text-sm h-9"
                placeholder="Ket. umum / ket. baris / uraian…"
                value={bukuKasQ}
                onChange={(e) => setBukuKasQ(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className={cn("text-xs w-full sm:w-auto", isPhone ? "h-11" : "h-9 sm:h-8")}
              onClick={() => void Promise.all([loadBukuKas(), loadRingkasanSaldo()])}
            >
              Muat ulang
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm mb-3">
            <span>
              Saldo awal periode: <strong>{formatRupiah(saldoAwal)}</strong>
            </span>
            <span>
              Saldo akhir: <strong>{formatRupiah(saldoAkhir)}</strong>
            </span>
            {bukuKasQ.trim() && (
              <span className="text-muted">
                Hasil cari: <strong>{filteredBaris.length}</strong> / {baris.length}
              </span>
            )}
          </div>
          {isPhone ? (
            <ul className="space-y-2">
              {filteredBaris.length === 0 ? (
                <li className="py-6 text-center text-xs text-muted">
                  {loading
                    ? "Memuat…"
                    : bukuKasQ.trim()
                      ? "Tidak ada transaksi yang cocok dengan pencarian."
                      : "Belum ada transaksi."}
                </li>
              ) : (
                pagedBaris.map((b) => (
                  <li
                    key={b.id}
                    className={cn(
                      PHONE_ROW_CARD,
                      (b.jenis === "transfer_masuk" || b.jenis === "transfer_keluar") && "bg-sky-50/40"
                    )}
                  >
                    <p className="text-[11px] text-muted">{formatTanggalLahir(b.tanggal)}</p>
                    <p className="mt-0.5 text-sm font-medium text-copper-950 leading-snug">{b.uraian}</p>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <dt className="text-muted">Masuk</dt>
                        <dd className="tabular-nums font-medium text-emerald-800">
                          {b.masuk > 0 ? formatRupiah(b.masuk) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Keluar</dt>
                        <dd className="tabular-nums font-medium text-red-800">
                          {b.keluar > 0 ? formatRupiah(b.keluar) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">Saldo</dt>
                        <dd className="tabular-nums font-semibold text-copper-950">
                          {formatRupiah(b.saldo_berjalan ?? 0)}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <div className="overflow-x-auto app-scroll-x">
              <table className={cn(LIST_TABLE_ELEMENT, "[&_td]:!py-1.5")}>
                <thead>
                  <tr className={LIST_HEAD_ROW}>
                    <th>Tanggal</th>
                    <th>Uraian</th>
                    <th className="text-right">Masuk</th>
                    <th className="text-right">Keluar</th>
                    <th className="text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBaris.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-muted text-xs">
                        {loading
                          ? "Memuat…"
                          : bukuKasQ.trim()
                            ? "Tidak ada transaksi yang cocok dengan pencarian."
                            : "Belum ada transaksi."}
                      </td>
                    </tr>
                  )}
                  {pagedBaris.map((b) => (
                    <tr
                      key={b.id}
                      className={cn(
                        "border-b border-copper-100",
                        (b.jenis === "transfer_masuk" || b.jenis === "transfer_keluar") && "bg-sky-50/40"
                      )}
                    >
                      <td className="pr-3 py-1 whitespace-nowrap">{formatTanggalLahir(b.tanggal)}</td>
                      <td className="pr-3 max-w-md truncate" title={b.uraian}>
                        {b.uraian}
                      </td>
                      <td className="pr-3 text-right tabular-nums text-emerald-800">
                        {b.masuk > 0 ? formatRupiah(b.masuk) : "—"}
                      </td>
                      <td className="pr-3 text-right tabular-nums text-red-800">
                        {b.keluar > 0 ? formatRupiah(b.keluar) : "—"}
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        {formatRupiah(b.saldo_berjalan ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ListPagination
            page={bukuKasSafePage}
            totalItems={filteredBaris.length}
            pageSize={bukuKasPageSize}
            onPageChange={setBukuKasPage}
            onPageSizeChange={setBukuKasPageSize}
            compact
          />
        </Card>
      )}

      {tab === "transfer" && (
        <>
          {canEdit ? (
            <Card title={editingTransferId ? "Ubah transfer" : "Transfer antar akun"}>
              {editingTransferId && (
                <p className="text-xs text-copper-800 bg-copper-50 border border-copper-200 rounded px-2 py-1 mb-2">
                  Mengubah transfer {formatTanggalLahir(trfTanggal)} —{" "}
                  <button
                    type="button"
                    className="text-copper-900 underline hover:no-underline"
                    onClick={resetFormTransfer}
                  >
                    Batal ubah
                  </button>
                </p>
              )}
              <form onSubmit={simpanTransfer} className="space-y-3">
                {kelompokDenganMutasi.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[11px] text-muted self-center">Mutasi internal:</span>
                    {kelompokDenganMutasi.map((k) => (
                      <Button
                        key={k.id}
                        type="button"
                        variant="secondary"
                        className="h-7 text-[11px]"
                        icon={ArrowLeftRight}
                        onClick={() => mulaiMutasiKelompok(k)}
                      >
                        {k.nama}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label className="text-[11px]">Tanggal</Label>
                    <DateInput value={trfTanggal} onChange={setTrfTanggal} required />
                  </div>
                  <div>
                    <Label className="text-[11px]">Dari akun (asal)</Label>
                    <Select value={trfAsalId} onChange={(e) => setTrfAsalId(e.target.value)} required>
                      {renderTransferOptions()}
                    </Select>
                    {trfSaldoAsal != null && (
                      <p className="text-[10px] text-muted mt-1">
                        Saldo tersedia: <strong>{formatRupiah(trfSaldoAsal)}</strong>
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-[11px]">Ke akun (tujuan)</Label>
                    <Select value={trfTujuanId} onChange={(e) => setTrfTujuanId(e.target.value)} required>
                      {renderTransferOptions(trfAsalId)}
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Jumlah</Label>
                    <RupiahInput
                      value={trfJumlah}
                      onChange={setTrfJumlah}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px]">Keterangan</Label>
                  <Input
                    value={trfKet}
                    onChange={(e) => setTrfKet(e.target.value)}
                    placeholder="Opsional — mis. setor ke bank"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-copper-100 pt-2 gap-2">
                  <span className="text-xs text-muted inline-flex items-center gap-1">
                    <ArrowLeftRight size={14} />
                    Dana dipindahkan antar akun tanpa mengubah total keuangan desa.
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={RotateCcw}
                      className="h-8 text-xs"
                      onClick={resetFormTransfer}
                      disabled={trfBusy}
                    >
                      Reset
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        trfBusy ||
                        !trfJumlah ||
                        Number(trfJumlah) <= 0 ||
                        trfAsalId === trfTujuanId
                      }
                      className="h-8 text-xs"
                    >
                      {trfBusy ? "Menyimpan…" : editingTransferId ? "Simpan perubahan" : "Simpan transfer"}
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          ) : (
            <p className="text-sm text-muted">Hanya admin yang dapat mencatat transfer antar akun.</p>
          )}

          <Card title="Riwayat transfer" className={cn("mt-4", LIST_CARD, isPhone && LIST_CARD_PHONE, LIST_TABLE)}>
            <div className="mb-3 max-w-sm">
              <Label className="text-[11px]">Cari transaksi</Label>
              <Input
                className="text-sm h-9"
                placeholder="Keterangan / akun…"
                value={trfQ}
                onChange={(e) => setTrfQ(e.target.value)}
              />
            </div>
            {isPhone ? (
              <ul className="space-y-2">
                {filteredRiwayatTransfer.length === 0 ? (
                  <li className="py-6 text-center text-xs text-muted">
                    {loading
                      ? "Memuat…"
                      : trfQ.trim()
                        ? "Tidak ada transfer yang cocok dengan pencarian."
                        : "Belum ada transfer."}
                  </li>
                ) : (
                  filteredRiwayatTransfer.map((r) => (
                    <li key={r.id} className={PHONE_ROW_CARD}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] text-muted">{formatTanggalLahir(r.tanggal)}</p>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-copper-950">
                          {formatRupiah(r.jumlah)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-copper-900">
                        <span className="font-medium">{r.akun_asal_nama}</span>
                        <span className="text-muted"> → </span>
                        <span className="font-medium">{r.akun_tujuan_nama}</span>
                      </p>
                      {r.keterangan && (
                        <p className="mt-1 text-[11px] text-muted leading-snug">{r.keterangan}</p>
                      )}
                      {canEdit && (
                        <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            icon={Pencil}
                            className="h-10 justify-center text-xs"
                            disabled={editTransferLoading}
                            onClick={() => void mulaiEditTransfer(r.id)}
                          >
                            Ubah
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            icon={Trash2}
                            className="h-10 justify-center text-xs"
                            onClick={() => setDeleteTransferId(r.id)}
                          >
                            Hapus
                          </Button>
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="overflow-x-auto app-scroll-x">
                <table className={LIST_TABLE_ELEMENT}>
                  <thead>
                    <tr className={LIST_HEAD_ROW}>
                      <th>Tanggal</th>
                      <th>Dari</th>
                      <th>Ke</th>
                      <th className="pr-3 text-right">Jumlah</th>
                      <th className="pr-3">Keterangan</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRiwayatTransfer.length === 0 && (
                      <tr>
                        <td colSpan={canEdit ? 6 : 5} className="py-4 text-center text-muted text-xs">
                          {loading
                            ? "Memuat…"
                            : trfQ.trim()
                              ? "Tidak ada transfer yang cocok dengan pencarian."
                              : "Belum ada transfer."}
                        </td>
                      </tr>
                    )}
                    {filteredRiwayatTransfer.map((r) => (
                      <tr key={r.id} className="border-b border-copper-100">
                        <td className="pr-3 py-1 whitespace-nowrap">{formatTanggalLahir(r.tanggal)}</td>
                        <td className="pr-3">{r.akun_asal_nama}</td>
                        <td className="pr-3">{r.akun_tujuan_nama}</td>
                        <td className="pr-3 text-right tabular-nums font-medium">{formatRupiah(r.jumlah)}</td>
                        <td className="pr-3 text-muted text-xs truncate max-w-xs">{r.keterangan ?? "—"}</td>
                        {canEdit && (
                          <td>
                            <span className="inline-flex">
                              <Button
                                type="button"
                                variant="ghost"
                                icon={Pencil}
                                iconOnly
                                title="Ubah"
                                disabled={editTransferLoading}
                                onClick={() => void mulaiEditTransfer(r.id)}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                icon={Trash2}
                                iconOnly
                                title="Hapus"
                                onClick={() => setDeleteTransferId(r.id)}
                              />
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "pemasukan" && (
        <>
          {canEdit ? (
            <Card title={editingPmId ? "Ubah pemasukan" : "Catat pemasukan"}>
              {editingPmId && (
                <p className="text-xs text-copper-800 bg-copper-50 border border-copper-200 rounded px-2 py-1 mb-2">
                  Mengubah transaksi {formatTanggalLahir(pmTanggal)} —{" "}
                  <button
                    type="button"
                    className="text-copper-900 underline hover:no-underline"
                    onClick={resetFormPemasukan}
                  >
                    Batal ubah
                  </button>
                </p>
              )}
              <form onSubmit={simpanPemasukan} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.6fr)]">
                  <div className="min-w-0">
                    <Label className="text-[11px]">Tanggal</Label>
                    <DateInput value={pmTanggal} onChange={setPmTanggal} required />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[11px]">Masuk ke akun</Label>
                    <Select value={pmAkunId} onChange={(e) => setPmAkunId(e.target.value)} required>
                      {akunTransaksional.map((a) => (
                        <option key={a.id} value={a.id}>
                          {resolveAkunDisplayNama(a, akun)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[11px]">Keterangan</Label>
                    <Input
                      value={pmKet}
                      onChange={(e) => setPmKet(e.target.value)}
                      placeholder="Mis. Donasi dari lembaga X"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-copper-900">Pos pemasukan</p>
                  {pmBaris.map((b, i) => (
                    <div key={b.key} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className={POS_ROW_POS_CLASS}>
                        <Label className="text-[10px]">Pos</Label>
                        <Select
                          value={b.posPemasukanId}
                          onChange={(e) => {
                            const next = [...pmBaris];
                            next[i] = { ...b, posPemasukanId: e.target.value };
                            setPmBaris(next);
                          }}
                          required
                        >
                          <option value="">Pilih pos</option>
                          {posPemasukan.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nama}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className={POS_ROW_JUMLAH_CLASS}>
                        <Label className="text-[10px]">Jumlah</Label>
                        <RupiahInput
                          className="h-8 text-sm"
                          value={b.jumlah || ""}
                          onChange={(v) => {
                            const next = [...pmBaris];
                            next[i] = { ...b, jumlah: v === "" ? 0 : v };
                            setPmBaris(next);
                          }}
                          required
                        />
                      </div>
                      <div className="flex-1 min-w-[8rem]">
                        <Label className="text-[10px]">Ket. baris</Label>
                        <Input
                          value={b.keterangan ?? ""}
                          onChange={(e) => {
                            const next = [...pmBaris];
                            next[i] = { ...b, keterangan: e.target.value };
                            setPmBaris(next);
                          }}
                        />
                      </div>
                      {pmBaris.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          icon={Trash2}
                          className="h-8"
                          onClick={() => setPmBaris(pmBaris.filter((_, j) => j !== i))}
                        />
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    icon={Plus}
                    className="h-7 text-xs"
                    onClick={() => setPmBaris([...pmBaris, emptyPosMasukBaris()])}
                  >
                    Tambah pos
                  </Button>
                </div>
                <div className="flex items-center justify-between border-t border-copper-100 pt-2 gap-2">
                  <span className="text-sm font-semibold">Total: {formatRupiah(totalPm)}</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={RotateCcw}
                      className="h-8 text-xs"
                      onClick={resetFormPemasukan}
                      disabled={pmBusy}
                    >
                      Reset
                    </Button>
                    <Button type="submit" disabled={pmBusy || totalPm <= 0} className="h-8 text-xs">
                      {pmBusy ? "Menyimpan…" : editingPmId ? "Simpan perubahan" : "Simpan pemasukan"}
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          ) : (
            <p className="text-sm text-muted">Hanya admin yang dapat mencatat pemasukan.</p>
          )}

          <p className="text-xs text-muted leading-snug mt-4 mb-2 px-1">
            Transaksi biaya admin IPMA/Pemasih tercatat dengan keterangan{" "}
            <span className="font-mono text-[11px]">IPMA terbit baru — …</span> atau{" "}
            <span className="font-mono text-[11px]">IPMA perpanjangan — …</span>. Menghapus transaksi
            melepas tautan dari arsip surat; arsip tetap ada.
          </p>

          <Card title="Riwayat pemasukan" className={cn("mt-2", LIST_CARD, isPhone && LIST_CARD_PHONE, LIST_TABLE)}>
            <div className="mb-3 max-w-sm">
              <Label className="text-[11px]">Cari transaksi</Label>
              <Input
                className="text-sm h-9"
                placeholder="Ket. umum / ket. baris / akun…"
                value={pmQ}
                onChange={(e) => setPmQ(e.target.value)}
              />
            </div>
            {isPhone ? (
              <ul className="space-y-2">
                {filteredRiwayatMasuk.length === 0 ? (
                  <li className="py-6 text-center text-xs text-muted">
                    {loading
                      ? "Memuat…"
                      : pmQ.trim()
                        ? "Tidak ada pemasukan yang cocok dengan pencarian."
                        : "Belum ada pemasukan tercatat."}
                  </li>
                ) : (
                  filteredRiwayatMasuk.map((r) => (
                    <li key={r.id} className={PHONE_ROW_CARD}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted">{formatTanggalLahir(r.tanggal)}</p>
                          <p className="truncate text-sm font-medium text-copper-950">{r.akun_keuangan_nama}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-emerald-800">
                          {formatRupiah(r.total_jumlah ?? 0)}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-muted leading-snug">{r.keterangan ?? "—"}</p>
                      {canEdit && (
                        <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            icon={Pencil}
                            className="h-10 justify-center text-xs"
                            disabled={editPmLoading}
                            onClick={() => void mulaiEditPemasukan(r.id)}
                          >
                            Ubah
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            icon={Trash2}
                            className="h-10 justify-center text-xs"
                            onClick={() => setDeletePmId(r.id)}
                          >
                            Hapus
                          </Button>
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="overflow-x-auto app-scroll-x">
                <table className={LIST_TABLE_ELEMENT}>
                  <thead>
                    <tr className={LIST_HEAD_ROW}>
                      <th>Tanggal</th>
                      <th>Akun</th>
                      <th className="text-right">Total</th>
                      <th className="pr-3">Keterangan</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRiwayatMasuk.length === 0 && (
                      <tr>
                        <td colSpan={canEdit ? 5 : 4} className="py-4 text-center text-muted text-xs">
                          {loading
                            ? "Memuat…"
                            : pmQ.trim()
                              ? "Tidak ada pemasukan yang cocok dengan pencarian."
                              : "Belum ada pemasukan tercatat."}
                        </td>
                      </tr>
                    )}
                    {filteredRiwayatMasuk.map((r) => (
                      <tr key={r.id} className="border-b border-copper-100">
                        <td className="pr-3 py-1">{formatTanggalLahir(r.tanggal)}</td>
                        <td className="pr-3">{r.akun_keuangan_nama}</td>
                        <td className="pr-3 text-right tabular-nums">{formatRupiah(r.total_jumlah ?? 0)}</td>
                        <td className="pr-3 text-muted text-xs truncate max-w-xs">{r.keterangan ?? "—"}</td>
                        {canEdit && (
                          <td>
                            <span className="inline-flex">
                              <Button
                                type="button"
                                variant="ghost"
                                icon={Pencil}
                                iconOnly
                                title="Ubah"
                                disabled={editPmLoading}
                                onClick={() => void mulaiEditPemasukan(r.id)}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                icon={Trash2}
                                iconOnly
                                title="Hapus"
                                onClick={() => setDeletePmId(r.id)}
                              />
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "pengeluaran" && (
        <>
          {canEdit ? (
            <Card title={editingId ? "Ubah pengeluaran" : "Catat pengeluaran"}>
              {editingId && (
                <p className="text-xs text-copper-800 bg-copper-50 border border-copper-200 rounded px-2 py-1 mb-2">
                  Mengubah transaksi {formatTanggalLahir(pgTanggal)} —{" "}
                  <button
                    type="button"
                    className="text-copper-900 underline hover:no-underline"
                    onClick={resetFormPengeluaran}
                  >
                    Batal ubah
                  </button>
                </p>
              )}
              <form onSubmit={simpanPengeluaran} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.6fr)]">
                  <div className="min-w-0">
                    <Label className="text-[11px]">Tanggal</Label>
                    <DateInput value={pgTanggal} onChange={setPgTanggal} required />
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[11px]">Dibayar dari akun</Label>
                    <Select value={pgAkunId} onChange={(e) => setPgAkunId(e.target.value)} required>
                      {akunTransaksional.map((a) => (
                        <option key={a.id} value={a.id}>
                          {resolveAkunDisplayNama(a, akun)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[11px]">Keterangan umum</Label>
                    <Input value={pgKet} onChange={(e) => setPgKet(e.target.value)} placeholder="Opsional" />
                  </div>
                </div>
                {isPgKasDudukan && pgAkunId && (
                  <KasDudukanPlafonPanel
                    akunKeuanganId={pgAkunId}
                    tanggal={pgTanggal}
                    baris={pgBaris}
                    excludeTransaksiId={editingId}
                  />
                )}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-copper-900">
                    Pos biaya
                    {isPgKasDudukan && (
                      <span className="font-normal text-muted ml-1">(hanya alokasi Dana Dudukan)</span>
                    )}
                  </p>
                  {pgBaris.map((b, i) => (
                    <div key={b.key} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                      <div className={POS_ROW_POS_CLASS}>
                        <Label className="text-[10px]">Pos</Label>
                        <Select
                          value={b.posBiayaId}
                          onChange={(e) => {
                            const next = [...pgBaris];
                            next[i] = { ...b, posBiayaId: e.target.value };
                            setPgBaris(next);
                          }}
                          required
                        >
                          <option value="">Pilih pos</option>
                          {posUntukPengeluaran.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nama}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className={POS_ROW_JUMLAH_CLASS}>
                        <Label className="text-[10px]">Jumlah</Label>
                        <RupiahInput
                          className="h-8 text-sm"
                          value={b.jumlah || ""}
                          onChange={(v) => {
                            const next = [...pgBaris];
                            next[i] = { ...b, jumlah: v === "" ? 0 : v };
                            setPgBaris(next);
                          }}
                          required
                        />
                      </div>
                      <div className="flex-1 min-w-[8rem]">
                        <Label className="text-[10px]">Ket. baris</Label>
                        <Input
                          value={b.keterangan ?? ""}
                          onChange={(e) => {
                            const next = [...pgBaris];
                            next[i] = { ...b, keterangan: e.target.value };
                            setPgBaris(next);
                          }}
                        />
                      </div>
                      {pgBaris.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          icon={Trash2}
                          className="h-8"
                          onClick={() => setPgBaris(pgBaris.filter((_, j) => j !== i))}
                        />
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    icon={Plus}
                    className="h-7 text-xs"
                    onClick={() => setPgBaris([...pgBaris, emptyPosBaris()])}
                  >
                    Tambah pos
                  </Button>
                </div>
                <div className="flex items-center justify-between border-t border-copper-100 pt-2 gap-2">
                  <span className="text-sm font-semibold">Total: {formatRupiah(totalPg)}</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={RotateCcw}
                      className="h-8 text-xs"
                      onClick={resetFormPengeluaran}
                      disabled={pgBusy}
                    >
                      Reset
                    </Button>
                    <Button type="submit" disabled={pgBusy || totalPg <= 0} className="h-8 text-xs">
                      {pgBusy ? "Menyimpan…" : editingId ? "Simpan perubahan" : "Simpan pengeluaran"}
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          ) : (
            <p className="text-sm text-muted">Hanya admin yang dapat mencatat pengeluaran.</p>
          )}

          <Card title="Riwayat pengeluaran" className={cn("mt-4", LIST_CARD, isPhone && LIST_CARD_PHONE, LIST_TABLE)}>
            <div className="mb-3 max-w-sm">
              <Label className="text-[11px]">Cari transaksi</Label>
              <Input
                className="text-sm h-9"
                placeholder="Ket. umum / ket. baris / akun…"
                value={pgQ}
                onChange={(e) => setPgQ(e.target.value)}
              />
            </div>
            {isPhone ? (
              <ul className="space-y-2">
                {loading ? (
                  <li className="py-6 text-center text-xs text-muted">Memuat…</li>
                ) : pagedRiwayatKeluar.length === 0 ? (
                  <li className="py-6 text-center text-xs text-muted">
                    {pgQ.trim()
                      ? "Tidak ada pengeluaran yang cocok dengan pencarian."
                      : "Belum ada pengeluaran tercatat."}
                  </li>
                ) : (
                  pagedRiwayatKeluar.map((r) => (
                    <li key={r.id} className={PHONE_ROW_CARD}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-muted">{formatTanggalLahir(r.tanggal)}</p>
                          <p className="truncate text-sm font-medium text-copper-950">{r.akun_keuangan_nama}</p>
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-red-800">
                          {formatRupiah(r.total_jumlah ?? 0)}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-muted leading-snug">{r.keterangan ?? "—"}</p>
                      {canEdit && (
                        <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            icon={Pencil}
                            className="h-10 justify-center text-xs"
                            disabled={editLoading}
                            onClick={() => void mulaiEditPengeluaran(r.id)}
                          >
                            Ubah
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            icon={Trash2}
                            className="h-10 justify-center text-xs"
                            onClick={() => setDeleteId(r.id)}
                          >
                            Hapus
                          </Button>
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            ) : (
              <div className="overflow-x-auto app-scroll-x">
                <table className={LIST_TABLE_ELEMENT}>
                  <thead>
                    <tr className={LIST_HEAD_ROW}>
                      <th>Tanggal</th>
                      <th>Akun</th>
                      <th className="text-right">Total</th>
                      <th className="pr-3">Keterangan</th>
                      {canEdit && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={canEdit ? 5 : 4} className="py-4 text-center text-muted text-sm">
                          Memuat…
                        </td>
                      </tr>
                    ) : pagedRiwayatKeluar.length === 0 ? (
                      <tr>
                        <td colSpan={canEdit ? 5 : 4} className="py-4 text-center text-muted text-sm">
                          {pgQ.trim()
                            ? "Tidak ada pengeluaran yang cocok dengan pencarian."
                            : "Belum ada pengeluaran tercatat."}
                        </td>
                      </tr>
                    ) : (
                      pagedRiwayatKeluar.map((r) => (
                        <tr key={r.id} className="border-b border-copper-100">
                          <td className="pr-3 py-1">{formatTanggalLahir(r.tanggal)}</td>
                          <td className="pr-3">{r.akun_keuangan_nama}</td>
                          <td className="pr-3 text-right tabular-nums">{formatRupiah(r.total_jumlah ?? 0)}</td>
                          <td className="pr-3 text-muted text-xs truncate max-w-xs">{r.keterangan ?? "—"}</td>
                          {canEdit && (
                            <td>
                              <span className="inline-flex">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  icon={Pencil}
                                  iconOnly
                                  title="Ubah"
                                  disabled={editLoading}
                                  onClick={() => void mulaiEditPengeluaran(r.id)}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  icon={Trash2}
                                  iconOnly
                                  title="Hapus"
                                  onClick={() => setDeleteId(r.id)}
                                />
                              </span>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <ListPagination
              page={pengeluaranSafePage}
              totalItems={filteredRiwayatKeluar.length}
              pageSize={pengeluaranPageSize}
              onPageChange={setPengeluaranPage}
              onPageSizeChange={setPengeluaranPageSize}
              compact
            />
          </Card>
        </>
      )}

      <ConfirmDialog
        open={deletePmId != null}
        title="Hapus pemasukan?"
        message="Transaksi pemasukan akan dihapus dari buku kas. Jika terkait arsip IPMA atau riwayat Pemasih, tautan ke transaksi ini dilepas — arsip surat/riwayat tetap ada."
        confirmLabel="Ya, hapus"
        busy={deletePmBusy}
        onConfirm={() => void confirmHapusPemasukan()}
        onCancel={() => {
          if (!deletePmBusy) setDeletePmId(null);
        }}
      />

      <ConfirmDialog
        open={deleteId != null}
        title="Hapus pengeluaran?"
        message="Transaksi pengeluaran akan dihapus dari buku kas."
        confirmLabel="Ya, hapus"
        busy={deleteBusy}
        onConfirm={() => void confirmHapusPengeluaran()}
        onCancel={() => {
          if (!deleteBusy) setDeleteId(null);
        }}
      />

      <ConfirmDialog
        open={deleteTransferId != null}
        title="Hapus transfer?"
        message="Transfer akan dihapus dan saldo kedua akun dikembalikan seperti semula."
        confirmLabel="Ya, hapus"
        busy={deleteTransferBusy}
        onConfirm={() => void confirmHapusTransfer()}
        onCancel={() => {
          if (!deleteTransferBusy) setDeleteTransferId(null);
        }}
      />
    </div>
  );
}
