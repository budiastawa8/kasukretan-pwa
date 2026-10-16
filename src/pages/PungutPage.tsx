import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  Ban,
  ClipboardList,
  HandCoins,
  Printer,
  ScanLine,
  Search,
  Wallet,
} from "lucide-react";
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
  PETUGAS_STRUK_PREVIEW_PATH,
  stashPetugasStrukPreview,
  type PetugasStrukPreviewState,
} from "../lib/petugas-struk-preview";
import {
  bolehPungutKrama,
  buildStrukDudukanPungut,
  buildStrukPaturunanPungut,
  cariKramaPungut,
  findKramaByNomorKartu,
  getPetugasLapanganSaya,
  getRingkasanPungut,
  getStrukCetakUlang,
  isKramaMipil,
  isKramaPemasih,
  modeUntukKrama,
  type KramaPungut,
  type ModePungut,
  type PetugasLapangan,
  type RingkasanPaturunanPungut,
  type RingkasanPungut,
} from "../lib/services/pungut";
import { listPembayaranBelumDisetor, type PembayaranSetoranItem } from "../lib/services/setoran";
import { cn, formatTanggalLahir } from "../lib/utils";

const MODE_STORAGE_KEY = "kasukretan.pungut_mode.v1";

const MODE_LABEL: Record<ModePungut, string> = {
  paturunan: "Paturunan",
  dudukan: "Dudukan",
};

function readMode(): ModePungut | null {
  try {
    const v = localStorage.getItem(MODE_STORAGE_KEY);
    return v === "paturunan" || v === "dudukan" ? v : null;
  } catch {
    return null;
  }
}

function useModePungut() {
  const [mode, setModeState] = useState<ModePungut | null>(readMode);
  const setMode = useCallback((m: ModePungut | null) => {
    setModeState(m);
    try {
      if (m) localStorage.setItem(MODE_STORAGE_KEY, m);
      else localStorage.removeItem(MODE_STORAGE_KEY);
    } catch {
      /* mode tetap berlaku selama halaman terbuka */
    }
  }, []);
  return [mode, setMode] as const;
}

function PilihMode({ onPilih }: { onPilih: (m: ModePungut) => void }) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-sm text-copper-950 font-medium">Mau mengumpulkan apa?</p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" className="h-20 flex-col text-base" onClick={() => onPilih("paturunan")}>
          Paturunan
          <span className="block text-[11px] font-normal opacity-90">Krama mipil</span>
        </Button>
        <Button type="button" className="h-20 flex-col text-base" onClick={() => onPilih("dudukan")}>
          Dudukan
          <span className="block text-[11px] font-normal opacity-90">Krama pemasih</span>
        </Button>
      </div>
    </div>
  );
}

export function PungutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useModePungut();
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
  const [strukBaru, setStrukBaru] = useState<PetugasStrukPreviewState | null>(null);
  const [strukUlangBusy, setStrukUlangBusy] = useState<string | null>(null);

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
      setStrukBaru(null);
      if (
        petugas &&
        bolehPungutKrama(petugas, k) &&
        k.status_krama === "aktif" &&
        modeUntukKrama(k) === mode
      ) {
        void loadRingkasan(k);
      }
    },
    [petugas, mode, loadRingkasan]
  );

  function gantiMode(m: ModePungut | null) {
    setMode(m);
    setHasilCari([]);
    setError("");
    setFlash("");
    setStrukBaru(null);
    setRingkasan(null);
    if (m && krama && modeUntukKrama(krama) === m) {
      if (petugas && bolehPungutKrama(petugas, krama) && krama.status_krama === "aktif") {
        void loadRingkasan(krama);
      }
    } else {
      setKrama(null);
    }
  }

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
    if (!petugas || !mode) return;
    setCariBusy(true);
    setError("");
    try {
      const rows = await cariKramaPungut(petugas, q, mode);
      setHasilCari(rows);
      if (rows.length === 0) {
        setError(
          `Tidak ada krama ${mode === "paturunan" ? "mipil" : "pemasih"} yang cocok di wilayah Anda.`
        );
      }
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

  function bukaStruk(state: PetugasStrukPreviewState) {
    try {
      stashPetugasStrukPreview(state);
      navigate(PETUGAS_STRUK_PREVIEW_PATH);
    } catch (e) {
      setError(String(e));
    }
  }

  async function cetakUlang(item: PembayaranSetoranItem) {
    if (!petugas) return;
    const key = `${item.sumber}:${item.id}`;
    setStrukUlangBusy(key);
    setError("");
    try {
      const state = await getStrukCetakUlang(petugas, item);
      if (!state) {
        setError("Data pembayaran untuk struk tidak ditemukan.");
        return;
      }
      bukaStruk(state);
    } catch (e) {
      setError(String(e));
    } finally {
      setStrukUlangBusy(null);
    }
  }

  if (!petugasLoaded) {
    return <p className="text-sm text-muted">Memuat…</p>;
  }

  if (!petugas) {
    return (
      <Card title="Pengumpulan iuran">
        <p className="text-sm text-amber-900">
          Akun Anda belum dihubungkan ke nama di Tim Kasukretan. Minta admin membuka Pengaturan →
          Pengguna, lalu memilih nama petugas untuk akun ini.
        </p>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </Card>
    );
  }

  const totalSemuaPegangan = pegangan.reduce((s, p) => s + p.jumlah, 0);
  const peganganMode = mode ? pegangan.filter((p) => p.sumber === mode) : pegangan;
  const totalPegangan = peganganMode.reduce((s, p) => s + p.jumlah, 0);
  const modeKrama = krama ? modeUntukKrama(krama) : null;
  const beda = krama != null && mode != null && modeKrama !== mode;
  const diLuarWilayah = krama != null && !bolehPungutKrama(petugas, krama);
  const tidakAktif = krama != null && krama.status_krama !== "aktif";

  return (
    <div className="space-y-3 max-w-xl mx-auto">
      <Card title="Pengumpulan iuran">
        <p className="text-sm text-copper-950 font-medium">
          {petugas.nama} <span className="text-muted font-normal">· {petugas.jabatan}</span>
        </p>
        <p className="text-xs text-muted">
          Wilayah: {petugas.semua_banjar ? "semua banjar" : `Banjar ${petugas.banjar_nama}`}
        </p>
        {!mode ? (
          <PilihMode onPilih={gantiMode} />
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-copper-200 bg-copper-50/70 px-3 py-2">
              <p className="text-sm">
                Mengumpulkan:{" "}
                <strong className="text-copper-950">{MODE_LABEL[mode]}</strong>
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={ArrowLeftRight}
                onClick={() => gantiMode(null)}
              >
                Ganti
              </Button>
            </div>
            <Button
              type="button"
              icon={ScanLine}
              className="mt-2 h-12 w-full text-base"
              onClick={() => {
                setError("");
                setScanOpen(true);
              }}
            >
              Scan QR kartu {mode === "paturunan" ? "mipil" : "pemasih"}
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
          </>
        )}
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
          <div className="mt-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
            <p>{flash}</p>
            {strukBaru && (
              <Button
                type="button"
                icon={Printer}
                className="mt-1.5 h-11 w-full text-base"
                onClick={() => bukaStruk(strukBaru)}
              >
                Cetak struk
              </Button>
            )}
          </div>
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

          {beda ? (
            <div className="mt-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-2">
              {modeKrama ? (
                <>
                  <p>
                    Ini kartu krama {modeKrama === "paturunan" ? "mipil" : "pemasih"} — iurannya{" "}
                    <strong>{MODE_LABEL[modeKrama]}</strong>, bukan {mode && MODE_LABEL[mode]}.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={ArrowLeftRight}
                    className="mt-2 h-10 w-full"
                    onClick={() => gantiMode(modeKrama)}
                  >
                    Pindah ke {MODE_LABEL[modeKrama]}
                  </Button>
                </>
              ) : (
                <p>Krama ini tidak memiliki iuran yang bisa dikumpulkan.</p>
              )}
            </div>
          ) : diLuarWilayah ? (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-red-800 bg-red-50 border border-red-200 rounded px-2 py-2">
              <Ban size={16} className="shrink-0 mt-0.5" aria-hidden />
              Krama ini dari Banjar {krama.banjar_nama} — di luar wilayah pengumpulan Anda.
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
                <p className="text-xs text-muted">Krama ini tidak memiliki iuran yang bisa dikumpulkan.</p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Uang di Tangan Saya">
        <p className="flex items-center gap-1.5 text-sm">
          <Wallet size={16} className="text-amber-800" aria-hidden />
          Belum disetor{mode ? ` (${MODE_LABEL[mode]})` : ""}:{" "}
          <strong className="tabular-nums">{formatRupiah(totalPegangan)}</strong>
          <span className="text-muted text-xs">({peganganMode.length} transaksi)</span>
        </p>
        {mode && totalSemuaPegangan !== totalPegangan && (
          <p className="mt-0.5 text-xs text-copper-800">
            Total semua (Paturunan + Dudukan):{" "}
            <strong className="tabular-nums">{formatRupiah(totalSemuaPegangan)}</strong>
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted leading-snug">
          Serahkan uang ini ke bendahara. Setelah bendahara menerima setoran, pembayarannya pindah ke
          Riwayat Setoran Saya dan tidak bisa dihapus lagi dari HP.
        </p>
        {peganganMode.length > 0 && (
          <ul className="mt-2 divide-y divide-copper-100 border border-copper-100 rounded-md max-h-72 overflow-y-auto">
            {peganganMode.map((p) => (
              <li key={`${p.sumber}:${p.id}`} className="flex items-start justify-between gap-2 px-2 py-1.5 text-xs">
                <span className="min-w-0">
                  <span className="text-muted">{formatTanggalLahir(p.tanggal)}</span>
                  {" · "}
                  <span className="font-medium text-copper-950">{p.kepala_nama}</span>
                  <span className="block text-muted truncate">{p.uraian}</span>
                </span>
                <span className="shrink-0 flex items-center gap-1.5">
                  <span className="tabular-nums font-medium">{formatRupiah(p.jumlah)}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    icon={Printer}
                    className="h-8 px-2 text-xs"
                    title="Cetak ulang struk"
                    disabled={strukUlangBusy != null}
                    onClick={() => void cetakUlang(p)}
                  >
                    {strukUlangBusy === `${p.sumber}:${p.id}` ? "…" : "Struk"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/pungut/rekap"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-copper-800 hover:underline"
        >
          <ClipboardList size={14} />
          Rekap &amp; Riwayat Saya
        </Link>
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
          onPembayaranBaru={({ wajib, punia, tanggal }) =>
            setStrukBaru({
              kind: "paturunan",
              payload: buildStrukPaturunanPungut({
                krama,
                iuranNama: bayarIuran.iuran.nama,
                petugasNama: petugas.nama,
                wajib,
                punia,
                tanggal,
              }),
              backTo: "/pungut",
              backLabel: "Pengumpulan",
            })
          }
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
          onPembayaranBaru={({ items, tanggal }) =>
            setStrukBaru({
              kind: "dudukan",
              payload: buildStrukDudukanPungut({
                krama,
                petugasNama: petugas.nama,
                items,
                tanggal,
              }),
              backTo: "/pungut",
              backLabel: "Pengumpulan",
            })
          }
          canEdit
          kramaId={krama.id}
          lockedPetugasId={petugas.id}
        />
      )}
    </div>
  );
}
