import { useEffect, useMemo, useState } from "react";
import {
  getPengarepWarnings,
  type PengarepDesaKetentuan,
} from "../../lib/pengarep-warnings";
import { normalizeTanggalIsoForInput } from "../../lib/date-iso";
import { AGAMA_HINDU, AGAMA_TAMIU_OPTIONS } from "../../lib/agama-tamiu";
import {
  STATUS_KAWIN_KODE,
  statusKawinOptionsForForm,
} from "../../lib/status-kawin";
import type { AnggotaDraft, JenisKramaMipilRow, KlasifikasiKode } from "../../lib/types";
import {
  formatStatusKeluargaAnggota,
  gelarKepalaLabel,
  gelarKepalaStatus,
  isGelarKepalaStatus,
  isStatusKeluargaAnak,
  resolveAnakParentNamesFromPipil,
  statusKeluargaOptionsAnggota,
  type AnggotaNamaStatus,
} from "../../lib/status-keluarga";
import { Check, X } from "lucide-react";
import { Button } from "../ui/Button";
import { FotoUploadField } from "../ui/FotoUploadField";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { PekerjaanField } from "../ui/PekerjaanField";
import { Modal } from "../ui/Modal";
const ANGGOTA_FORM_COMPACT =
  "space-y-2 leading-snug [&_label]:mb-0.5 [&_p]:leading-snug [&_.space-y-2]:space-y-1.5 [&_input]:min-h-11 [&_input]:text-base [&_input]:py-2 sm:[&_input]:min-h-8 sm:[&_input]:text-sm sm:[&_input]:py-1.5 [&_select]:min-h-11 [&_select]:text-base [&_select]:py-2 sm:[&_select]:min-h-8 sm:[&_select]:text-sm sm:[&_select]:py-1.5 [&_.flatpickr-input]:min-h-11 [&_.flatpickr-input]:py-2 sm:[&_.flatpickr-input]:min-h-8 sm:[&_.flatpickr-input]:py-1.5";

export type AnggotaFormValues = Omit<AnggotaDraft, "clientId">;

function valuesFromInitial(
  initial: AnggotaFormValues | undefined,
  kode: KlasifikasiKode,
  pengarepBaru = false
): AnggotaFormValues {
  if (!initial) {
    const empty = emptyValues(kode);
    return pengarepBaru ? { ...empty, status_keluarga: "Suami" } : empty;
  }
  return {
    ...initial,
    tanggal_lahir: normalizeTanggalIsoForInput(initial.tanggal_lahir),
  };
}

const emptyValues = (kode: KlasifikasiKode): AnggotaFormValues => ({
  nama_lengkap: "",
  jenis_kelamin: "L",
  status_keluarga: kode === "MIPIL" ? "Istri" : "Istri",
  tempat_lahir: "",
  tanggal_lahir: "",
  status_kawin: STATUS_KAWIN_KODE.KAWIN,
  pekerjaan: "",
  nama_ibu: "",
  nama_ayah: "",
  nik_atau_nika: "",
  agama: kode === "MIPIL" || kode === "KRAMA_TAMIU" ? AGAMA_HINDU : "",
  foto_url: "",
});

export function AnggotaFormDialog({
  open,
  klasifikasi,
  title,
  initial,
  onSave,
  onCancel,
  saving,
  isKepalaMember = false,
  isPengarepForm = false,
  pengarepBaru = false,
  pengarepKetentuan,
  jenisMipil,
  jenisMipilId,
  formSessionKey,
  pipilFamilyMembers = [],
}: {
  open: boolean;
  klasifikasi: KlasifikasiKode;
  title: string;
  /** Berubah tiap buka tambah/edit agar form terisi ulang dengan benar */
  formSessionKey: string | null;
  initial?: AnggotaFormValues;
  /** Anggota Pipil lain (selain yang sedang diedit) — untuk isi otomatis nama ibu/ayah anak */
  pipilFamilyMembers?: AnggotaNamaStatus[];
  /** Anggota yang saat ini Pengarep/Pengajeg — status keluarga tidak diubah dari dialog ini */
  isKepalaMember?: boolean;
  /** Form sedang mengedit Pengarep — tampilkan peringatan ketentuan desa */
  isPengarepForm?: boolean;
  /** Anggota pertama Pipil baru — otomatis dijadikan Pengarep setelah disimpan */
  pengarepBaru?: boolean;
  pengarepKetentuan?: PengarepDesaKetentuan;
  jenisMipil?: JenisKramaMipilRow[];
  /** Jenis krama Mipil pada kartu (untuk mengecek apakah peringatan sudah ditindaklanjuti) */
  jenisMipilId?: string | null;
  onSave: (values: AnggotaFormValues) => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}) {
  const isPipil = klasifikasi === "MIPIL";
  const isKramaTamiu = klasifikasi === "KRAMA_TAMIU";
  const isTamiu = klasifikasi === "TAMIU";
  const isPemasih = isKramaTamiu || isTamiu;
  const showFotoKartu = isPipil || isKramaTamiu || isTamiu;
  const gelar = gelarKepalaStatus(klasifikasi);
  const [v, setV] = useState<AnggotaFormValues>(() =>
    valuesFromInitial(initial, klasifikasi, pengarepBaru)
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFormError("");
    setV(valuesFromInitial(initial, klasifikasi, pengarepBaru));
  }, [open, formSessionKey, initial, klasifikasi, pengarepBaru]);

  const statusKawinOptions = statusKawinOptionsForForm(klasifikasi, v.agama, v.status_kawin);

  const pengarepWarnings = useMemo(() => {
    if (!isPipil || !isPengarepForm || !pengarepKetentuan) return [];
    return getPengarepWarnings({
      klasifikasi,
      statusKawin: v.status_kawin,
      tanggalLahir: v.tanggal_lahir,
      jenisMipilId,
      ketentuan: pengarepKetentuan,
      jenisNama: (id) => jenisMipil?.find((j) => j.id === id)?.nama,
    });
  }, [
    isPipil,
    isPengarepForm,
    pengarepKetentuan,
    klasifikasi,
    v.status_kawin,
    v.tanggal_lahir,
    jenisMipilId,
    jenisMipil,
  ]);

  useEffect(() => {
    if (!open || !isTamiu) return;
    const allowed = statusKawinOptionsForForm(klasifikasi, v.agama, v.status_kawin).map(
      (o) => o.value
    );
    if (v.status_kawin && !allowed.includes(v.status_kawin)) {
      setV((prev) => ({ ...prev, status_kawin: STATUS_KAWIN_KODE.KAWIN }));
    }
  }, [open, isTamiu, klasifikasi, v.agama, v.status_kawin]);

  function setField<K extends keyof AnggotaFormValues>(key: K, val: AnggotaFormValues[K]) {
    setV((prev) => ({ ...prev, [key]: val }));
  }

  function handleStatusKeluargaChange(nextStatus: string) {
    setV((prev) => {
      const next = { ...prev, status_keluarga: nextStatus };
      if (isPipil && isStatusKeluargaAnak(nextStatus)) {
        const { namaIbu, namaAyah } = resolveAnakParentNamesFromPipil(pipilFamilyMembers, {
          excludeNama: prev.nama_lengkap,
        });
        return { ...next, nama_ibu: namaIbu, nama_ayah: namaAyah };
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.nama_lengkap.trim()) {
      setFormError("Nama lengkap wajib diisi.");
      return;
    }
    if (isPemasih && !v.nik_atau_nika?.trim()) {
      setFormError("NIK / NIKA wajib diisi.");
      return;
    }
    if (isTamiu && !v.agama?.trim()) {
      setFormError("Agama wajib dipilih.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      await onSave({
        ...v,
        agama: isPipil || isKramaTamiu ? AGAMA_HINDU : v.agama,
        status_keluarga: isKepalaMember
          ? v.status_keluarga
          : isGelarKepalaStatus(v.status_keluarga, klasifikasi)
            ? gelar
            : v.status_keluarga,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const busy = saving || submitting;

  return (
    <>
      <Modal
        open={open}
        title={title}
        onClose={onCancel}
        className="max-w-lg"
        canClose={!busy}
        closeOnEscape={!busy}
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button
              type="button"
              variant="secondary"
              icon={X}
              className="order-2 h-11 justify-center text-base sm:order-none sm:h-9 sm:text-sm"
              onClick={onCancel}
              disabled={busy}
            >
              Batal
            </Button>
            <Button
              type="submit"
              form="anggota-form-dialog"
              icon={Check}
              className="order-1 h-11 justify-center text-base sm:order-none sm:h-9 sm:flex-1 sm:text-sm"
              disabled={busy}
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        }
      >
        <form
          id="anggota-form-dialog"
          onSubmit={submit}
          className={ANGGOTA_FORM_COMPACT}
        >
          {pengarepBaru && (
            <p className="rounded border border-copper-200 bg-copper-50 px-2.5 py-1.5 text-xs leading-snug text-copper-900">
              Anggota pertama ini otomatis menjadi <strong>{gelarKepalaLabel(klasifikasi)}</strong>.
              Anggota keluarga lainnya dan data kartu diisi setelah ini.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-2">
            <div className="sm:col-span-2">
              <Label>Nama lengkap</Label>
              <Input
                value={v.nama_lengkap}
                onChange={(e) => setField("nama_lengkap", e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <Label>Jenis kelamin</Label>
              <Select
                value={v.jenis_kelamin}
                onChange={(e) => setField("jenis_kelamin", e.target.value)}
              >
                <option value="L">L</option>
                <option value="P">P</option>
              </Select>
            </div>
            <div>
              <Label>Status keluarga</Label>
              {isKepalaMember ? (
                <>
                  <p className="mt-0 font-medium leading-snug text-copper-950">
                    {formatStatusKeluargaAnggota(v.status_keluarga, klasifikasi)}
                    <span className="font-normal text-copper-600">
                      {" "}
                      · {gelarKepalaLabel(klasifikasi)}
                    </span>
                  </p>
                  <p className="mt-0 text-[11px] leading-snug text-copper-600">
                    Peran {gelarKepalaLabel(klasifikasi)} diubah lewat field Nama{" "}
                    {gelarKepalaLabel(klasifikasi)} pada data utama, bukan di sini.
                  </p>
                </>
              ) : (
                <>
                  <Select
                    value={v.status_keluarga}
                    onChange={(e) => handleStatusKeluargaChange(e.target.value)}
                  >
                    {statusKeluargaOptionsAnggota(klasifikasi).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  {pengarepBaru ? (
                    <p className="mt-0 text-[11px] leading-snug text-copper-600">
                      Hubungan {gelarKepalaLabel(klasifikasi)} dalam keluarga (umumnya Suami).
                    </p>
                  ) : (
                    isPipil && (
                      <p className="mt-0 text-[11px] leading-snug text-copper-600">
                        Pengarep dipilih di field Nama Pengarep pada data utama Pipil.
                      </p>
                    )
                  )}
                </>
              )}
            </div>
            <div>
              <Label>{isPemasih ? "NIK / NIKA" : "NIK (opsional)"}</Label>
              <Input
                value={v.nik_atau_nika ?? ""}
                onChange={(e) => setField("nik_atau_nika", e.target.value)}
                required={isPemasih}
              />
            </div>
            {isTamiu && (
              <div>
                <Label>Agama</Label>
                <Select
                  value={v.agama ?? ""}
                  onChange={(e) => setField("agama", e.target.value)}
                  required
                >
                  <option value="">— Pilih agama —</option>
                  {AGAMA_TAMIU_OPTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>Tempat lahir</Label>
              <Input
                value={v.tempat_lahir ?? ""}
                onChange={(e) => setField("tempat_lahir", e.target.value)}
              />
            </div>
            <div>
              <Label>Tanggal lahir</Label>
              <DateInput
                value={v.tanggal_lahir ?? ""}
                onChange={(val) => setField("tanggal_lahir", val)}
              />
            </div>
            {pengarepWarnings.length > 0 && (
              <div className="space-y-1 sm:col-span-2">
                {pengarepWarnings.map((msg) => (
                  <p
                    key={msg}
                    className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-900"
                  >
                    {msg}
                  </p>
                ))}
              </div>
            )}
            <div>
              <Label>Status perkawinan</Label>
              <Select
                value={v.status_kawin ?? STATUS_KAWIN_KODE.KAWIN}
                onChange={(e) => setField("status_kawin", e.target.value)}
              >
                {statusKawinOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Pekerjaan</Label>
              <PekerjaanField
                value={v.pekerjaan ?? ""}
                onChange={(val) => setField("pekerjaan", val)}
                disabled={busy}
              />
            </div>
            {showFotoKartu && (
              <FotoUploadField
                value={v.foto_url ?? ""}
                onChange={(url) => setField("foto_url", url)}
                disabled={busy}
              />
            )}
            {isPipil && (
              <>
                <div>
                  <Label>Nama ibu</Label>
                  <Input
                    value={v.nama_ibu ?? ""}
                    onChange={(e) => setField("nama_ibu", e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nama ayah</Label>
                  <Input
                    value={v.nama_ayah ?? ""}
                    onChange={(e) => setField("nama_ayah", e.target.value)}
                  />
                </div>
                {isStatusKeluargaAnak(v.status_keluarga) && (
                  <p className="text-[11px] leading-snug text-copper-600 sm:col-span-2">
                    Diisi otomatis dari anggota berstatus Istri (ibu) dan Suami (ayah) di Pipil
                    ini jika ada; bisa diketik manual jika belum terdaftar.
                  </p>
                )}
              </>
            )}
          </div>
          {formError && (
            <p className="rounded border border-red-100 bg-red-50 px-2 py-1 text-xs text-red-700">
              {formError}
            </p>
          )}
        </form>
      </Modal>
    </>
  );
}
