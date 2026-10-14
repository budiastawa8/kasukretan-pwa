import { useCallback, useEffect, useState } from "react";
import { Ban, HandCoins, ScanLine, Search, Wallet } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { KartuQrScanner } from "../components/KartuQrScanner";
import { PaturunanPembayaranDialog } from "../components/paturunan/PaturunanPembayaranDialog";
import { DudukanPembayaranDialog } from "../components/dudukan/DudukanPembayaranDialog";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { parseKartuQrPayload } from "../lib/kartu-qr";
import { formatRupiah } from "../lib/dudukan-hitung";
import {
  bolehPungutKrama,
  cariKramaPungut,
  findKramaByNomorKartu,
  getPetugasLapanganSaya,
  getRingkasanPungut,
  isKramaMipil,
  isKramaPemasih,
  type KramaPungut,
  type PetugasLapangan,
  type RingkasanPaturunanPungut,
  type RingkasanPungut,
} from "../lib/services/pungut";
import { listPembayaranBelumDisetor, type PembayaranSetoranItem } from "../lib/services/setoran";
import { cn, formatTanggalLahir } from "../lib/utils";

export function PungutPage() {
  const { user } = useAuth();
  const [petugas, setPetugas] = useState<PetugasLapangan | null>(null);
  const [petugasLoaded, setPetugasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [scanOpen, setScanOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hasilCari, setHasilCari] = useState<KramaPungut[]>([]);
  const [cariBusy, setCariBusy] = useState(false);

  const [krama, setKrama] = useState<KramaPungut | null>(null);
  const [ringkasan, setRingkasan] = useState<RingkasanPungut | null>(null);
  const [ringkasanLoading, setRingkasanLoading] = useState(false);

  const [bayarIuran, setBayarIuran] = useState<RingkasanPaturunanPungut | null>(null);
  const [bayarDudukan, setBayarDudukan] = useState(false);

  const [pegangan, setPegangan] = useState<PembayaranSetoranItem[]>([]);

  useEffect(() => {
    if (!user) return;
    void getPetugasLapanganSaya(user.id)
      .then(setPetugas)
      .catch((e) => setError(String(e)))
      .finally(() => setPetugasLoaded(true));
  }, [user]);

  const loadPegangan = useCallback(async () => {
    if (!petugas) return;
    try {
      setPegangan(await listPembayaranBelumDisetor(petugas.id));
    } catch (e) {
      setError(String(e));
    }
  }, [petugas]);

  useEffect(() => {
    void loadPegangan();
  }, [loadPegangan]);

  const loadRingkasan = useCallback(async (k: KramaPungut) => {
    setRingkasanLoading(true);
    try {
      setRingkasan(await getRingkasanPungut(k));
    } catch (e) {
      setError(String(e));
    } finally {
      setRingkasanLoading(false);
    }
  }, []);

  const pilihKrama = useCallback(
    (k: KramaPungut) => {
      setKrama(k);
      setRingkasan(null);
      setHasilCari([]);
      setError("");
      setFlash("");
      if (petugas && bolehPungutKrama(petugas, k) && k.status_krama === "aktif") {
        void loadRingkasan(k);
      }
    },
    [petugas, loadRingkasan]
  );

  const handleScan = useCallback(
    async (raw: string) => {
      setScanOpen(false);
      setError("");
      const nomor = parseKartuQrPayload(raw);
      if (!nomor) {
        setError("QR tidak dikenali sebagai kartu Kasukretan.");
        return;
      }
      try {
        const k = await findKramaByNomorKartu(nomor);
        if (!k) {
          setKrama(null);
          setError(`Kartu ${nomor} tidak ditemukan.`);
          return;
        }
        pilihKrama(k);
      } catch (e) {
        setError(String(e));
      }
    },
    [pilihKrama]
  );

  const onScan = useCallback((raw: string) => void handleScan(raw), [handleScan]);
  const closeScan = useCallback(() => setScanOpen(false), []);

  async function cari(e: React.FormEvent) {
    e.preventDefault();
    if (!petugas) return;
    setCariBusy(true);
    setError("");
    try {
      const rows = await cariKramaPungut(petugas, q);
      setHasilCari(rows);
      if (rows.length === 0) setError("Tidak ada krama yang cocok di wilayah Anda.");
    } catch (err) {
      setError(String(err));
    } finally {
      setCariBusy(false);
    }
  }

  function setelahBayar(message: string) {
    setFlash(message);
    if (krama) void loadRingkasan(krama);
    void loadPegangan();
  }

  if (!petugasLoaded) {
    return <p className="text-sm text-muted">Memuat…</p>;
  }

  if (!petugas) {
    return (
      <Card title="Pungut iuran">
        <p className="text-sm text-amber-900">
          Akun Anda belum dihubungkan ke nama di Tim Kasukretan. Minta admin membuka Pengaturan →
          Pengguna, lalu memilih nama petugas untuk akun ini.
        </p>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </Card>
    );
  }

  const totalPegangan = pegangan.reduce((s, p) => s + p.jumlah, 0);
  const diLuarWilayah = krama != null && !bolehPungutKrama(petugas, krama);
  const tidakAktif = krama != null && krama.status_krama !== "aktif";

  return (
    <div className="space-y-3 max-w-xl mx-auto">
      <Card title="Pungut iuran">
        <p className="text-sm text-copper-950 font-medium">
          {petugas.nama} <span className="text-muted font-normal">· {petugas.jabatan}</span>
        </p>
        <p className="text-xs text-muted">
          Wilayah: {petugas.semua_banjar ? "semua banjar" : `Banjar ${petugas.banjar_nama}`}
        </p>
        <Button
          type="button"
          icon={ScanLine}
          className="mt-3 h-12 w-full text-base"
          onClick={() => {
            setError("");
            setScanOpen(true);
          }}
        >
          Scan QR kartu
        </Button>
        <form onSubmit={cari} className="mt-2 flex gap-1.5">
          <Input
            className="h-10 text-sm"
            placeholder="Atau cari nama / nomor kartu"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            icon={Search}
            className="h-10 shrink-0"
            disabled={cariBusy || q.trim().length < 2}
          >
            Cari
          </Button>
        </form>
        {hasilCari.length > 0 && (
          <ul className="mt-2 divide-y divide-copper-100 border border-copper-100 rounded-md">
            {hasilCari.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  className="w-full text-left px-2 py-2 hover:bg-copper-50/60"
                  onClick={() => pilihKrama(k)}
                >
                  <span className="block text-sm font-medium text-copper-950">{k.kepala_nama}</span>
                  <span className="block text-[11px] text-muted">
                    {k.nomor_kartu} · Banjar {k.banjar_nama}
                    {k.tempek_nama ? ` · ${k.tempek_nama}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        {flash && (
          <p className="mt-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
            {flash}
          </p>
        )}
      </Card>

      {krama && (
        <Card title="Krama">
          <p className="font-mono text-[11px] text-copper-700">{krama.nomor_kartu}</p>
          <p className="text-base font-semibold text-copper-950 leading-snug">{krama.kepala_nama}</p>
          <p className="text-xs text-muted">
            Banjar {krama.banjar_nama}
            {krama.tempek_nama ? ` · Tempek ${krama.tempek_nama}` : ""}
            {krama.arahan_nama ? ` · ${krama.arahan_nama}` : ""}
          </p>

          {diLuarWilayah ? (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded px-2 py-2">
              <Ban size={16} className="shrink-0 mt-0.5" aria-hidden />
              Krama ini dari Banjar {krama.banjar_nama} — di luar wilayah pungut Anda.
            </p>
          ) : tidakAktif ? (
            <p className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-2">
              Krama berstatus tidak aktif — pembayaran tidak bisa dicatat.
            </p>
          ) : ringkasanLoading || !ringkasan ? (
            <p className="mt-3 text-xs text-muted">Memuat tagihan…</p>
          ) : (
            <div className="mt-3 space-y-2">
              {isKramaMipil(krama) &&
                (ringkasan.paturunan.length === 0 ? (
                  <p className="text-xs text-muted">Tidak ada iuran paturunan aktif.</p>
                ) : (
                  ringkasan.paturunan.map((r) => (
                    <div
                      key={r.iuran.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-copper-200 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-copper-950 truncate">
                          Paturunan {r.iuran.nama}
                        </p>
                        <p className="text-[11px] text-muted">
                          {r.tagihan > 0
                            ? r.sisa > 0
                              ? `Sisa ${formatRupiah(r.sisa)} dari ${formatRupiah(r.tagihan)}`
                              : "Lunas — pembayaran baru dicatat sebagai punia"
                            : "Tanpa tagihan wajib (punia)"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        icon={HandCoins}
                        className="h-10 shrink-0"
                        onClick={() => setBayarIuran(r)}
                      >
                        Bayar
                      </Button>
                    </div>
                  ))
                ))}
              {isKramaPemasih(krama) && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-copper-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-copper-950">Dudukan</p>
                    <p
                      className={cn(
                        "text-[11px]",
                        ringkasan.tunggakanDudukan > 0 ? "text-amber-900" : "text-muted"
                      )}
                    >
                      {ringkasan.tunggakanDudukan > 0
                        ? `Tunggakan ${formatRupiah(ringkasan.tunggakanDudukan)} (${ringkasan.bulanTunggakanDudukan} bulan)`
                        : "Tidak ada tunggakan"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    icon={HandCoins}
                    className="h-10 shrink-0"
                    onClick={() => setBayarDudukan(true)}
                  >
                    Bayar
                  </Button>
                </div>
              )}
              {!isKramaMipil(krama) && !isKramaPemasih(krama) && (
                <p className="text-xs text-muted">Krama ini tidak memiliki iuran yang bisa dipungut.</p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Uang yang saya pegang">
        <p className="flex items-center gap-1.5 text-sm">
          <Wallet size={16} className="text-amber-800" aria-hidden />
          Belum disetor: <strong className="tabular-nums">{formatRupiah(totalPegangan)}</strong>
          <span className="text-muted text-xs">({pegangan.length} transaksi)</span>
        </p>
        <p className="mt-1 text-[11px] text-muted leading-snug">
          Serahkan uang ini ke bendahara. Setelah bendahara menerima setoran, daftar ini kosong dan
          pembayaran tidak bisa dihapus lagi dari HP.
        </p>
        {pegangan.length > 0 && (
          <ul className="mt-2 divide-y divide-copper-100 border border-copper-100 rounded-md max-h-72 overflow-y-auto">
            {pegangan.map((p) => (
              <li key={`${p.sumber}:${p.id}`} className="flex items-start justify-between gap-2 px-2 py-1.5 text-xs">
                <span className="min-w-0">
                  <span className="text-muted">{formatTanggalLahir(p.tanggal)}</span>
                  {" · "}
                  <span className="font-medium text-copper-950">{p.kepala_nama}</span>
                  <span className="block text-muted truncate">{p.uraian}</span>
                </span>
                <span className="shrink-0 tabular-nums font-medium">{formatRupiah(p.jumlah)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {scanOpen && <KartuQrScanner onScan={onScan} onClose={closeScan} />}

      {krama && bayarIuran && (
        <PaturunanPembayaranDialog
          open
          onClose={() => setBayarIuran(null)}
          onSuccess={() => {
            void loadRingkasan(krama);
            void loadPegangan();
          }}
          onSaved={setelahBayar}
          canEdit
          kramaId={krama.id}
          iuranId={bayarIuran.iuran.id}
          nomorKartu={krama.nomor_kartu}
          kepalaNama={krama.kepala_nama}
          banjarId={krama.banjar_id}
          banjarNama={krama.banjar_nama}
          tempekNama={krama.tempek_nama}
          arahanNama={krama.arahan_nama}
          tagihan={bayarIuran.tagihan}
          lockedPetugasId={petugas.id}
        />
      )}

      {krama && bayarDudukan && (
        <DudukanPembayaranDialog
          open
          onClose={() => setBayarDudukan(false)}
          onSuccess={() => {
            void loadRingkasan(krama);
            void loadPegangan();
          }}
          onSaved={setelahBayar}
          canEdit
          kramaId={krama.id}
          lockedPetugasId={petugas.id}
        />
      )}
    </div>
  );
}
