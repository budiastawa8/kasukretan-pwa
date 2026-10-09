import { useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { Button } from "../ui/Button";
import { Label } from "../ui/Input";

/**
 * Ambil kode dari teks tempelan (boleh seluruh pesan vendor): baris yang diawali KSK-/KSC-,
 * huruf besar, tanpa spasi.
 */
export function rapikanKodeLisensi(text: string): string {
  const upper = text.toUpperCase();
  const m = upper.match(/\b(KSK|KSC)[ \t-]*[0-9A-Z][0-9A-Z \t-]*/);
  return (m ? m[0] : upper).replace(/\s+/g, "").replace(/-+$/, "");
}

export function LicenseCodeInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [pasteError, setPasteError] = useState("");

  async function tempel() {
    setPasteError("");
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setPasteError("Clipboard kosong — salin dulu kode dari pesan vendor.");
        return;
      }
      onChange(rapikanKodeLisensi(text));
    } catch {
      setPasteError("Tidak bisa membaca clipboard. Klik kotak kode lalu tekan Ctrl+V.");
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-2 mb-1">
        <Label className="mb-0">{label}</Label>
        <Button
          type="button"
          variant="secondary"
          icon={ClipboardPaste}
          className="h-8 px-2.5 text-xs"
          disabled={disabled}
          onClick={() => void tempel()}
        >
          Tempel
        </Button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          e.preventDefault();
          onChange(rapikanKodeLisensi(e.clipboardData.getData("text")));
        }}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-md border border-copper-200 bg-card px-3 py-2 font-mono text-sm leading-relaxed break-all text-foreground outline-none focus:ring-2 focus:ring-copper-400/40 focus:border-copper-400 disabled:opacity-60"
      />
      {pasteError && <p className="mt-1 text-xs text-amber-800">{pasteError}</p>}
    </div>
  );
}
