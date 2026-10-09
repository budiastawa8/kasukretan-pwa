import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { hasWhatsAppContact } from "../../lib/whatsapp";
import { Button } from "../ui/Button";
import { KramaMipilWhatsAppDialog } from "./KramaMipilWhatsAppDialog";

type Props = {
  nomorKontak?: string | null;
  kepalaNama: string;
  className?: string;
};

export function KramaMipilWhatsAppButton({ nomorKontak, kepalaNama, className }: Props) {
  const [open, setOpen] = useState(false);
  const enabled = hasWhatsAppContact(nomorKontak);
  const title =
    enabled ?
      "Kirim pengumuman via WhatsApp"
    : "Nomor kontak belum diisi atau tidak valid";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        icon={MessageCircle}
        iconOnly
        disabled={!enabled}
        title={title}
        aria-label={title}
        className={className ?? "min-h-7 min-w-7 text-emerald-700 disabled:opacity-35"}
        onClick={() => setOpen(true)}
      />
      {enabled && nomorKontak && (
        <KramaMipilWhatsAppDialog
          open={open}
          onClose={() => setOpen(false)}
          nomorKontak={nomorKontak}
          kepalaNama={kepalaNama}
        />
      )}
    </>
  );
}
