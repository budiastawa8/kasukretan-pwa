import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, QrCode } from "lucide-react";
import { usePetugasAuth } from "../../context/PetugasAuthContext";
import { formatRupiah } from "../../lib/paturunan-hitung";
import {
  fetchAkunKeuangan,
  fetchBanjar,
  fetchIuran,
  fetchTim,
  fetchTunggakanPaturunan,
  fetchTunggakanPaturunanLookup,
  postPembayaranPaturunan,
  type AkunKeuanganApi,
  type TunggakanPaturunanApi,
} from "../../lib/api/petugas";
import {
  PETUGAS_STRUK_PREVIEW_PATH,
  stashPetugasStrukPreview,
} from "../../lib/petugas-struk-preview";
import type { StrukPaturunanPdfPayload } from "../../lib/struk-pembayaran-paturunan-pdf";
import { parseKartuQrPayload } from "../../lib/kartu-qr";
import { pickPetugasIdForTim } from "../../lib/petugas-session";
import { PetugasKartuQrScanner } from "../../components/petugas/PetugasKartuQrScanner";
import { Button } from "../../components/ui/Button";
import { DateInput } from "../../components/ui/DateInput";
import { Input, Label, Select } from "../../components/ui/Input";
import { RupiahInput } from "../../components/ui/RupiahInput";
import type { RupiahInputValue } from "../../lib/rupiah-input";
import { Card } from "../../components/ui/Card";
import { today } from "../../lib/utils";

function errMsg(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return "Terjadi kesalahan tidak diketahui";
}

function RingkasanPaturunan({
  row,
}: {
  row: { kepala_nama: string; jenis_nama: string | null; tempek_nama: string | null };
}) {
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="font-semibold text-sm text-copper-900 leading-snug">{row.kepala_nama}</p>
      <p className="text-xs text-muted">{row.jenis_nama?.trim() || "—"}</p>
      <p className="text-xs text-muted">{row.tempek_nama?.trim() || "—"}</p>
    </div>
  );
}

export function PetugasPaturunanPage() {
  const navigate = useNavigate();
  const { user } = usePetugasAuth();
  const [banjar, setBanjar] = useState<{ id: string; nama: string }[]>([]);
  const [iuran, setIuran] = useState<{ id: string; nama: string }[]>([]);
  const [tim, setTim] = useState<{ id: string; nama: string; banjar_id: string }[]>([]);
  const [akunList, setAkunList] = useState<AkunKeuanganApi[]>([]);
  const [banjarId, setBanjarId] = useState("");
  const [iuranId, setIuranId] = useState("");
  const [petugasId, setPetugasId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<TunggakanPaturunanApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [payRow, setPayRow] = useState<TunggakanPaturunanApi | null>(null);
  const [payError, setPayError] = useState("");
  const [jumlah, setJumlah] = useState<RupiahInputValue>("");
  const [tanggal, setTanggal] = useState(today());
  const [akunKeuanganId, setAkunKeuanganId] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [strukPayload, setStrukPayload] = useState<StrukPaturunanPdfPayload | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [b, i, akun] = await Promise.all([
          fetchBanjar(),
          fetchIuran(),
          fetchAkunKeuangan("paturunan"),
        ]);
        setBanjar(b);
        setIuran(i);
        setAkunList(akun);
        setAkunKeuanganId(akun[0]?.id ?? "");
        if (i[0]) setIuranId(i[0].id);
      } catch (e) {
        setError(errMsg(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!banjar.length) return;
    fetchTim(banjarId || undefined)
      .then((t) => {
        setTim(t);
        setPetugasId(pickPetugasIdForTim(t, user));
      })
      .catch((e) => setError(errMsg(e)));
  }, [banjarId, banjar, user]);

  const load = useCallback(async () => {
    if (!iuranId) return;
    setLoading(true);
    setError("");
    try {
      setRows(
        await fetchTunggakanPaturunan({
          banjarId: banjarId || undefined,
          iuranId,
          q: q || undefined,
        })
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [banjarId, iuranId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function bukaBayar(r: TunggakanPaturunanApi) {
    setPayRow(r);
    setPayError("");
    setSuccess("");
    setStrukPayload(null);
    setScanError("");
    setJumlah(r.sisa);
    setTanggal(today());
    setKeterangan("");
    if (!akunKeuanganId && akunList[0]) setAkunKeuanganId(akunList[0].id);
  }

  const handleQrScan = useCallback(
    async (raw: string) => {
      setScanOpen(false);
      setScanError("");
      if (!iuranId) {
        setScanError("Pilih iuran terlebih dahulu.");
        return;
      }
      const kartu = parseKartuQrPayload(raw);
      if (!kartu) {
        setScanError("QR tidak dikenali — pastikan kartu Kasukretan.");
        return;
      }
      try {
        const row = await fetchTunggakanPaturunanLookup({
          kartu,
          iuranId,
          banjarId: banjarId || undefined,
        });
        bukaBayar(row);
      } catch (e) {
        setScanError(errMsg(e));
      }
    },
    [banjarId, iuranId]
  );

  async function handleBayar() {
    if (!payRow || !iuranId) return;
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
      const amt = jumlah === "" ? 0 : jumlah;
      if (amt <= 0) {
        throw new Error("Jumlah pembayaran harus lebih dari 0");
      }
      const fresh = await fetchTunggakanPaturunan({
        banjarId: banjarId || undefined,
        iuranId,
        q: payRow.nomor_kartu,
      });
      const row = fresh.find((r) => r.id === payRow.id);
      if (!row || row.sisa <= 0) {
        throw new Error("Tagihan sudah lunas — muat ulang daftar tunggakan");
      }
      const result = await postPembayaranPaturunan({
        kramaId: payRow.id,
        iuranId,
        jumlah: amt,
        tanggal,
        petugasId,
        akunKeuanganId,
        keterangan: keterangan.trim() || undefined,
      });
      const total = result.wajib + result.punia;
      const msg =
        result.punia > 0
          ? `Berhasil: ${formatRupiah(result.wajib)} wajib + ${formatRupiah(result.punia)} punia`
          : `Berhasil: ${formatRupiah(result.wajib)} paturunan`;
      setSuccess(msg);
      const iuranNama = iuran.find((i) => i.id === iuranId)?.nama ?? "Paturunan";
      const akunNama = akunList.find((a) => a.id === akunKeuanganId)?.nama;
      const petugasNama = tim.find((t) => t.id === petugasId)?.nama ?? "—";
      setStrukPayload({
        filename: `struk-paturunan-${payRow.nomor_kartu.replace(/\W/g, "")}-${tanggal}`,
        iuranNama,
        krama: {
          nomor_kartu: payRow.nomor_kartu,
          kepala_nama: payRow.kepala_nama,
          banjar_nama: payRow.banjar_nama,
          jenis_nama: payRow.jenis_nama,
          tempek_nama: payRow.tempek_nama,
          arahan_nama: payRow.arahan_nama,
        },
        wajib: result.wajib,
        punia: result.punia,
        total,
        tanggal,
        petugasNama,
        akunNama,
        keterangan: keterangan.trim() || undefined,
      });
      setPayRow(null);
      await load();
    } catch (e) {
      const msg = errMsg(e);
      setPayError(msg);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function cetakStruk() {
    if (!strukPayload) return;
    stashPetugasStrukPreview({
      kind: "paturunan",
      payload: strukPayload,
      backTo: "/petugas/paturunan",
      backLabel: "Kembali ke paturunan",
    });
    navigate(PETUGAS_STRUK_PREVIEW_PATH);
  }

  return (
    <div className={`space-y-3${payRow ? " pb-28" : ""}`}>
      <h1 className="text-lg font-bold text-copper-900">Tunggakan Paturunan</h1>

      <div className="grid gap-2">
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
          <Label className="text-xs">Iuran</Label>
          <Select value={iuranId} onChange={(e) => setIuranId(e.target.value)}>
            {iuran.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nama}
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
            placeholder="Cari kartu / nama / anggota…"
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
      </div>

      {scanError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {scanError}
        </p>
      )}
      {scanOpen && (
        <PetugasKartuQrScanner onScan={(raw) => void handleQrScan(raw)} onClose={() => setScanOpen(false)} />
      )}

      <p className="text-[11px] text-muted">
        Pilih iuran yang sama dengan desktop. Filter banjar kosong = tampilkan semua banjar (seperti
        halaman Paturunan desktop).
      </p>

      {tim.length === 0 && banjarId && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Banjar ini belum punya tim di cloud. Kirim master dari desktop (Pengaturan → tab Modul
          Online) agar pembayaran bisa disimpan.
        </p>
      )}

      {akunList.length === 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Belum ada akun keuangan di cloud. Sinkronkan master dari desktop terlebih dahulu.
        </p>
      )}

      {success && (
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
      {error && !payRow && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Tidak ada tunggakan.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full text-left rounded-lg border border-copper-200 bg-card px-3 py-2 hover:border-copper-400"
                onClick={() => bukaBayar(r)}
              >
                <RingkasanPaturunan row={r} />
                <p className="text-xs font-semibold text-amber-900 mt-1.5">
                  Sisa {formatRupiah(r.sisa)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {payRow && (
        <Card className="fixed inset-x-0 bottom-16 mx-auto max-w-md z-20 shadow-lg border-copper-300 space-y-2 max-h-[min(70vh,28rem)] overflow-y-auto">
          <RingkasanPaturunan row={payRow} />
          <p className="text-xs text-muted">Sisa wajib {formatRupiah(payRow.sisa)}</p>
          <p className="text-[11px] text-muted">
            Kelebihan bayar otomatis masuk punia (sukarela).
          </p>

          <div>
            <Label className="text-xs">Jumlah</Label>
            <RupiahInput value={jumlah} onChange={setJumlah} className="h-9 text-sm" />
          </div>
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
            <Button variant="secondary" className="flex-1" onClick={() => setPayRow(null)}>
              Batal
            </Button>
            <Button
              className="flex-1"
              onClick={() => void handleBayar()}
              disabled={busy || !petugasId || !akunKeuanganId}
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
