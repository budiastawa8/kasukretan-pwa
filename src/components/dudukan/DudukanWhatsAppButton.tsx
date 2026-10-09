import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { hasWhatsAppContact } from "../../lib/whatsapp";
import type { DudukanTunggakanBulan } from "../../lib/services/dudukan";
import { Button } from "../ui/Button";
import { DudukanWhatsAppDialog } from "./DudukanWhatsAppDialog";

type Props = {
  nomorKontak?: string | null;
  kepalaNama: string;
  tunggakanBulan: number;
  totalSisa: number;
  bulanTunggakan?: DudukanTunggakanBulan[];
  kramaId?: string;
  className?: string;
  /** Labeled secondary button (e.g. phone card lists) */
  label?: string;
};

export function DudukanWhatsAppButton({
  nomorKontak,
  kepalaNama,
  tunggakanBulan,
  totalSisa,
  bulanTunggakan,
  kramaId,
  className,
  label,
}: Props) {
  const [open, setOpen] = useState(false);
  const enabled = hasWhatsAppContact(nomorKontak);
  const title =
    enabled ?
      "Kirim pengingat via WhatsApp"
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
        <DudukanWhatsAppDialog
          open={open}
          onClose={() => setOpen(false)}
          nomorKontak={nomorKontak}
          kepalaNama={kepalaNama}
          tunggakanBulan={tunggakanBulan}
          totalSisa={totalSisa}
          bulanTunggakan={bulanTunggakan}
          kramaId={kramaId}
        />
      )}
    </>
  );
}
