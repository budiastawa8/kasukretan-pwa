import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, HandCoins, Wallet } from "lucide-react";
import { fetchPortalProfil, type PortalProfil } from "../../lib/api/portal";
import { usePortalAuth } from "../../context/PortalAuthContext";
import { Card } from "../../components/ui/Card";

export function PortalHomePage() {
  const { user } = usePortalAuth();
  const [profil, setProfil] = useState<PortalProfil | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPortalProfil()
      .then(setProfil)
      .catch((e) => setError(String(e)));
  }, []);

  if (!user) return null;

  const isMipil = user.klasifikasiKode === "MIPIL";
  const isPemasih = user.klasifikasiKode === "KRAMA_TAMIU" || user.klasifikasiKode === "TAMIU";
  const kartuLabel = isMipil
    ? "Pipil & Kartu"
    : isPemasih
      ? "Ilikita & Kartu"
      : "Kartu Krama";
  const kartuHint = isMipil
    ? "Lembar Pipil keluarga & kartu anggota"
    : isPemasih
      ? "Lembar Ilikita & kartu anggota"
      : "Lihat kartu digital anggota keluarga";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-copper-900">Selamat datang</h1>
        <p className="text-sm text-muted">Ringkasan data krama Anda di cloud.</p>
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      <Card className="text-sm space-y-1">
        <p className="font-medium text-copper-900">{profil?.kepala_nama ?? user.kepalaNama}</p>
        <p className="text-xs text-muted">
          {profil?.klasifikasi_nama ?? user.klasifikasiKode}
          {profil?.jenis_nama ? ` · ${profil.jenis_nama}` : ""}
        </p>
        <p className="text-xs text-muted">
          Kartu {profil?.nomor_kartu ?? user.nomorKartu} · Banjar {profil?.banjar_nama ?? "—"}
        </p>
      </Card>

      <div className="grid gap-3">
        <Link
          to="/portal/kartu"
          className="flex items-center gap-3 rounded-xl border border-copper-200 bg-copper-50/60 px-4 py-4 hover:border-copper-400 transition-colors"
        >
          <CreditCard className="text-copper-700 shrink-0" size={28} />
          <div>
            <p className="font-semibold text-copper-900">{kartuLabel}</p>
            <p className="text-xs text-muted">{kartuHint}</p>
          </div>
        </Link>
        {isMipil && (
          <Link
            to="/portal/paturunan"
            className="flex items-center gap-3 rounded-xl border border-copper-200 bg-copper-50/60 px-4 py-4 hover:border-copper-400 transition-colors"
          >
            <Wallet className="text-copper-700 shrink-0" size={28} />
            <div>
              <p className="font-semibold text-copper-900">Paturunan</p>
              <p className="text-xs text-muted">Tagihan iuran & riwayat pembayaran</p>
            </div>
          </Link>
        )}
        {isPemasih && (
          <Link
            to="/portal/dudukan"
            className="flex items-center gap-3 rounded-xl border border-copper-200 bg-copper-50/60 px-4 py-4 hover:border-copper-400 transition-colors"
          >
            <HandCoins className="text-copper-700 shrink-0" size={28} />
            <div>
              <p className="font-semibold text-copper-900">Dudukan</p>
              <p className="text-xs text-muted">Kontribusi bulanan & riwayat bayar</p>
            </div>
          </Link>
        )}
      </div>

      <p className="text-[11px] text-muted text-center px-2">
        Tampilan hanya baca — pembayaran tetap melalui petugas atau kantor.
      </p>
    </div>
  );
}
