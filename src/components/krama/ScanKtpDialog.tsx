import { useEffect, useId, useRef, useState } from "react";
import { Camera, Check, IdCard, Loader2, X } from "lucide-react";
import { mapKtpToAnggotaFormValues } from "../../lib/ktp-scan/map-anggota";
import { terminateKkOcrWorker } from "../../lib/kk-scan/ocr";
import {
  fetchKtpScanStatus,
  isKtpVisionScanError,
  scanKartuTandaPenduduk,
  type KtpScanStatus,
} from "../../lib/ktp-scan/scan-pipeline";
import type { KtpOcrPerson } from "../../lib/ktp-scan/types";
import type { KlasifikasiKode } from "../../lib/types";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { STATUS_KAWIN_KODE, statusKawinOptionsForForm } from "../../lib/status-kawin";
import { AGAMA_TAMIU_OPTIONS } from "../../lib/agama-tamiu";
import type { AnggotaFormValues } from "./AnggotaFormDialog";

type Phase = "pick" | "working" | "review" | "error";

export function ScanKtpDialog({
  open,
  klasifikasi,
  current,
  onClose,
  onConfirm,
}: {
  open: boolean;
  klasifikasi: KlasifikasiKode;
  /** Nilai form saat ini — status keluarga & field lain dipertahankan. */
  current?: Partial<AnggotaFormValues>;
  onClose: () => void;
  onConfirm: (values: AnggotaFormValues) => void;
}) {
  const fileId = useId().replace(/:/g, "");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<KtpOcrPerson | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [engineNote, setEngineNote] = useState("");
  const [scanStatus, setScanStatus] = useState<KtpScanStatus | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [allowOcrFallback, setAllowOcrFallback] = useState(false);

  const isPemasih = klasifikasi === "KRAMA_TAMIU" || klasifikasi === "TAMIU";
  const isPipil = klasifikasi === "MIPIL";

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setProgressMsg("");
    setProgressPct(0);
    setError("");
    setDraft(null);
    setEngineNote("");
    setLastFile(null);
    setAllowOcrFallback(false);
    setScanStatus(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    void fetchKtpScanStatus().then(setScanStatus);
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function runScan(file: File, forceTesseract = false) {
    setError("");
    setAllowOcrFallback(false);
    setLastFile(file);
    setPhase("working");
    setProgressPct(0);
    setProgressMsg("Menyiapkan foto…");
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    try {
      const result = await scanKartuTandaPenduduk(
        file,
        (p) => {
          setProgressPct(p.percent);
          setProgressMsg(p.message);
        },
        { forceTesseract, preferVisionOnly: !forceTesseract }
      );
      setEngineNote(
        [result.note, result.visionWarning ? `Catatan Vision: ${result.visionWarning}` : ""]
          .filter(Boolean)
          .join(" ")
      );
      setDraft(result.person);
      setPhase("review");
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Gagal membaca KTP. Pastikan koneksi atau aset OCR tersedia lalu coba lagi.";
      setError(msg);
      setAllowOcrFallback(isKtpVisionScanError(e) && !forceTesseract);
      setPhase("error");
    }
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void runScan(file);
  }

  function applyConfirm() {
    if (!draft) return;
    const values = mapKtpToAnggotaFormValues(draft, klasifikasi, current);
    onConfirm(values);
    void terminateKkOcrWorker();
    onClose();
  }

  const statusKawinOptions = statusKawinOptionsForForm(
    klasifikasi,
    draft?.agama,
    draft?.status_kawin
  );

  return (
    <Modal
      open={open}
      title="Scan KTP"
      onClose={onClose}
      className="max-w-lg"
      elevated
      canClose={phase !== "working"}
      closeOnEscape={phase !== "working"}
      footer={
        phase === "review" ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              type="button"
              variant="secondary"
              icon={X}
              className="order-2 h-11 justify-center sm:order-none sm:h-9"
              onClick={onClose}
            >
              Batal
            </Button>
            <Button
              type="button"
              icon={Check}
              className="order-1 h-11 justify-center sm:order-none sm:h-9 sm:flex-1"
              onClick={applyConfirm}
              disabled={!draft?.nama_lengkap?.trim()}
            >
              Pakai data ini
            </Button>
          </div>
        ) : phase === "error" ? (
          <div className="flex flex-wrap gap-2">
            {allowOcrFallback && lastFile ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void runScan(lastFile, true)}
              >
                Coba OCR di HP
              </Button>
            ) : null}
            <Button type="button" variant="secondary" icon={X} onClick={onClose}>
              Tutup
            </Button>
          </div>
        ) : (
          <Button type="button" variant="secondary" icon={X} onClick={onClose} disabled={phase === "working"}>
            Batal
          </Button>
        )
      }
    >
      <div className="space-y-3 text-sm">
        {scanStatus && phase === "pick" ? (
          <p className="text-xs text-copper-700">
            {scanStatus.configured
              ? `Scan cepat: aktif${scanStatus.model ? ` (${scanStatus.model})` : ""}`
              : `Scan cepat: tidak aktif — ${scanStatus.detail ?? "OCR di HP akan dipakai."}`}
          </p>
        ) : null}

        {phase === "pick" ? (
          <>
            <p className="text-xs leading-snug text-copper-800">
              Foto KTP satu orang (Pengarep, Pengajeg, atau anggota). Hindari kilap; usahakan NIK dan
              Nama terbaca. Status keluarga tetap Anda pilih di form.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                icon={Camera}
                className="h-11 justify-center"
                onClick={() => cameraInputRef.current?.click()}
              >
                Kamera
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon={IdCard}
                className="h-11 justify-center"
                onClick={() => galleryInputRef.current?.click()}
              >
                Galeri
              </Button>
            </div>
            <input
              id={`${fileId}-cam`}
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onFilePicked}
            />
            <input
              id={`${fileId}-gal`}
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onFilePicked}
            />
          </>
        ) : null}

        {phase === "working" ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <Loader2 className="animate-spin text-copper-700" size={28} />
            <p className="text-sm font-medium text-copper-900">{progressMsg || "Memproses…"}</p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded bg-copper-100">
              <div
                className="h-full bg-copper-600 transition-all"
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Pratinjau KTP"
                className="mt-2 max-h-36 rounded border border-copper-200 object-contain"
              />
            ) : null}
          </div>
        ) : null}

        {phase === "error" ? (
          <p className="rounded border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        {phase === "review" && draft ? (
          <div className="space-y-2">
            {engineNote ? <p className="text-[11px] text-copper-600">{engineNote}</p> : null}
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Foto KTP"
                className="max-h-28 w-full rounded border border-copper-200 object-contain"
              />
            ) : null}
            <p className="text-xs text-copper-700">Periksa lalu koreksi jika perlu sebelum dipakai.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Nama lengkap</Label>
                <Input
                  value={draft.nama_lengkap}
                  onChange={(e) => setDraft({ ...draft, nama_lengkap: e.target.value })}
                />
              </div>
              <div>
                <Label>NIK</Label>
                <Input
                  value={draft.nik ?? ""}
                  onChange={(e) => setDraft({ ...draft, nik: e.target.value })}
                />
              </div>
              <div>
                <Label>Jenis kelamin</Label>
                <Select
                  value={draft.jenis_kelamin ?? "L"}
                  onChange={(e) =>
                    setDraft({ ...draft, jenis_kelamin: e.target.value as "L" | "P" })
                  }
                >
                  <option value="L">L</option>
                  <option value="P">P</option>
                </Select>
              </div>
              <div>
                <Label>Tempat lahir</Label>
                <Input
                  value={draft.tempat_lahir ?? ""}
                  onChange={(e) => setDraft({ ...draft, tempat_lahir: e.target.value })}
                />
              </div>
              <div>
                <Label>Tanggal lahir</Label>
                <DateInput
                  value={draft.tanggal_lahir ?? ""}
                  onChange={(val) => setDraft({ ...draft, tanggal_lahir: val })}
                />
              </div>
              {isPemasih || isPipil ? (
                <div>
                  <Label>Agama</Label>
                  {isPipil ? (
                    <p className="mt-1 font-medium text-copper-950">Hindu</p>
                  ) : (
                    <Select
                      value={draft.agama ?? ""}
                      onChange={(e) => setDraft({ ...draft, agama: e.target.value })}
                    >
                      <option value="">— Pilih —</option>
                      {AGAMA_TAMIU_OPTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </Select>
                  )}
                </div>
              ) : null}
              <div>
                <Label>Status kawin</Label>
                <Select
                  value={draft.status_kawin ?? STATUS_KAWIN_KODE.KAWIN}
                  onChange={(e) => setDraft({ ...draft, status_kawin: e.target.value })}
                >
                  {statusKawinOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Pekerjaan</Label>
                <Input
                  value={draft.pekerjaan ?? ""}
                  onChange={(e) => setDraft({ ...draft, pekerjaan: e.target.value })}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
