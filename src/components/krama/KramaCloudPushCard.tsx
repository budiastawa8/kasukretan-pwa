import { useState } from "react";
import { CloudUpload } from "lucide-react";
import { Button } from "../ui/Button";
import { getCloudApiToken, formatCloudFetchError } from "../../lib/sync/cloud-config";
import { pushKramaByIds } from "../../lib/sync/krama-sync";
import { Link } from "react-router-dom";
import { settingsPath } from "../../lib/settings-routes";

type Props = {
  kramaId: string;
  nomorKartu: string;
  statusKrama: string;
};

export function KramaCloudPushCard({ kramaId, nomorKartu, statusKrama }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (statusKrama !== "aktif") return null;

  async function handlePush() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (!getCloudApiToken()) {
        setError("Login API dulu di Pengaturan → Modul Online.");
        return;
      }
      const res = await pushKramaByIds([kramaId]);
      if (res.empty) {
        setMessage("Tidak ada data krama aktif untuk dikirim.");
        return;
      }
      const errN = res.result.errors.length;
      if (errN > 0) {
        setError(res.result.errors.slice(0, 3).join(" · "));
        return;
      }
      setMessage(
        `Kartu ${nomorKartu} terkirim ke cloud (${res.result.penduduk} kepala, ${res.result.krama} kartu).`
      );
    } catch (e) {
      setError(formatCloudFetchError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-copper-200 bg-card px-4 py-3 space-y-2 text-sm">
      <p className="font-medium text-copper-900">Cloud — kirim kartu ini</p>
      <p className="text-xs text-muted leading-relaxed">
        Kirim hanya krama <strong>{nomorKartu}</strong> ke server agar petugas/portal mengenali
        data ini (termasuk tanggal pencatatan untuk periode dudukan). Master desa harus sudah
        dikirim sebelumnya.
      </p>
      <Button type="button" variant="secondary" icon={CloudUpload} disabled={busy} onClick={() => void handlePush()}>
        {busy ? "Mengirim…" : "Kirim ke cloud"}
      </Button>
      {!getCloudApiToken() && (
        <p className="text-[11px] text-muted">
          <Link to={settingsPath("online")} className="underline">
            Login API
          </Link>{" "}
          di Modul Online terlebih dahulu.
        </p>
      )}
      {message && <p className="text-xs text-emerald-800">{message}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
