import { useEffect, useState } from "react";
import { Ban, UserCheck, X } from "lucide-react";
import { isUmurMencapaiBatasNyada, labelAlasanNyadaKhusus } from "../../lib/nyada-ketentuan";
import { formatTanggalLahir } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Label, Select } from "../ui/Input";
import { Modal } from "../ui/Modal";

export type PengarepMeninggalCandidate = {
  anggota_id: string;
  nama_lengkap: string;
  status_keluarga: string;
  tanggal_lahir?: string | null;
};

/**
 * Nyada karena umur/lama tetap diteruskan ke pengganti. Nyada khusus (cacat/keputusan)
 * hanya diteruskan bila pengganti sendiri sudah mencapai batas umur.
 */
function defaultPertahankanNyada(
  alasanNyada: string | null | undefined,
  pengganti: PengarepMeninggalCandidate | undefined,
  batasUmurNyada: number | null
): boolean {
  if (!labelAlasanNyadaKhusus(alasanNyada)) return true;
  return isUmurMencapaiBatasNyada(pengganti?.tanggal_lahir, batasUmurNyada);
}

export function defaultPenggantiPengarep(
  candidates: PengarepMeninggalCandidate[]
): string {
  const pasangan = candidates.find((c) => /istri|suami/i.test(c.status_keluarga));
  return (pasangan ?? candidates[0])?.anggota_id ?? "";
}

export function PengarepMeninggalDialog({
  open,
  pengarepNama,
  tanggalMeninggal,
  candidates,
  isNyada,
  alasanNyada,
  batasUmurNyada,
  jenisTanpaNyadaNama,
  catatan,
  busy,
  error,
  onGanti,
  onNonaktifkan,
  onCancel,
}: {
  open: boolean;
  pengarepNama: string;
  tanggalMeninggal: string;
  candidates: PengarepMeninggalCandidate[];
  isNyada: boolean;
  alasanNyada?: string | null;
  batasUmurNyada: number | null;
  /** Jenis bila Nyada tidak diteruskan (Ngarep Balu / Cerai Mati). */
  jenisTanpaNyadaNama?: string | null;
  /** Ketentuan khusus (mis. Krama Dapukan hanya digantikan istri/suami). */
  catatan?: string;
  busy?: boolean;
  error?: string;
  onGanti: (values: { penggantiAnggotaId: string; pertahankanNyada: boolean }) => void;
  onNonaktifkan: () => void;
  onCancel: () => void;
}) {
  const [penggantiId, setPenggantiId] = useState("");
  const [pertahankanNyada, setPertahankanNyada] = useState(true);

  const nyadaKhusus = labelAlasanNyadaKhusus(alasanNyada);

  function pilihPengganti(id: string) {
    setPenggantiId(id);
    setPertahankanNyada(
      defaultPertahankanNyada(
        alasanNyada,
        candidates.find((c) => c.anggota_id === id),
        batasUmurNyada
      )
    );
  }

  useEffect(() => {
    if (open) pilihPengganti(defaultPenggantiPengarep(candidates));
  }, [open, candidates]);

  const canGanti =
    candidates.length > 0 &&
    !!penggantiId &&
    (!isNyada || pertahankanNyada || !!jenisTanpaNyadaNama);

  return (
    <Modal
      open={open}
      title="Pengarep meninggal"
      onClose={busy ? () => undefined : onCancel}
      footer={
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            icon={UserCheck}
            className="h-10 justify-center sm:h-9 sm:flex-1"
            disabled={!canGanti || busy}
            onClick={() => onGanti({ penggantiAnggotaId: penggantiId, pertahankanNyada })}
          >
            {busy ? "Menyimpan…" : "Gantikan Pengarep"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={Ban}
            className="h-10 justify-center sm:h-9"
            disabled={busy}
            onClick={onNonaktifkan}
          >
            Nonaktifkan kartu
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={X}
            className="h-10 justify-center sm:h-9"
            disabled={busy}
            onClick={onCancel}
          >
            Batal
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm leading-snug">
        <p className="text-copper-800">
          <strong>{pengarepNama}</strong> tercatat meninggal pada{" "}
          {formatTanggalLahir(tanggalMeninggal)}. Apakah kartu Pipil dilanjutkan dengan Pengarep
          pengganti?
        </p>
        {error && <p className="text-red-600">{error}</p>}
        {catatan && (
          <p className="rounded border border-copper-200 bg-copper-50 px-2.5 py-1.5 text-copper-900">
            {catatan}
          </p>
        )}
        {candidates.length === 0 ? (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900">
            Tidak ada anggota keluarga lain yang dapat menjadi Pengarep. Kartu hanya dapat
            dinonaktifkan.
          </p>
        ) : (
          <div>
            <Label>Pengarep pengganti</Label>
            <Select
              value={penggantiId}
              onChange={(e) => pilihPengganti(e.target.value)}
              disabled={busy}
            >
              {candidates.map((c) => (
                <option key={c.anggota_id} value={c.anggota_id}>
                  {c.nama_lengkap}
                  {c.status_keluarga ? ` (${c.status_keluarga})` : ""}
                </option>
              ))}
            </Select>
          </div>
        )}
        {isNyada && candidates.length > 0 && (
          <label className="flex items-start gap-2 rounded border border-copper-200 bg-copper-50 px-2.5 py-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={pertahankanNyada}
              onChange={(e) => setPertahankanNyada(e.target.checked)}
              disabled={busy}
            />
            <span>
              <strong>Pertahankan status Nyada.</strong>{" "}
              {nyadaKhusus
                ? `Krama ini Nyada karena ${nyadaKhusus.toLowerCase()} Pengarep. Pengganti yang belum mencapai batas umur tidak meneruskan Nyada.`
                : `Krama ini berstatus Nyada; pengganti tetap Nyada meskipun umurnya ${
                    batasUmurNyada != null ? `di bawah ${batasUmurNyada} tahun` : "belum mencapai batas"
                  }.`}
            </span>
          </label>
        )}
        {isNyada && candidates.length > 0 && !pertahankanNyada && (
          <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-amber-900">
            {jenisTanpaNyadaNama
              ? `Jenis krama menjadi ${jenisTanpaNyadaNama}. Iuran yang jatuh tempo sebelum tanggal meninggal tetap mengikuti Nyada.`
              : "Jenis Krama (Cerai Mati) belum diatur di Master Data → Profil Desa. Atur terlebih dahulu atau pertahankan status Nyada."}
          </p>
        )}
        <p className="text-xs text-muted">
          Pengarep lama dikeluarkan dari daftar anggota aktif (tetap tersimpan di arsip). Pilih{" "}
          <strong>Nonaktifkan kartu</strong> bila keluarga tidak dilanjutkan.
        </p>
      </div>
    </Modal>
  );
}
