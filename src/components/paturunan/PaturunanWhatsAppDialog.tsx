import { useEffect, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Label } from "../ui/Input";
import {
  buildPaturunanWhatsAppMessageFromTemplate,
  copyWhatsAppMessage,
  openWhatsAppChat,
} from "../../lib/whatsapp";

type Props = {
  open: boolean;
  onClose: () => void;
  nomorKontak: string;
  kepalaNama: string;
  sisa: number;
  tagihan: number;
  dibayar?: number;
  iuranNama?: string | null;
};

export function PaturunanWhatsAppDialog({
  open,
  onClose,
  nomorKontak,
  kepalaNama,
  sisa,
  tagihan,
  dibayar,
  iuranNama,
}: Props) {
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage(
      buildPaturunanWhatsAppMessageFromTemplate({
        nama: kepalaNama,
        sisa,
        tagihan,
        dibayar,
        iuranNama,
      })
    );
    setCopied(false);
  }, [open, kepalaNama, sisa, tagihan, dibayar, iuranNama]);

  async function handleCopy() {
    const ok = await copyWhatsAppMessage(message);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  }

  async function handleOpen() {
    setBusy(true);
    try {
      await openWhatsAppChat(nomorKontak, message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Kirim WhatsApp" onClose={onClose} dismissOnBackdrop className="max-w-xl">
      <div className="space-y-3">
        <p className="text-sm text-copper-900">
          <strong>{kepalaNama}</strong>
          <span className="text-muted"> · </span>
          <span className="font-mono text-xs">{nomorKontak}</span>
        </p>

        <div>
          <Label>Pesan</Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-copper-400/50"
            spellCheck={false}
          />
        </div>

        <p className="text-xs text-muted leading-relaxed rounded-md border border-copper-100 bg-copper-50/80 px-2.5 py-2">
          Jika <strong>WhatsApp Web sudah terbuka</strong>, gunakan <strong>Salin pesan</strong> lalu
          tempel di chat yang ada — browser tidak mengizinkan aplikasi memakai tab yang sudah terbuka.
          Tombol <strong>Buka WhatsApp</strong> selalu membuka tab/jendela baru.
        </p>

        <p className="text-xs text-muted">
          Ubah template baku di{" "}
          <span className="text-copper-800 font-medium">Pengaturan → Template pesan WhatsApp</span>.
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="secondary" icon={Copy} onClick={() => void handleCopy()}>
            {copied ? "Disalin" : "Salin pesan"}
          </Button>
          <Button
            type="button"
            icon={ExternalLink}
            onClick={() => void handleOpen()}
            disabled={busy || !message.trim()}
          >
            {busy ? "Membuka…" : "Buka WhatsApp"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Batal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
