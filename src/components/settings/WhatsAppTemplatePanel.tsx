import { useEffect, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Card } from "../ui/Card";
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

export function WhatsAppTemplatePanel() {
  const [dudukanTunggakan, setDudukanTunggakan] = useState(DEFAULT_DUDUKAN_TUNGGAKAN_TEMPLATE);
  const [dudukanUmum, setDudukanUmum] = useState(DEFAULT_DUDUKAN_UMUM_TEMPLATE);
  const [paturunanTunggakan, setPaturunanTunggakan] = useState(DEFAULT_PATURUNAN_TUNGGAKAN_TEMPLATE);
  const [paturunanUmum, setPaturunanUmum] = useState(DEFAULT_PATURUNAN_UMUM_TEMPLATE);
  const [mipilUmum, setMipilUmum] = useState(DEFAULT_MIPIL_UMUM_TEMPLATE);
  const [setoranTelat, setSetoranTelat] = useState(DEFAULT_SETORAN_TELAT_TEMPLATE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDudukanTunggakan(getDudukanTunggakanTemplate());
    setDudukanUmum(getDudukanUmumTemplate());
    setPaturunanTunggakan(getPaturunanTunggakanTemplate());
    setPaturunanUmum(getPaturunanUmumTemplate());
    setMipilUmum(getMipilUmumTemplate());
    setSetoranTelat(getSetoranTelatTemplate());
  }, []);

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

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-copper-950">Template pesan WhatsApp</h2>
        <p className="text-xs text-muted mt-1 leading-relaxed">
          Dipakai tombol WhatsApp di halaman Dudukan, Paturunan, daftar Krama Mipil, serta pengingat
          setor petugas (Fonnte / WhatsApp). Placeholder diganti otomatis saat kirim.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-copper-900">Dudukan — Krama Tamiu / Tamiu</h3>
          <ul className="text-xs text-muted space-y-0.5 rounded-md border border-copper-100 bg-copper-50/60 px-3 py-2">
            {WHATSAPP_TEMPLATE_PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <code className="text-copper-900">{p.key}</code> — {p.desc}
              </li>
            ))}
          </ul>
          <div>
            <Label>Ada tunggakan</Label>
            <textarea
              value={dudukanTunggakan}
              onChange={(e) => setDudukanTunggakan(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y"
            />
          </div>
          <div>
            <Label>Tanpa tunggakan / umum</Label>
            <textarea
              value={dudukanUmum}
              onChange={(e) => setDudukanUmum(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-copper-900">Paturunan — Krama Mipil</h3>
          <ul className="text-xs text-muted space-y-0.5 rounded-md border border-copper-100 bg-copper-50/60 px-3 py-2">
            {PATURUNAN_WHATSAPP_TEMPLATE_PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <code className="text-copper-900">{p.key}</code> — {p.desc}
              </li>
            ))}
          </ul>
          <div>
            <Label>Ada sisa paturunan</Label>
            <textarea
              value={paturunanTunggakan}
              onChange={(e) => setPaturunanTunggakan(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y"
            />
          </div>
          <div>
            <Label>Lunas / pengumuman umum</Label>
            <textarea
              value={paturunanUmum}
              onChange={(e) => setPaturunanUmum(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-copper-900">Krama Mipil — pengumuman umum</h3>
          <ul className="text-xs text-muted space-y-0.5 rounded-md border border-copper-100 bg-copper-50/60 px-3 py-2">
            {MIPIL_WHATSAPP_TEMPLATE_PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <code className="text-copper-900">{p.key}</code> — {p.desc}
              </li>
            ))}
          </ul>
          <div>
            <Label>Pengumuman umum</Label>
            <textarea
              value={mipilUmum}
              onChange={(e) => setMipilUmum(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-copper-900">
            Setoran — pengingat petugas (Fonnte)
          </h3>
          <p className="text-[11px] text-muted leading-relaxed">
            Dipakai tombol <strong>Ingatkan setor</strong> di panel Setoran dan banner telat. Disimpan
            di browser ini (sama seperti template lain).
          </p>
          <ul className="text-xs text-muted space-y-0.5 rounded-md border border-copper-100 bg-copper-50/60 px-3 py-2">
            {SETORAN_TELAT_WHATSAPP_TEMPLATE_PLACEHOLDERS.map((p) => (
              <li key={p.key}>
                <code className="text-copper-900">{p.key}</code> — {p.desc}
              </li>
            ))}
          </ul>
          <div>
            <Label>Pesan pengingat setor</Label>
            <textarea
              value={setoranTelat}
              onChange={(e) => setSetoranTelat(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-md border border-copper-200 bg-white px-3 py-2 text-sm leading-relaxed resize-y font-mono"
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" icon={Check}>
            Simpan template
          </Button>
          <Button type="button" variant="secondary" icon={RotateCcw} onClick={handleReset}>
            Kembalikan default
          </Button>
          {saved && <span className="text-sm text-green-700 self-center">Tersimpan.</span>}
        </div>
      </form>
    </Card>
  );
}
