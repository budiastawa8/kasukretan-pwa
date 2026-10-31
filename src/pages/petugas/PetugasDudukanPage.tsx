import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, QrCode } from "lucide-react";
import { usePetugasAuth } from "../../context/PetugasAuthContext";
import { formatBulanIndonesia, formatRupiah } from "../../lib/dudukan-hitung";
import {
  fetchAkunKeuangan,
  fetchBanjar,
  fetchBulanTunggakanDudukan,
  fetchKramaDudukanLookup,
  fetchKramaDudukanPetugas,
  fetchTim,
  postPembayaranDudukan,
  postPembayaranDudukanMulti,
  type AkunKeuanganApi,
  type BulanTunggakanDudukanApi,
  type KramaDudukanPetugasApi,
} from "../../lib/api/petugas";
import { parseKartuQrPayload } from "../../lib/kartu-qr";
import {
  PETUGAS_STRUK_PREVIEW_PATH,
  stashPetugasStrukPreview,
} from "../../lib/petugas-struk-preview";
import { pickPetugasIdForTim } from "../../lib/petugas-session";
import type { StrukDudukanPdfPayload } from "../../lib/struk-pembayaran-dudukan-pdf";
import { PetugasKartuQrScanner } from "../../components/petugas/PetugasKartuQrScanner";
import { Button } from "../../components/ui/Button";
import { DateInput } from "../../components/ui/DateInput";
import { Input, Label, Select } from "../../components/ui/Input";
import { RupiahInput } from "../../components/ui/RupiahInput";
import type { RupiahInputValue } from "../../lib/rupiah-input";
import { Card } from "../../components/ui/Card";
import { today } from "../../lib/utils";

type BulanPilih = BulanTunggakanDudukanApi & {
  dipilih: boolean;
  jumlahInput: RupiahInputValue;
};

function periodeKey(tahun: number, bulan: number) {
  return `${tahun}-${bulan}`;
}

function formatRingkasanDudukan(r: {
  kepala_nama: string;
  jenis_nama: string;
  banjar_nama: string;
}) {
  return {
    nama: r.kepala_nama,
    jenis: r.jenis_nama?.trim() || "—",
    banjar: r.banjar_nama,
  };
}

function RingkasanDudukan({
  krama,
}: {
  krama: { kepala_nama: string; jenis_nama: string; banjar_nama: string };
}) {
  const r = formatRingkasanDudukan(krama);
  return (
    <div className="space-y-0.5 min-w-0 flex-1">
      <p className="font-semibold text-sm text-copper-900 leading-snug">{r.nama}</p>
      <p className="text-xs text-muted">{r.jenis}</p>
      <p className="text-xs text-muted">{r.banjar}</p>
    </div>
  );
}

export function PetugasDudukanPage() {
  const navigate = useNavigate();
  const { user } = usePetugasAuth();
  const [banjar, setBanjar] = useState<{ id: string; nama: string }[]>([]);
  const [tim, setTim] = useState<{ id: string; nama: string; banjar_id: string }[]>([]);
  const [akunList, setAkunList] = useState<AkunKeuanganApi[]>([]);
  const [banjarId, setBanjarId] = useState("");
  const [petugasId, setPetugasId] = useState("");
  const [q, setQ] = useState("");
  const [kramaRows, setKramaRows] = useState<KramaDudukanPetugasApi[]>([]);
  const [selectedKrama, setSelectedKrama] = useState<KramaDudukanPetugasApi | null>(null);
  const [bulanList, setBulanList] = useState<BulanPilih[]>([]);
  const [loadingKrama, setLoadingKrama] = useState(false);
  const [loadingBulan, setLoadingBulan] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [payError, setPayError] = useState("");
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [tanggal, setTanggal] = useState(today());
  const [akunKeuanganId, setAkunKeuanganId] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [strukPayload, setStrukPayload] = useState<StrukDudukanPdfPayload | null>(null);

  const dipilihItems = useMemo(
    () =>
      bulanList.filter((b) => b.dipilih && b.sisa > 0).map((b) => ({
        tahun: b.tahun,
        bulan: b.bulan,
        jumlah: b.jumlahInput === "" ? 0 : b.jumlahInput,
      })),
    [bulanList]
  );

  const totalBayar = useMemo(
    () => dipilihItems.reduce((sum, i) => sum + (Number.isFinite(i.jumlah) ? i.jumlah : 0), 0),
    [dipilihItems]
  );

  const adaDipilih = dipilihItems.length > 0 && totalBayar > 0;

  useEffect(() => {
    Promise.all([fetchBanjar(), fetchAkunKeuangan("dudukan")])
      .then(([b, akun]) => {
        setBanjar(b);
        setAkunList(akun);
        setAkunKeuanganId(akun[0]?.id ?? "");
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!banjar.length) return;
    fetchTim(banjarId || undefined)
      .then((t) => {
        setTim(t);
        setPetugasId(pickPetugasIdForTim(t, user));
      })
      .catch((e) => setError(String(e)));
  }, [banjarId, banjar, user]);

  const loadKrama = useCallback(async () => {
    setLoadingKrama(true);
    setError("");
    try {
      setKramaRows(
        await fetchKramaDudukanPetugas({
          banjarId: banjarId || undefined,
          q: q.trim() || undefined,
          punyaTunggakan: !q.trim(),
        })
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingKrama(false);
    }
  }, [banjarId, q]);

  useEffect(() => {
    void loadKrama();
  }, [loadKrama]);

  const loadBulan = useCallback(async (kramaId: string) => {
    setLoadingBulan(true);
    setError("");
    try {
      const rows = await fetchBulanTunggakanDudukan(kramaId);
      setBulanList(
        rows.map((b) => ({
          ...b,
          dipilih: false,
          jumlahInput: "",
        }))
      );
    } catch (e) {
      setError(String(e));
      setBulanList([]);
    } finally {
      setLoadingBulan(false);
    }
  }, []);

  function pilihKrama(krama: KramaDudukanPetugasApi) {
    setSelectedKrama(krama);
    setPaySheetOpen(false);
    setPayError("");
    setSuccess("");
    setStrukPayload(null);
    setScanError("");
    setTanggal(today());
    setKeterangan("");
    void loadBulan(krama.id);
  }

  const handleQrScan = useCallback(
    async (raw: string) => {
      setScanOpen(false);
      setScanError("");
      const kartu = parseKartuQrPayload(raw);
      if (!kartu) {
        setScanError("QR tidak dikenali — pastikan kartu Kasukretan.");
        return;
      }
      try {
        const krama = await fetchKramaDudukanLookup({
          kartu,
          banjarId: banjarId || undefined,
        });
        pilihKrama(krama);
      } catch (e) {
        setScanError(String(e));
      }
    },
    [banjarId]
  );

  function tutupKrama() {
    setSelectedKrama(null);
    setBulanList([]);
    setPaySheetOpen(false);
    setPayError("");
    setStrukPayload(null);
  }

  function toggleBulan(id: string, checked: boolean) {
    setBulanList((prev) =>
      prev.map((b) => {
        if (periodeKey(b.tahun, b.bulan) !== id) return b;
        if (b.sisa <= 0) return b;
        return {
          ...b,
          dipilih: checked,
          jumlahInput: checked ? (b.jumlahInput !== "" ? b.jumlahInput : b.sisa) : "",
        };
      })
    );
    setPayError("");
    setStrukPayload(null);
  }

  function setJumlahBulan(id: string, value: RupiahInputValue) {
    setBulanList((prev) =>
      prev.map((b) =>
        periodeKey(b.tahun, b.bulan) === id ? { ...b, jumlahInput: value } : b
      )
    );
  }

  /** Bayar semua tunggakan saja — bulan di muka (belum kewajiban) tidak ikut. */
  function isiSemuaSisa() {
    setBulanList((prev) =>
      prev.map((b) => {
        const tunggakan = b.sisa > 0 && !b.di_muka;
        return tunggakan
          ? { ...b, dipilih: true, jumlahInput: b.sisa }
          : { ...b, dipilih: false, jumlahInput: "" };
      })
    );
    setPaySheetOpen(true);
    setPayError("");
    setStrukPayload(null);
  }

  function bukaSheetBayar() {
    if (!adaDipilih) return;
    setPaySheetOpen(true);
    setPayError("");
    setTanggal(today());
    if (!akunKeuanganId && akunList[0]) setAkunKeuanganId(akunList[0].id);
  }

  async function handleBayar() {
    if (!selectedKrama || !adaDipilih) return;
    if (!petugasId) {
      setPayError("Pilih petugas — atau kirim data tim dari desktop ke cloud dulu");
      return;
    }
    if (!akunKeuanganId) {
      setPayError("Pilih akun penerimaan — atau sinkronkan master dari desktop dulu");
      return;
    }

    setBusy(true);
    setPayError("");
    setError("");
    try {
      const fresh = await fetchBulanTunggakanDudukan(selectedKrama.id);
      const freshMap = new Map(fresh.map((b) => [periodeKey(b.tahun, b.bulan), b]));

      const items = bulanList
        .filter((b) => b.dipilih && b.sisa > 0)
        .map((b) => {
          const amt = b.jumlahInput === "" ? 0 : b.jumlahInput;
          const row = freshMap.get(periodeKey(b.tahun, b.bulan));
          if (!row || row.sisa <= 0) {
            throw new Error(
              `Tagihan ${formatBulanIndonesia(b.bulan, b.tahun)} sudah lunas — muat ulang daftar`
            );
          }
          if (amt <= 0) {
            throw new Error(`Isi jumlah bayar untuk ${formatBulanIndonesia(b.bulan, b.tahun)}`);
          }
          if (amt > row.sisa) {
            throw new Error(
              `Jumlah ${formatBulanIndonesia(b.bulan, b.tahun)} melebihi sisa (${formatRupiah(row.sisa)})`
            );
          }
          return { tahun: b.tahun, bulan: b.bulan, jumlah: amt };
        });

      if (!items.length) {
        throw new Error("Pilih minimal satu bulan dan isi jumlah pembayaran");
      }

      const payTanggal = tanggal;
      const payKeterangan = keterangan.trim() || undefined;
      const petugasNama = tim.find((t) => t.id === petugasId)?.nama ?? "—";

      if (items.length === 1) {
        await postPembayaranDudukan({
          kramaId: selectedKrama.id,
          tahun: items[0]!.tahun,
          bulan: items[0]!.bulan,
          jumlah: items[0]!.jumlah,
          tanggal: payTanggal,
          petugasId,
          akunKeuanganId,
          keterangan: payKeterangan,
        });
      } else {
        await postPembayaranDudukanMulti({
          kramaId: selectedKrama.id,
          tanggal: payTanggal,
          petugasId,
          akunKeuanganId,
          keterangan: payKeterangan,
          items,
        });
      }

      const total = items.reduce((s, i) => s + i.jumlah, 0);
      const periodeLabel =
        items.length === 1
          ? formatBulanIndonesia(items[0]!.bulan, items[0]!.tahun)
          : `${items.length} bulan`;

      setSuccess(`Berhasil: dudukan ${periodeLabel} · ${formatRupiah(total)}`);
      setStrukPayload({
        filename: `struk-dudukan-${selectedKrama.nomor_kartu.replace(/\W/g, "")}-${payTanggal}`,
        krama: {
          pengajeg_nama: selectedKrama.kepala_nama,
          nomor_pemasih: selectedKrama.nomor_kartu,
          jenis_krama: selectedKrama.jenis_nama?.trim() || "—",
          alamat_pemasih: selectedKrama.alamat?.trim() || "—",
        },
        items: items.map((i) => ({
          tahun: i.tahun,
          bulan: i.bulan,
          jumlah: i.jumlah,
        })),
        total,
        tanggal: payTanggal,
        petugasNama,
      });

      setPaySheetOpen(false);
      setBulanList([]);
      await Promise.all([loadBulan(selectedKrama.id), loadKrama()]);
    } catch (e) {
      const msg = String(e);
      setPayError(msg);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function cetakStruk() {
    if (!strukPayload) return;
    stashPetugasStrukPreview({
      kind: "dudukan",
      payload: strukPayload,
      backTo: "/petugas/dudukan",
      backLabel: "Kembali ke dudukan",
    });
    navigate(PETUGAS_STRUK_PREVIEW_PATH);
  }

  return (
    <div
      className={`space-y-3${selectedKrama && adaDipilih && !paySheetOpen ? " pb-28" : paySheetOpen ? " pb-4" : ""}`}
    >
      <h1 className="text-lg font-bold text-copper-900">Pembayaran Dudukan</h1>

      <p className="text-[11px] text-muted">
        Pilih Krama Tamiu atau Tamiu, centang bulan tunggakan, lalu simpan pembayaran.
      </p>

      <div>
        <Label className="text-xs">Banjar</Label>
        <Select value={banjarId} onChange={(e) => setBanjarId(e.target.value)}>
          <option value="">Semua banjar</option>
          {banjar.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nama}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label className="text-xs">Petugas</Label>
        <Select
          value={petugasId}
          onChange={(e) => setPetugasId(e.target.value)}
          disabled={tim.length === 0}
        >
          {tim.length === 0 ? (
            <option value="">— belum ada petugas di cloud —</option>
          ) : (
            tim.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nama}
                {!banjarId ? ` (${banjar.find((b) => b.id === t.banjar_id)?.nama ?? ""})` : ""}
              </option>
            ))
          )}
        </Select>
      </div>
      <div className="flex gap-2">
        <Input
          className="flex-1"
          placeholder="Cari 4 digit akhir kartu / nama / anggota…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          icon={QrCode}
          className="shrink-0"
          onClick={() => {
            setScanError("");
            setScanOpen(true);
          }}
          title="Scan QR kartu"
        >
          Scan
        </Button>
      </div>
      {scanError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {scanError}
        </p>
      )}
      {scanOpen && (
        <PetugasKartuQrScanner onScan={(raw) => void handleQrScan(raw)} onClose={() => setScanOpen(false)} />
      )}

      {tim.length === 0 && banjarId && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Banjar ini belum punya tim di cloud. Kirim master dari desktop dulu.
        </p>
      )}

      {akunList.length === 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Belum ada akun keuangan di cloud. Sinkronkan master dari desktop terlebih dahulu.
        </p>
      )}

      {success && !selectedKrama && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
            {success}
          </p>
          {strukPayload && (
            <Button type="button" icon={Printer} className="w-full" onClick={cetakStruk}>
              Cetak struk
            </Button>
          )}
        </div>
      )}
      {error && !selectedKrama && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {!selectedKrama && (
        <>
          {loadingKrama ? (
            <p className="text-sm text-muted">Memuat krama…</p>
          ) : kramaRows.length === 0 ? (
            <p className="text-sm text-muted">
              {q.trim()
                ? "Tidak ada krama yang cocok."
                : "Tidak ada krama dengan tunggakan dudukan."}
            </p>
          ) : (
            <ul className="space-y-2">
              {kramaRows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-lg border border-copper-200 bg-card px-3 py-2 hover:border-copper-400"
                    onClick={() => pilihKrama(r)}
                  >
                    <RingkasanDudukan krama={r} />
                    <p className="text-xs font-semibold text-amber-900 mt-1.5">
                      {r.tunggakan_bulan > 0
                        ? `${r.tunggakan_bulan} bulan · sisa ${formatRupiah(r.total_sisa)}`
                        : r.total_sisa_dimuka > 0
                          ? `Bayar di muka · sisa ${formatRupiah(r.total_sisa_dimuka)}`
                          : "Lunas"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {selectedKrama && (
        <Card className="space-y-3 border-copper-300">
          <div className="flex items-start justify-between gap-2">
            <RingkasanDudukan krama={selectedKrama} />
            <Button type="button" variant="secondary" className="shrink-0 h-8 text-xs" onClick={tutupKrama}>
              Ganti krama
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-copper-900">Pilih periode dudukan</p>
            {bulanList.some((b) => b.sisa > 0 && !b.di_muka) && (
              <Button
                type="button"
                variant="secondary"
                className="h-7 text-xs px-2"
                onClick={isiSemuaSisa}
                title="Hanya tunggakan — bulan di muka tidak ikut"
              >
                Isi semua tunggakan
              </Button>
            )}
          </div>

          {success && (
            <div className="space-y-2">
              <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                {success}
              </p>
              {strukPayload && (
                <Button type="button" icon={Printer} className="w-full h-8 text-xs" onClick={cetakStruk}>
                  Cetak struk
                </Button>
              )}
            </div>
          )}
          {error && !paySheetOpen && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {error}
            </p>
          )}

          {loadingBulan ? (
            <p className="text-sm text-muted">Memuat bulan…</p>
          ) : bulanList.length === 0 ? (
            <p className="text-sm text-muted">Semua bulan sudah lunas.</p>
          ) : (
            <ul className="space-y-1.5">
              {bulanList.map((b) => {
                const id = periodeKey(b.tahun, b.bulan);
                return (
                  <li
                    key={id}
                    className={`rounded-md border px-2 py-1.5 text-sm ${
                      b.telat ? "border-amber-300 bg-amber-50/60" : "border-copper-200"
                    } ${b.di_muka ? "bg-green-50/40" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={b.dipilih}
                        disabled={b.sisa <= 0}
                        onChange={(e) => toggleBulan(id, e.target.checked)}
                        className="h-4 w-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-copper-900 whitespace-nowrap">
                          {formatBulanIndonesia(b.bulan, b.tahun)}
                        </span>
                        {b.di_muka && (
                          <span className="text-[10px] text-copper-700 ml-1">di muka</span>
                        )}
                        {b.telat && (
                          <span className="text-[10px] text-amber-800 ml-1">telat</span>
                        )}
                      </div>
                      <div className="shrink-0 w-[5.5rem]">
                        {b.dipilih ? (
                          <RupiahInput
                            className="h-8 text-xs px-1.5"
                            value={b.jumlahInput}
                            onChange={(v) => setJumlahBulan(id, v)}
                            showPrefix={false}
                            disabled={!b.dipilih}
                          />
                        ) : (
                          <span className="block text-right text-amber-900 font-semibold tabular-nums">
                            {formatRupiah(b.sisa)}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {selectedKrama && adaDipilih && !paySheetOpen && (
        <div className="fixed inset-x-0 bottom-16 z-20 mx-auto max-w-md px-4 py-2 bg-white/95 border-t border-copper-300 backdrop-blur-sm shadow-[0_-4px_16px_rgba(42,22,9,0.1)]">
          <Button type="button" className="w-full h-11 text-sm font-semibold" onClick={bukaSheetBayar}>
            Bayar {formatRupiah(totalBayar)} ({dipilihItems.length} bulan)
          </Button>
        </div>
      )}

      {selectedKrama && paySheetOpen && (
        <Card className="fixed inset-x-0 bottom-16 mx-auto max-w-md z-30 shadow-lg border-copper-300 space-y-2 max-h-[min(70vh,28rem)] overflow-y-auto">
          <RingkasanDudukan krama={selectedKrama} />
          <p className="text-xs font-medium text-copper-900 pt-1">
            {dipilihItems.length} bulan · total {formatRupiah(totalBayar)}
          </p>

          <div>
            <Label className="text-xs">Tanggal</Label>
            <DateInput value={tanggal} onChange={setTanggal} />
          </div>
          <div>
            <Label className="text-xs">Diterima di</Label>
            <Select
              value={akunKeuanganId}
              onChange={(e) => setAkunKeuanganId(e.target.value)}
              disabled={akunList.length === 0}
            >
              {akunList.length === 0 ? (
                <option value="">— belum ada akun —</option>
              ) : (
                akunList.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))
              )}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Keterangan (opsional)</Label>
            <Input
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Catatan pembayaran…"
            />
          </div>

          {payError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
              {payError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setPaySheetOpen(false)}>
              Batal
            </Button>
            <Button
              className="flex-1"
              onClick={() => void handleBayar()}
              disabled={busy || !petugasId || !akunKeuanganId || !adaDipilih}
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
