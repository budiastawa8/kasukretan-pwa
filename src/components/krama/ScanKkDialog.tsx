import { useEffect, useId, useRef, useState } from "react";
import { Camera, Check, Loader2, ScanLine, X } from "lucide-react";
import { mapKkMemberToAnggota, type AnggotaFromKk } from "../../lib/kk-scan/map-anggota";
import { recognizeKkImage, terminateKkOcrWorker } from "../../lib/kk-scan/ocr";
import { looksLikeKartuKeluarga, parseKkOcrText } from "../../lib/kk-scan/parse-kk";
import type { KkOcrMember } from "../../lib/kk-scan/types";
import type { KlasifikasiKode } from "../../lib/types";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { statusKeluargaOptionsAnggota } from "../../lib/status-keluarga";
import { STATUS_KAWIN_KODE, statusKawinOptionsForForm } from "../../lib/status-kawin";
import { AGAMA_TAMIU_OPTIONS } from "../../lib/agama-tamiu";

type Phase = "pick" | "working" | "review" | "error";

type DraftRow = KkOcrMember & { key: string; status_keluarga: string };

function toDraftRows(members: KkOcrMember[], klasifikasi: KlasifikasiKode): DraftRow[] {
  return members.map((m, i) => ({
    ...m,
    key: `${m.nik ?? "x"}-${i}-${m.nama_lengkap}`,
    status_keluarga: mapKkMemberToAnggota(m, klasifikasi).status_keluarga,
  }));
}

export function ScanKkDialog({
  open,
  klasifikasi,
  onClose,
  onConfirm,
}: {
  open: boolean;
  klasifikasi: KlasifikasiKode;
  onClose: () => void;
  onConfirm: (anggota: AnggotaFromKk[]) => void | Promise<void>;
}) {
  const fileId = useId().replace(/:/g, "");
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [busyConfirm, setBusyConfirm] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isTamiu = klasifikasi === "TAMIU";
  const isPipil = klasifikasi === "MIPIL";

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setProgressMsg("");
    setProgressPct(0);
    setError("");
    setRows([]);
    setBusyConfirm(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [open]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function runOcr(file: File) {
    setError("");
    setPhase("working");
    setProgressPct(0);
    setProgressMsg("Menyiapkan foto…");
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    try {
      const text = await recognizeKkImage(file, (p) => {
        setProgressPct(Math.round(p.progress * 100));
        setProgressMsg(p.message);
      });
      const parsed = parseKkOcrText(text);
      if (parsed.length === 0) {
        setError(
          looksLikeKartuKeluarga(text)
            ? "Anggota KK tidak terbaca dengan jelas. Foto ulang bagian tabel anggota (bukan hanya nomor KK di header), cahaya cukup, dan tulisan tidak buram."
            : "Foto tidak tampak seperti Kartu Keluarga. Gunakan foto KK (bukan KTP), pastikan judul «Kartu Keluarga» atau daftar anggota terlihat."
        );
        setPhase("error");
        return;
      }
      setRows(toDraftRows(parsed, klasifikasi));
      setPhase("review");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Gagal membaca KK. Pastikan aset OCR tersedia lalu coba lagi."
      );
      setPhase("error");
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Pilih berkas gambar (JPG atau PNG).");
      setPhase("error");
      return;
    }
    void runOcr(file);
  }

  function updateRow(key: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleConfirm() {
    const selected = rows.filter((r) => r.selected && r.nama_lengkap.trim());
    if (selected.length === 0) {
      setError("Centang minimal satu anggota.");
      return;
    }
    for (const r of selected) {
      if ((klasifikasi === "KRAMA_TAMIU" || klasifikasi === "TAMIU") && !r.nik?.trim()) {
        setError(`NIK wajib untuk pemasih — lengkapi NIK «${r.nama_lengkap}».`);
        return;
      }
      if (isTamiu && !r.agama?.trim()) {
        setError(`Agama wajib untuk Tamiu — lengkapi agama «${r.nama_lengkap}».`);
        return;
      }
    }
    setBusyConfirm(true);
    setError("");
    try {
      const mapped = selected.map((r) => ({
        ...mapKkMemberToAnggota(r, klasifikasi),
        status_keluarga: r.status_keluarga,
      }));
      await onConfirm(mapped);
      void terminateKkOcrWorker();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyConfirm(false);
    }
  }

  function handleClose() {
    if (busyConfirm || phase === "working") return;
    void terminateKkOcrWorker();
    onClose();
  }

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <Modal
      open={open}
      title="Scan Kartu Keluarga"
      onClose={handleClose}
      canClose={!busyConfirm && phase !== "working"}
      closeOnEscape={!busyConfirm && phase !== "working"}
      className="max-w-lg"
      footer={
        phase === "review" ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              icon={X}
              className="h-11 justify-center"
              onClick={handleClose}
              disabled={busyConfirm}
            >
              Batal
            </Button>
            <Button
              type="button"
              icon={Check}
              className="h-11 justify-center"
              onClick={() => void handleConfirm()}
              disabled={busyConfirm || selectedCount === 0}
            >
              {busyConfirm ? "Menambah…" : `Pakai (${selectedCount})`}
            </Button>
          </div>
        ) : phase === "error" || phase === "pick" ? (
          <Button
            type="button"
            variant="secondary"
            className="h-11 w-full justify-center"
            onClick={handleClose}
          >
            Tutup
          </Button>
        ) : null
      }
    >
      <div className="space-y-3 text-sm leading-snug">
        <p className="text-[11px] text-muted">
          Hanya daftar di tabel anggota KK yang dibaca (bukan header Desa/Kelurahan).
          Baris teratas jadi calon Pengarep/Pengajeg — bisa diganti. Periksa NIK dan tanggal
          lahir sebelum memakai.
        </p>

        <input
          ref={cameraInputRef}
          id={`${fileId}-cam`}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={onFileChange}
        />
        <input
          ref={galleryInputRef}
          id={`${fileId}-gal`}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onFileChange}
        />

        {phase === "pick" && (
          <div className="grid grid-cols-1 gap-2">
            <Button
              type="button"
              icon={Camera}
              className="h-12 justify-center text-sm"
              onClick={() => cameraInputRef.current?.click()}
            >
              Foto KK
            </Button>
            <Button
              type="button"
              variant="secondary"
              icon={ScanLine}
              className="h-11 justify-center text-sm"
              onClick={() => galleryInputRef.current?.click()}
            >
              Pilih dari galeri
            </Button>
          </div>
        )}

        {phase === "working" && (
          <div className="space-y-3 rounded-lg border border-copper-200 bg-copper-50/70 px-3 py-4">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Pratinjau KK"
                className="mx-auto max-h-36 rounded border border-copper-200 object-contain"
              />
            )}
            <div className="flex items-center gap-2 text-copper-900">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
              <span className="text-xs">{progressMsg || "Memproses…"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-copper-100">
              <div
                className="h-full rounded-full bg-copper-700 transition-[width] duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-3">
            <p className="rounded border border-red-100 bg-red-50 px-2.5 py-2 text-xs text-red-700">
              {error}
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                icon={Camera}
                className="h-11 justify-center"
                onClick={() => {
                  setError("");
                  setPhase("pick");
                  cameraInputRef.current?.click();
                }}
              >
                Foto ulang
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-11 justify-center"
                onClick={() => {
                  setError("");
                  setPhase("pick");
                }}
              >
                Kembali
              </Button>
            </div>
          </div>
        )}

        {phase === "review" && (
          <div className="space-y-3">
            {error && (
              <p className="rounded border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                {error}
              </p>
            )}
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Urutan mengikuti tabel KK. Anggota teratas (biasanya Kepala Keluarga) akan
              dijadikan calon Pengarep/Pengajeg di form — bisa diganti sebelum simpan.
            </p>
            <ul className="space-y-3 max-h-[55vh] overflow-y-auto pr-0.5">
              {rows.map((r) => (
                <li
                  key={r.key}
                  className="rounded-lg border border-copper-200 bg-card px-2.5 py-2 space-y-2"
                >
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-copper-800"
                      checked={r.selected}
                      onChange={(e) => updateRow(r.key, { selected: e.target.checked })}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-copper-950 text-sm leading-snug">
                        {r.nama_lengkap || "(tanpa nama)"}
                      </span>
                      {r.status_hubungan_kk && (
                        <span className="block text-[10px] text-muted">
                          KK: {r.status_hubungan_kk}
                        </span>
                      )}
                    </span>
                  </label>
                  {r.selected && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pl-6">
                      <div className="sm:col-span-2">
                        <Label>Nama lengkap</Label>
                        <Input
                          value={r.nama_lengkap}
                          onChange={(e) => updateRow(r.key, { nama_lengkap: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>NIK</Label>
                        <Input
                          inputMode="numeric"
                          value={r.nik ?? ""}
                          onChange={(e) =>
                            updateRow(r.key, {
                              nik: e.target.value.replace(/\D/g, "").slice(0, 16),
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Jenis kelamin</Label>
                        <Select
                          value={r.jenis_kelamin ?? "L"}
                          onChange={(e) =>
                            updateRow(r.key, {
                              jenis_kelamin: e.target.value === "P" ? "P" : "L",
                            })
                          }
                        >
                          <option value="L">L</option>
                          <option value="P">P</option>
                        </Select>
                      </div>
                      <div>
                        <Label>Status keluarga (adat)</Label>
                        <Select
                          value={r.status_keluarga}
                          onChange={(e) =>
                            updateRow(r.key, { status_keluarga: e.target.value })
                          }
                        >
                          {statusKeluargaOptionsAnggota(klasifikasi).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Tempat lahir</Label>
                        <Input
                          value={r.tempat_lahir ?? ""}
                          onChange={(e) => updateRow(r.key, { tempat_lahir: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Tanggal lahir</Label>
                        <DateInput
                          value={r.tanggal_lahir ?? ""}
                          onChange={(val) => updateRow(r.key, { tanggal_lahir: val })}
                        />
                      </div>
                      <div>
                        <Label>Status kawin</Label>
                        <Select
                          value={r.status_kawin ?? STATUS_KAWIN_KODE.KAWIN}
                          onChange={(e) => updateRow(r.key, { status_kawin: e.target.value })}
                        >
                          {statusKawinOptionsForForm(
                            klasifikasi,
                            r.agama,
                            r.status_kawin
                          ).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label>Pekerjaan</Label>
                        <Input
                          value={r.pekerjaan ?? ""}
                          onChange={(e) => updateRow(r.key, { pekerjaan: e.target.value })}
                        />
                      </div>
                      {isTamiu && (
                        <div>
                          <Label>Agama</Label>
                          <Select
                            value={r.agama ?? ""}
                            onChange={(e) => updateRow(r.key, { agama: e.target.value })}
                          >
                            <option value="">— Pilih —</option>
                            {AGAMA_TAMIU_OPTIONS.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                      {isPipil && (
                        <>
                          <div>
                            <Label>Nama ayah</Label>
                            <Input
                              value={r.nama_ayah ?? ""}
                              onChange={(e) => updateRow(r.key, { nama_ayah: e.target.value })}
                            />
                          </div>
                          <div>
                            <Label>Nama ibu</Label>
                            <Input
                              value={r.nama_ibu ?? ""}
                              onChange={(e) => updateRow(r.key, { nama_ibu: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              icon={Camera}
              className="h-10 w-full justify-center text-xs"
              onClick={() => {
                setPhase("pick");
                setRows([]);
                setError("");
              }}
              disabled={busyConfirm}
            >
              Foto KK lain
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
