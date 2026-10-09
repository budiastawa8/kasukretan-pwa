import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, HandCoins, Wallet } from "lucide-react";
import { fetchApiHealth, type ApiHealth } from "../../lib/api/client";
import {
  fetchPetugasKesiapan,
  fetchPetugasRekapHariIni,
  type PetugasKesiapanApi,
  type PetugasRekapHariIni,
} from "../../lib/api/petugas";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { formatTanggalLahir, today } from "../../lib/utils";
import { Card } from "../../components/ui/Card";

type KesiapanState = PetugasKesiapanApi | "loading" | "error";

const KESIAPAN_ITEMS = [
  { key: "banjar", label: "Banjar" },
  { key: "tim_kasukretan", label: "Tim petugas" },
  { key: "krama", label: "Krama" },
  { key: "akun_keuangan", label: "Akun keuangan" },
] as const;

export function PetugasHomePage() {
  const [health, setHealth] = useState<ApiHealth | "loading" | "offline">("loading");
  const [kesiapan, setKesiapan] = useState<KesiapanState>("loading");
  const [rekap, setRekap] = useState<PetugasRekapHariIni | "loading" | "error">("loading");

  useEffect(() => {
    fetchApiHealth()
      .then(setHealth)
      .catch(() => setHealth("offline"));
  }, []);

  useEffect(() => {
    fetchPetugasKesiapan()
      .then(setKesiapan)
      .catch(() => setKesiapan("error"));
  }, []);

  useEffect(() => {
    fetchPetugasRekapHariIni(today())
      .then(setRekap)
      .catch(() => setRekap("error"));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-copper-900">Tagihan lapangan</h1>
        <p className="text-sm text-muted">Pilih jenis pembayaran yang akan dicatat.</p>
      </div>

      <Card className="text-sm">
        <p className="font-medium text-copper-900">Status API</p>
        <p className="text-xs text-muted mt-1">
          {health === "loading" && "Memeriksa…"}
          {health === "offline" && "Offline — jalankan `npm run dev` di folder api"}
          {health !== "loading" && health !== "offline" && health.ok && (
            <>
              Terhubung · {health.service} v{health.version}
              {health.database === "connected" && " · PostgreSQL"}
            </>
          )}
        </p>
      </Card>

      <Card className="text-sm space-y-2">
        <div className="flex items-center gap-2">
          {kesiapan === "loading" && (
            <p className="text-xs text-muted">Memeriksa kesiapan cloud…</p>
          )}
          {kesiapan === "error" && (
            <>
              <AlertTriangle className="text-amber-700 shrink-0" size={18} />
              <p className="text-xs text-amber-900">Tidak bisa memuat status cloud.</p>
            </>
          )}
          {kesiapan !== "loading" && kesiapan !== "error" && kesiapan.siap && (
            <>
              <CheckCircle2 className="text-emerald-700 shrink-0" size={18} />
              <p className="font-medium text-emerald-900">Cloud siap untuk pembayaran</p>
            </>
          )}
          {kesiapan !== "loading" && kesiapan !== "error" && !kesiapan.siap && (
            <>
              <AlertTriangle className="text-amber-700 shrink-0" size={18} />
              <p className="font-medium text-amber-900">Cloud belum lengkap</p>
            </>
          )}
        </div>

        {kesiapan !== "loading" && kesiapan !== "error" && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {KESIAPAN_ITEMS.map(({ key, label }) => {
              const n = kesiapan.counts[key] ?? 0;
              const ok = n > 0;
              return (
                <li key={key} className={ok ? "text-copper-800" : "text-amber-800"}>
                  {label}: {n > 0 ? n : "belum ada"}
                </li>
              );
            })}
          </ul>
        )}

        {kesiapan !== "loading" && kesiapan !== "error" && !kesiapan.siap && (
          <p className="text-[11px] text-muted pt-1">
            Sinkronkan master dan krama dari desktop (Pengaturan → tab Modul Online) sebelum
            mencatat pembayaran di lapangan.
          </p>
        )}
      </Card>

      <Link
        to="/petugas/rekap-hari-ini"
        className="block rounded-xl border border-copper-200 bg-copper-50/60 px-4 py-3 hover:border-copper-400 transition-colors"
      >
        <div className="flex items-center gap-2 mb-1">
          <ClipboardList className="text-copper-700 shrink-0" size={20} />
          <p className="font-semibold text-copper-900 text-sm">Rekap penerimaan hari ini</p>
        </div>
        {rekap === "loading" && <p className="text-xs text-muted pl-7">Memuat…</p>}
        {rekap === "error" && (
          <p className="text-xs text-amber-800 pl-7">Tidak bisa memuat rekap.</p>
        )}
        {rekap !== "loading" && rekap !== "error" && (
          <div className="pl-7 space-y-0.5">
            <p className="text-xs text-muted">
              {formatTanggalLahir(rekap.tanggal)}
              {rekap.petugas ? ` · ${rekap.petugas.nama}` : ""}
            </p>
            <p className="text-sm font-semibold tabular-nums text-emerald-900">
              {formatRupiah(rekap.ringkasan.total)}
              <span className="font-normal text-muted text-xs ml-2">
                {rekap.ringkasan.jumlah_penerimaan} penerimaan
              </span>
            </p>
          </div>
        )}
      </Link>

      <div className="grid gap-3">
        <Link
          to="/petugas/paturunan"
          className="flex items-center gap-3 rounded-xl border border-copper-200 bg-copper-50/60 px-4 py-4 hover:border-copper-400 transition-colors"
        >
          <Wallet className="text-copper-700 shrink-0" size={28} />
          <div>
            <p className="font-semibold text-copper-900">Paturunan</p>
            <p className="text-xs text-muted">Catat pembayaran Krama Mipil</p>
          </div>
        </Link>
        <Link
          to="/petugas/dudukan"
          className="flex items-center gap-3 rounded-xl border border-copper-200 bg-copper-50/60 px-4 py-4 hover:border-copper-400 transition-colors"
        >
          <HandCoins className="text-copper-700 shrink-0" size={28} />
          <div>
            <p className="font-semibold text-copper-900">Dudukan</p>
            <p className="text-xs text-muted">Catat kontribusi bulanan Pemasih</p>
          </div>
        </Link>
      </div>

      <p className="text-[11px] text-muted text-center px-2">
        Pembayaran tersimpan di PostgreSQL dan dapat ditarik ke desktop lewat sinkronisasi.
      </p>
    </div>
  );
}
