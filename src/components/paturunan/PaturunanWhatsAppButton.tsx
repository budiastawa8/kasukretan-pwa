import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { hasWhatsAppContact } from "../../lib/whatsapp";
import { Button } from "../ui/Button";
import { PaturunanWhatsAppDialog } from "./PaturunanWhatsAppDialog";

type Props = {
  nomorKontak?: string | null;
  kepalaNama: string;
  sisa?: number;
  tagihan?: number;
  dibayar?: number;
  iuranNama?: string | null;
  className?: string;
  /** Labeled secondary button (e.g. phone card lists) */
  label?: string;
};

export function PaturunanWhatsAppButton({
  nomorKontak,
  kepalaNama,
  sisa = 0,
  tagihan = 0,
  dibayar = 0,
  iuranNama,
  className,
  label,
}: Props) {
  const [open, setOpen] = useState(false);
  const enabled = hasWhatsAppContact(nomorKontak);
  const title =
    enabled ?
      "Kirim pesan via WhatsApp"
    : "Nomor kontak belum diisi atau tidak valid";

  return (
    <>
      <Button
        type="button"
        variant={label ? "secondary" : "ghost"}
        icon={MessageCircle}
        iconOnly={!label}
        disabled={!enabled}
        title={title}
        aria-label={title}
        className={
          className ??
          (label
            ? "h-10 justify-center text-xs text-emerald-800"
            : "min-h-7 min-w-7 text-emerald-700 disabled:opacity-35")
        }
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {enabled && nomorKontak && (
        <PaturunanWhatsAppDialog
          open={open}
          onClose={() => setOpen(false)}
          nomorKontak={nomorKontak}
          kepalaNama={kepalaNama}
          sisa={sisa}
          tagihan={tagihan}
          dibayar={dibayar}
          iuranNama={iuranNama}
        />
      )}
    </>
  );
}
