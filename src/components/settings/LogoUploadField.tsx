import { ImagePlus, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Label } from "../ui/Input";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function LogoUploadField({
  label,
  value,
  onChange,
  disabled,
  accept = "image/*",
  hint = "PNG/JPG/SVG, maks. 2 MB.",
}: {
  label: string;
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
  accept?: string;
  hint?: string;
}) {
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Pilih berkas gambar (PNG, JPG, SVG, dll.).");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      window.alert("Ukuran logo maksimal 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onChange(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-copper-200 bg-copper-50/60">
          <img
            src={value}
            alt={label}
            className="h-16 w-auto max-w-[140px] object-contain rounded"
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
        <p className="text-xs text-muted">Belum ada logo.</p>
      )}
      {!disabled && (
        <label className="inline-flex cursor-pointer">
          <input
            type="file"
            accept={accept}
            className="sr-only"
            onChange={onFile}
          />
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-copper-800 hover:text-copper-950">
            <ImagePlus size={16} />
            Pilih gambar
          </span>
        </label>
      )}
      <p className="text-[11px] text-copper-600">{hint}</p>
    </div>
  );
}
