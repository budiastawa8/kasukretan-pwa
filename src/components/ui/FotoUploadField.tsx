import { ImagePlus, X } from "lucide-react";
import {
  KARTU_FOTO_MM,
  KARTU_FOTO_PX,
  normalizeFotoUntukKartu,
} from "../../lib/foto-penduduk";
import { Button } from "./Button";
import { Label } from "./Input";

export const MAX_FOTO_ANGGOTA_BYTES = 1024 * 1024;

export function FotoUploadField({
  label = "Foto (kartu identitas)",
  value,
  onChange,
  disabled,
}: {
  label?: string;
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}) {
  const preview =
    value?.startsWith("data:image/") ? value : value?.startsWith("file:") ? "" : value;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Pilih berkas gambar (PNG atau JPG).");
      return;
    }
    if (file.size > MAX_FOTO_ANGGOTA_BYTES) {
      window.alert("Ukuran foto maksimal 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      void normalizeFotoUntukKartu(reader.result)
        .then(onChange)
        .catch(() => window.alert("Gagal memproses foto. Coba gambar lain."));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <Label>{label}</Label>
      {value?.startsWith("file:") && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Foto perlu diunggah ulang (simpanan format lama). Pilih gambar lagi lalu simpan.
        </p>
      )}
      {preview ? (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-copper-200 bg-copper-50/60">
          <img
            src={preview}
            alt="Foto anggota"
            className="w-[5rem] aspect-[20/24] object-cover rounded border border-copper-200"
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              icon={X}
              className="shrink-0"
              onClick={() => onChange("")}
            >
              Hapus
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">Belum ada foto. Akan tampil di Kartu Krama Adat.</p>
      )}
      {!disabled && (
        <label className="inline-flex cursor-pointer">
          <input type="file" accept="image/*" className="sr-only" onChange={onFile} />
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-copper-800 hover:text-copper-950">
            <ImagePlus size={16} />
            Pilih foto
          </span>
        </label>
      )}
      <p className="text-[11px] text-copper-600">
        PNG/JPG, maks. 1 MB. Bingkai kartu {KARTU_FOTO_MM.w}×{KARTU_FOTO_MM.h} mm — unggah
        minimal {KARTU_FOTO_PX.w}×{KARTU_FOTO_PX.h} px (wajah di tengah); sistem akan crop
        otomatis.
      </p>
    </div>
  );
}
