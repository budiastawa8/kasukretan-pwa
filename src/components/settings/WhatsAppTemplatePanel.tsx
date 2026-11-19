import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, MessageCircle, RotateCcw } from "lucide-react";
import { Button } from "../ui/Button";
import { Label } from "../ui/Input";
import {
  DEFAULT_DUDUKAN_TUNGGAKAN_TEMPLATE,
  DEFAULT_DUDUKAN_UMUM_TEMPLATE,
  DEFAULT_PATURUNAN_TUNGGAKAN_TEMPLATE,
  DEFAULT_PATURUNAN_UMUM_TEMPLATE,
  DEFAULT_MIPIL_UMUM_TEMPLATE,
  DEFAULT_SETORAN_TELAT_TEMPLATE,
  WHATSAPP_TEMPLATE_PLACEHOLDERS,
  PATURUNAN_WHATSAPP_TEMPLATE_PLACEHOLDERS,
  MIPIL_WHATSAPP_TEMPLATE_PLACEHOLDERS,
  SETORAN_TELAT_WHATSAPP_TEMPLATE_PLACEHOLDERS,
  getDudukanTunggakanTemplate,
  getDudukanUmumTemplate,
  getPaturunanTunggakanTemplate,
  getPaturunanUmumTemplate,
  getMipilUmumTemplate,
  getSetoranTelatTemplate,
  resetAllWhatsAppTemplates,
  saveDudukanTunggakanTemplate,
  saveDudukanUmumTemplate,
  savePaturunanTunggakanTemplate,
  savePaturunanUmumTemplate,
  saveMipilUmumTemplate,
  saveSetoranTelatTemplate,
} from "../../lib/whatsapp";
import { CollapsibleSettingsSection } from "./CollapsibleSettingsSection";

type Placeholder = { key: string; desc: string };

type SectionId = "dudukan" | "paturunan" | "mipil" | "setoran";

function PlaceholderHints({ items }: { items: readonly Placeholder[] }) {
  const id = useId();
  return (
    <details className="group/ph text-xs">
      <summary className="cursor-pointer list-none text-copper-800 hover:text-copper-950 select-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1">
        <ChevronDown
          size={12}
          className="shrink-0 transition-transform group-open/ph:rotate-180"
          aria-hidden
        />
        Lihat placeholder
      </summary>
      <ul
        id={id}
        className="mt-2 space-y-0.5 rounded-md border border-copper-100 bg-copper-50/60 px-3 py-2 text-muted"
      >
        {items.map((p) => (
          <li key={p.key}>
            <code className="text-copper-900">{p.key}</code> — {p.desc}
          </li>
        ))}
      </ul>
    </details>
  );
}

function TemplateSection({
  id,
  title,
  hint,
  open,
  onToggle,
  placeholders,
  children,
}: {
  id: SectionId;
  title: string;
  hint?: string;
  open: boolean;
  onToggle: (id: SectionId) => void;
  placeholders: readonly Placeholder[];
  children: ReactNode;
}) {
  return (
    <details
      className="group/sec rounded-md border border-copper-200 overflow-hidden"
      open={open}
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-copper-900 hover:bg-copper-50/80 select-none [&::-webkit-details-marker]:hidden"
        onClick={(e) => {
          e.preventDefault();
          onToggle(id);
        }}
      >
        <span className="flex-1">{title}</span>
        <ChevronDown
          size={14}
          className="text-muted shrink-0 transition-transform group-open/sec:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-copper-200 px-3 py-3 space-y-3 bg-white">
        {hint && <p className="text-[11px] text-muted leading-relaxed">{hint}</p>}
        <PlaceholderHints items={placeholders} />
        {children}
      </div>
    </details>
  );
}

export function WhatsAppTemplatePanel() {
  const [dudukanTunggakan, setDudukanTunggakan] = useState(DEFAULT_DUDUKAN_TUNGGAKAN_TEMPLATE);
  const [dudukanUmum, setDudukanUmum] = useState(DEFAULT_DUDUKAN_UMUM_TEMPLATE);
  const [paturunanTunggakan, setPaturunanTunggakan] = useState(DEFAULT_PATURUNAN_TUNGGAKAN_TEMPLATE);
  const [paturunanUmum, setPaturunanUmum] = useState(DEFAULT_PATURUNAN_UMUM_TEMPLATE);
  const [mipilUmum, setMipilUmum] = useState(DEFAULT_MIPIL_UMUM_TEMPLATE);
  const [setoranTelat, setSetoranTelat] = useState(DEFAULT_SETORAN_TELAT_TEMPLATE);
  const [saved, setSaved] = useState(false);
  const [openSection, setOpenSection] = useState<SectionId | null>(null);

  useEffect(() => {
    setDudukanTunggakan(getDudukanTunggakanTemplate());
    setDudukanUmum(getDudukanUmumTemplate());
    setPaturunanTunggakan(getPaturunanTunggakanTemplate());
    setPaturunanUmum(getPaturunanUmumTemplate());
    setMipilUmum(getMipilUmumTemplate());
    setSetoranTelat(getSetoranTelatTemplate());
  }, []);

  function handleSectionToggle(id: SectionId) {
    setOpenSection((prev) => (prev === id ? null : id));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveDudukanTunggakanTemplate(dudukanTunggakan);
    saveDudukanUmumTemplate(dudukanUmum);
    savePaturunanTunggakanTemplate(paturunanTunggakan);
    savePaturunanUmumTemplate(paturunanUmum);
    saveMipilUmumTemplate(mipilUmum);
    saveSetoranTelatTemplate(setoranTelat);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  function handleReset() {
    resetAllWhatsAppTemplates();
    setDudukanTunggakan(DEFAULT_DUDUKAN_TUNGGAKAN_TEMPLATE);
    setDudukanUmum(DEFAULT_DUDUKAN_UMUM_TEMPLATE);
    setPaturunanTunggakan(DEFAULT_PATURUNAN_TUNGGAKAN_TEMPLATE);
    setPaturunanUmum(DEFAULT_PATURUNAN_UMUM_TEMPLATE);
    setMipilUmum(DEFAULT_MIPIL_UMUM_TEMPLATE);
    setSetoranTelat(DEFAULT_SETORAN_TELAT_TEMPLATE);
    setSaved(false);
  }

  const textareaClass =
    "mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y";

  return (
    <CollapsibleSettingsSection
      title="Template pesan WhatsApp"
      subtitle="Opsional — Dudukan, Paturunan, Mipil, Setoran"
      icon={MessageCircle}
    >
      <p className="text-xs text-muted leading-relaxed -mt-1">
        Dipakai tombol WhatsApp di halaman terkait dan pengingat setor petugas. Buka satu jenis
        pesan untuk mengedit; placeholder diganti otomatis saat kirim.
      </p>

      <form onSubmit={handleSave} className="space-y-3">
        <TemplateSection
          id="dudukan"
          title="Dudukan — Krama Tamiu / Tamiu"
          open={openSection === "dudukan"}
          onToggle={handleSectionToggle}
          placeholders={WHATSAPP_TEMPLATE_PLACEHOLDERS}
        >
          <div>
            <Label>Ada tunggakan</Label>
            <textarea
              value={dudukanTunggakan}
              onChange={(e) => setDudukanTunggakan(e.target.value)}
              rows={3}
              className={textareaClass}
            />
          </div>
          <div>
            <Label>Tanpa tunggakan / umum</Label>
            <textarea
              value={dudukanUmum}
              onChange={(e) => setDudukanUmum(e.target.value)}
              rows={2}
              className={textareaClass}
            />
          </div>
        </TemplateSection>

        <TemplateSection
          id="paturunan"
          title="Paturunan — Krama Mipil"
          open={openSection === "paturunan"}
          onToggle={handleSectionToggle}
          placeholders={PATURUNAN_WHATSAPP_TEMPLATE_PLACEHOLDERS}
        >
          <div>
            <Label>Ada sisa paturunan</Label>
            <textarea
              value={paturunanTunggakan}
              onChange={(e) => setPaturunanTunggakan(e.target.value)}
              rows={3}
              className={textareaClass}
            />
          </div>
          <div>
            <Label>Lunas / pengumuman umum</Label>
            <textarea
              value={paturunanUmum}
              onChange={(e) => setPaturunanUmum(e.target.value)}
              rows={2}
              className={textareaClass}
            />
          </div>
        </TemplateSection>

        <TemplateSection
          id="mipil"
          title="Krama Mipil — pengumuman umum"
          open={openSection === "mipil"}
          onToggle={handleSectionToggle}
          placeholders={MIPIL_WHATSAPP_TEMPLATE_PLACEHOLDERS}
        >
          <div>
            <Label>Pengumuman umum</Label>
            <textarea
              value={mipilUmum}
              onChange={(e) => setMipilUmum(e.target.value)}
              rows={2}
              className={textareaClass}
            />
          </div>
        </TemplateSection>

        <TemplateSection
          id="setoran"
          title="Setoran — pengingat petugas"
          hint="Dipakai tombol Ingatkan setor di panel Setoran dan banner telat."
          open={openSection === "setoran"}
          onToggle={handleSectionToggle}
          placeholders={SETORAN_TELAT_WHATSAPP_TEMPLATE_PLACEHOLDERS}
        >
          <div>
            <Label>Pesan pengingat setor</Label>
            <textarea
              value={setoranTelat}
              onChange={(e) => setSetoranTelat(e.target.value)}
              rows={5}
              className={`${textareaClass} font-mono`}
            />
          </div>
        </TemplateSection>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" icon={Check}>
            Simpan template
          </Button>
          <Button type="button" variant="secondary" icon={RotateCcw} onClick={handleReset}>
            Kembalikan default
          </Button>
          {saved && <span className="text-sm text-green-700 self-center">Tersimpan.</span>}
        </div>
      </form>
    </CollapsibleSettingsSection>
  );
}
