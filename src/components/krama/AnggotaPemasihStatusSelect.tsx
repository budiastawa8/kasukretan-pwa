import { useState } from "react";
import { updateAnggotaStatusKeluarga } from "../../lib/services/krama";
import {
  STATUS_KELUARGA_PEMASIH,
  formatStatusKeluarga,
} from "../../lib/status-keluarga";
import type { KlasifikasiKode } from "../../lib/types";
import { Select } from "../ui/Input";

export function AnggotaPemasihStatusSelect({
  kramaId,
  anggotaId,
  status,
  klasifikasi,
  onUpdated,
}: {
  kramaId: string;
  anggotaId: string;
  status: string;
  klasifikasi: KlasifikasiKode;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const display = formatStatusKeluarga(status, klasifikasi);

  async function change(next: string) {
    if (next === display) return;
    setLoading(true);
    setError("");
    try {
      await updateAnggotaStatusKeluarga(kramaId, anggotaId, next);
      onUpdated();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-[8.5rem]">
      <Select
        value={display}
        disabled={loading}
        onChange={(e) => change(e.target.value)}
        className="text-sm py-1"
        title="Hanya satu Pengajeg per keluarga — pilih Pengajeg untuk mengganti"
      >
        {STATUS_KELUARGA_PEMASIH.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}
