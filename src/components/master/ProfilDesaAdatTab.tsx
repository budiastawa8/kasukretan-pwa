import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  DESA_ADAT_UPDATED_EVENT,
  getDesaAdatWithMedia,
  updateProfilDesaAdat,
} from "../../lib/services/desa";
import { listJenisMipil } from "../../lib/services/master";
import {
  akhiriKramaDapukan,
  listKramaDapukanAktif,
  syncNyadaOtomatis,
  type KramaDapukanRingkas,
} from "../../lib/services/nyada-otomatis";
import { MatikanDapukanDialog } from "./MatikanDapukanDialog";
import { normalizeTanggalIsoForInput } from "../../lib/date-iso";
import { DateInput } from "../ui/DateInput";
import type { DesaAdat, JenisKramaMipilRow } from "../../lib/types";
import { cn } from "../../lib/utils";
import { LogoUploadField } from "../settings/LogoUploadField";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Input, Label, Select } from "../ui/Input";
import { MASTER_CARD, MASTER_CARD_PHONE, MASTER_CARD_TITLED } from "./master-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";

type ProfilForm = {
  alamat_desa_adat: string;
  logo_url: string;
  logo_mda_url: string;
  jenis_umur_nyada: string;
  nyada_berlaku_mulai: string;
  jenis_krama_mipil_id: string;
  jenis_cerai_mati_mipil_id: string;
  jenis_cerai_hidup_mipil_id: string;
  krama_dapukan_aktif: boolean;
  krama_dapukan_berlaku_mulai: string;
  batas_umur_dapukan: string;
  jenis_dapukan_mipil_id: string;
  jenis_balu_dapukan_mipil_id: string;
  jenis_balu_nglintik_mipil_id: string;
  yowana_umur_min: string;
  yowana_umur_max: string;
  bandesa_nama: string;
  bandesa_jabatan: string;
  bandesa_nik: string;
  bandesa_ttd_url: string;
  call_center: string;
  panyarikan_nama: string;
  panyarikan_jabatan: string;
  panyarikan_ttd_url: string;
  patengen_nama: string;
  patengen_jabatan: string;
  pararem_nomor: string;
  pararem_tahun: string;
  pararem_judul: string;
};

const emptyForm = (): ProfilForm => ({
  alamat_desa_adat: "",
  logo_url: "",
  logo_mda_url: "",
  jenis_umur_nyada: "",
  nyada_berlaku_mulai: "",
  jenis_krama_mipil_id: "",
  jenis_cerai_mati_mipil_id: "",
  jenis_cerai_hidup_mipil_id: "",
  krama_dapukan_aktif: false,
  krama_dapukan_berlaku_mulai: "",
  batas_umur_dapukan: "",
  jenis_dapukan_mipil_id: "",
  jenis_balu_dapukan_mipil_id: "",
  jenis_balu_nglintik_mipil_id: "",
  yowana_umur_min: "",
  yowana_umur_max: "",
  bandesa_nama: "",
  bandesa_jabatan: "",
  bandesa_nik: "",
  bandesa_ttd_url: "",
  call_center: "",
  panyarikan_nama: "",
  panyarikan_jabatan: "",
  panyarikan_ttd_url: "",
  patengen_nama: "",
  patengen_jabatan: "",
  pararem_nomor: "",
  pararem_tahun: "",
  pararem_judul: "",
});

function formFromDesa(d: DesaAdat | null): ProfilForm {
  if (!d) return emptyForm();
  return {
    alamat_desa_adat: d.alamat_desa_adat ?? "",
    logo_url: d.logo_url ?? "",
    logo_mda_url: d.logo_mda_url ?? "",
    jenis_umur_nyada:
      d.jenis_umur_nyada != null && Number.isFinite(d.jenis_umur_nyada)
        ? String(d.jenis_umur_nyada)
        : "",
    nyada_berlaku_mulai: normalizeTanggalIsoForInput(d.nyada_berlaku_mulai),
    jenis_krama_mipil_id: d.jenis_krama_mipil_id ?? "",
    jenis_cerai_mati_mipil_id: d.jenis_cerai_mati_mipil_id ?? "",
    jenis_cerai_hidup_mipil_id: d.jenis_cerai_hidup_mipil_id ?? "",
    krama_dapukan_aktif: !!Number(d.krama_dapukan_aktif),
    krama_dapukan_berlaku_mulai: normalizeTanggalIsoForInput(d.krama_dapukan_berlaku_mulai),
    batas_umur_dapukan:
      d.batas_umur_dapukan != null && Number.isFinite(d.batas_umur_dapukan)
        ? String(d.batas_umur_dapukan)
        : "",
    jenis_dapukan_mipil_id: d.jenis_dapukan_mipil_id ?? "",
    jenis_balu_dapukan_mipil_id: d.jenis_balu_dapukan_mipil_id ?? "",
    jenis_balu_nglintik_mipil_id: d.jenis_balu_nglintik_mipil_id ?? "",
    yowana_umur_min:
      d.yowana_umur_min != null && Number.isFinite(d.yowana_umur_min)
        ? String(d.yowana_umur_min)
        : "",
    yowana_umur_max:
      d.yowana_umur_max != null && Number.isFinite(d.yowana_umur_max)
        ? String(d.yowana_umur_max)
        : "",
    bandesa_nama: d.bandesa_nama ?? "",
    bandesa_jabatan: d.bandesa_jabatan ?? "",
    bandesa_nik: d.bandesa_nik ?? "",
    bandesa_ttd_url: d.bandesa_ttd_url ?? "",
    call_center: d.call_center ?? "",
    panyarikan_nama: d.panyarikan_nama ?? "",
    panyarikan_jabatan: d.panyarikan_jabatan ?? "",
    panyarikan_ttd_url: d.panyarikan_ttd_url ?? "",
    patengen_nama: d.patengen_nama ?? "",
    patengen_jabatan: d.patengen_jabatan ?? "",
    pararem_nomor: d.pararem_nomor ?? "",
    pararem_tahun: d.pararem_tahun ?? "",
    pararem_judul: d.pararem_judul ?? "",
  };
}

function ProfilSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-copper-200 bg-copper-50/40 p-4 space-y-3 leading-snug",
        className
      )}
    >
      <div>
        <h3 className="text-sm font-semibold text-copper-900">{title}</h3>
        {description ? (
          <p className="text-[11px] text-copper-600 mt-0.5">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function PrajuruCard({
  title,
  nama,
  jabatan,
  onNama,
  onJabatan,
  disabled,
  children,
  isPhone,
}: {
  title: string;
  nama: string;
  jabatan: string;
  onNama: (v: string) => void;
  onJabatan: (v: string) => void;
  disabled?: boolean;
  children?: ReactNode;
  isPhone?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-md border border-copper-100 bg-white/70 p-3 h-full">
      <h4 className="text-sm font-semibold text-copper-900">{title}</h4>
      <div className={cn("grid gap-3", isPhone ? "grid-cols-1" : "sm:grid-cols-2")}>
        <div>
          <Label>Nama</Label>
          <Input value={nama} onChange={(e) => onNama(e.target.value)} disabled={disabled} />
        </div>
        <div>
          <Label>Jabatan</Label>
          <Input value={jabatan} onChange={(e) => onJabatan(e.target.value)} disabled={disabled} />
        </div>
      </div>
      {children}
    </div>
  );
}

function JenisMipilSelect({
  label,
  value,
  onChange,
  jenisMipil,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  jenisMipil: JenisKramaMipilRow[];
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">— Pilih jenis krama —</option>
        {jenisMipil.map((j) => (
          <option key={j.id} value={j.id}>
            {j.nama}
            {j.kode ? ` (${j.kode})` : ""}
            {j.paturunan_persen != null ? ` · ${j.paturunan_persen}%` : ""}
          </option>
        ))}
      </Select>
      {hint ? <p className="text-[11px] text-copper-600 mt-0.5">{hint}</p> : null}
    </div>
  );
}

export function ProfilDesaAdatTab({
  canEdit,
  onSaved,
  onError,
}: {
  canEdit: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isPhone = useIsPhoneClient();
  const grid2 = isPhone ? "grid-cols-1" : "sm:grid-cols-2";
  const gridLg2 = isPhone ? "grid-cols-1" : "lg:grid-cols-2";
  const gridMd3 = isPhone ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-3";
  const gridPrajuru = isPhone ? "grid-cols-1" : "lg:grid-cols-2 xl:grid-cols-3";
  const gridPararem = isPhone ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3";

  const [form, setForm] = useState<ProfilForm>(emptyForm);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [noDesa, setNoDesa] = useState(false);
  const [desaTersimpan, setDesaTersimpan] = useState<DesaAdat | null>(null);
  const [matikanDapukan, setMatikanDapukan] = useState<KramaDapukanRingkas[] | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getDesaAdatWithMedia(), listJenisMipil()])
      .then(([d, jenis]) => {
        setNoDesa(!d);
        setDesaTersimpan(d);
        setForm(formFromDesa(d));
        setJenisMipil(jenis);
      })
      .catch((e) => onError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function setField<K extends keyof ProfilForm>(key: K, value: ProfilForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    const dapukanDimatikan = !!Number(desaTersimpan?.krama_dapukan_aktif) && !form.krama_dapukan_aktif;
    if (dapukanDimatikan) {
      try {
        setMatikanDapukan(await listKramaDapukanAktif(desaTersimpan));
      } catch (err) {
        onError(String(err));
      }
      return;
    }
    await simpan(false);
  }

  async function simpan(akhiriDapukan: boolean) {
    setSaving(true);
    onError("");
    try {
      const umur = form.jenis_umur_nyada.trim();
      const yowanaMin = form.yowana_umur_min.trim();
      const yowanaMax = form.yowana_umur_max.trim();
      await updateProfilDesaAdat({
        alamat_desa_adat: form.alamat_desa_adat,
        logo_url: form.logo_url.trim() || null,
        logo_mda_url: form.logo_mda_url.trim() || null,
        jenis_umur_nyada: umur ? parseInt(umur, 10) : null,
        nyada_berlaku_mulai: form.nyada_berlaku_mulai || null,
        jenis_krama_mipil_id: form.jenis_krama_mipil_id || null,
        jenis_cerai_mati_mipil_id: form.jenis_cerai_mati_mipil_id || null,
        jenis_cerai_hidup_mipil_id: form.jenis_cerai_hidup_mipil_id || null,
        krama_dapukan_aktif: form.krama_dapukan_aktif,
        krama_dapukan_berlaku_mulai: form.krama_dapukan_berlaku_mulai || null,
        batas_umur_dapukan: form.batas_umur_dapukan.trim()
          ? parseInt(form.batas_umur_dapukan, 10)
          : null,
        jenis_dapukan_mipil_id: form.jenis_dapukan_mipil_id || null,
        jenis_balu_dapukan_mipil_id: form.jenis_balu_dapukan_mipil_id || null,
        jenis_balu_nglintik_mipil_id: form.jenis_balu_nglintik_mipil_id || null,
        yowana_umur_min: yowanaMin ? parseInt(yowanaMin, 10) : null,
        yowana_umur_max: yowanaMax ? parseInt(yowanaMax, 10) : null,
        bandesa_nama: form.bandesa_nama,
        bandesa_jabatan: form.bandesa_jabatan,
        bandesa_nik: form.bandesa_nik.replace(/\D/g, "").slice(0, 16),
        bandesa_ttd_url: form.bandesa_ttd_url.trim() || null,
        call_center: form.call_center.trim() || null,
        panyarikan_nama: form.panyarikan_nama,
        panyarikan_jabatan: form.panyarikan_jabatan,
        panyarikan_ttd_url: form.panyarikan_ttd_url.trim() || null,
        patengen_nama: form.patengen_nama,
        patengen_jabatan: form.patengen_jabatan,
        pararem_nomor: form.pararem_nomor,
        pararem_tahun: form.pararem_tahun,
        pararem_judul: form.pararem_judul,
      });
      const jumlahSelesaiDapukan = akhiriDapukan ? await akhiriKramaDapukan(desaTersimpan) : 0;
      const jumlahBerubah = await syncNyadaOtomatis();
      setDesaTersimpan(await getDesaAdatWithMedia());
      setMatikanDapukan(null);
      window.dispatchEvent(new CustomEvent(DESA_ADAT_UPDATED_EVENT));
      const catatan = [
        jumlahSelesaiDapukan > 0 ? `${jumlahSelesaiDapukan} krama Dapukan menjadi Nyada` : "",
        jumlahBerubah > 0 ? `${jumlahBerubah} krama berubah jenis otomatis (Nyada/Dapukan)` : "",
      ].filter(Boolean);
      onSaved(
        ["Profil Desa Adat berhasil disimpan", ...catatan].join(" · ")
      );
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const selectedJenis = jenisMipil.find((j) => j.id === form.jenis_krama_mipil_id);
  const jenisDisabled = !canEdit || saving || jenisMipil.length === 0;
  const fieldDisabled = !canEdit || saving;

  if (loading) {
    return <p className="text-sm text-muted leading-snug">Memuat profil desa…</p>;
  }

  if (noDesa) {
    return (
      <Card className={MASTER_CARD}>
        <p className="text-sm text-copper-800 leading-snug">
          Data desa adat belum ada. Lengkapi <strong>Pengaturan → Setup Wilayah</strong> terlebih
          dahulu.
        </p>
      </Card>
    );
  }

  return (
    <Card
      title="Profil Desa Adat"
      className={cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE)}
    >
      <form onSubmit={submit} className="space-y-4 leading-snug">
        <p className="text-sm text-muted">
          Logo, ketentuan nyada/luput, dan nama prajuru untuk cetak kartu &amp; dokumen. Kode wilayah
          diatur di <strong>Pengaturan</strong>.
        </p>

        <div className={cn("grid gap-4", gridLg2)}>
          <ProfilSection title="Identitas Desa">
            <div>
              <Label>Alamat Desa Adat</Label>
              <Input
                value={form.alamat_desa_adat}
                onChange={(e) => setField("alamat_desa_adat", e.target.value)}
                placeholder="Jalan Candra Kirana I, Desa Tegalbadeng Barat"
                disabled={fieldDisabled}
              />
              <p className="text-[11px] text-copper-600 mt-0.5">
                Ditampilkan di kop surat dinas (opsional). Kode wilayah diatur di Pengaturan.
              </p>
            </div>
          </ProfilSection>

          <ProfilSection title="Logo">
            <div className={cn("grid gap-4", grid2)}>
              <LogoUploadField
                label="Logo Desa Adat"
                value={form.logo_url}
                onChange={(v) => setField("logo_url", v)}
                disabled={fieldDisabled}
              />
              <LogoUploadField
                label="Logo MDA"
                value={form.logo_mda_url}
                onChange={(v) => setField("logo_mda_url", v)}
                disabled={fieldDisabled}
              />
            </div>
          </ProfilSection>
        </div>

        <div className={cn("grid gap-4", gridMd3)}>
          <ProfilSection
            title="Ketentuan Nyada/Luput"
            description="Batas umur dan jenis krama untuk status nyada. Kartu dengan jenis Nyada tidak mendapat peringatan Cerai Mati/Hidup."
          >
            <div className={cn("grid gap-3", grid2)}>
              <div>
                <Label>Batas Umur Nyada</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="Umur (tahun)"
                  value={form.jenis_umur_nyada}
                  onChange={(e) =>
                    setField("jenis_umur_nyada", e.target.value.replace(/\D/g, ""))
                  }
                  disabled={fieldDisabled}
                />
                <p className="text-[11px] text-copper-600 mt-0.5">Batas umur dalam tahun.</p>
              </div>
              <div>
                <Label>Nyada otomatis mulai</Label>
                <DateInput
                  value={form.nyada_berlaku_mulai}
                  onChange={(v) => setField("nyada_berlaku_mulai", v)}
                  disabled={fieldDisabled}
                />
                <p className="text-[11px] text-copper-600 mt-0.5">
                  Sejak tanggal ini, Pengarep yang mencapai batas umur otomatis menjadi Nyada.
                  Krama yang sudah Nyada sebelumnya tidak berubah. Kosongkan jika tidak otomatis.
                </p>
              </div>
              <JenisMipilSelect
                label="Jenis Krama (nyada)"
                value={form.jenis_krama_mipil_id}
                onChange={(v) => setField("jenis_krama_mipil_id", v)}
                jenisMipil={jenisMipil}
                disabled={jenisDisabled}
                hint={
                  jenisMipil.length === 0
                    ? "Tambahkan Jenis Krama Mipil di tab Jenis & Tarif terlebih dahulu."
                    : selectedJenis
                      ? `Terpilih: ${selectedJenis.nama}${
                          selectedJenis.paturunan_persen != null
                            ? ` (paturunan ${selectedJenis.paturunan_persen}%)`
                            : ""
                        }`
                      : undefined
                }
              />
            </div>
          </ProfilSection>

          <ProfilSection
            title="Ketentuan Pengarep"
            description="Jenis Krama Mipil otomatis diganti ke jenis ini saat status perkawinan Pengarep Cerai Mati / Cerai Hidup, dan kembali ke jenis sebelumnya saat Pengarep kawin lagi (kecuali krama Nyada/Dapukan)."
          >
            <div className={cn("grid gap-3", grid2)}>
              <JenisMipilSelect
                label="Jenis Krama (Cerai Mati)"
                value={form.jenis_cerai_mati_mipil_id}
                onChange={(v) => setField("jenis_cerai_mati_mipil_id", v)}
                jenisMipil={jenisMipil}
                disabled={jenisDisabled}
              />
              <JenisMipilSelect
                label="Jenis Krama (Cerai Hidup)"
                value={form.jenis_cerai_hidup_mipil_id}
                onChange={(v) => setField("jenis_cerai_hidup_mipil_id", v)}
                jenisMipil={jenisMipil}
                disabled={jenisDisabled}
              />
            </div>
          </ProfilSection>

          <ProfilSection
            title="Statistik Yowana"
            description="Yowana = anggota Mipil belum kawin dalam rentang usia ini. Wredha dihitung dari batas umur Nyada (semua status perkawinan, per jiwa)."
            className={isPhone ? undefined : "md:col-span-2 xl:col-span-1"}
          >
            <div className={cn("grid gap-3", grid2)}>
              <div>
                <Label>Usia Yowana (minimum)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="15"
                  value={form.yowana_umur_min}
                  onChange={(e) =>
                    setField("yowana_umur_min", e.target.value.replace(/\D/g, ""))
                  }
                  disabled={fieldDisabled}
                />
              </div>
              <div>
                <Label>Usia Yowana (maksimum)</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="40"
                  value={form.yowana_umur_max}
                  onChange={(e) =>
                    setField("yowana_umur_max", e.target.value.replace(/\D/g, ""))
                  }
                  disabled={fieldDisabled}
                />
              </div>
            </div>
          </ProfilSection>
        </div>

        <ProfilSection
          title="Krama Dapukan"
          description="Pengarep yang mencapai usia Nyada tetapi masih memiliki anggota berstatus Anak yang Belum Kawin menjadi Krama Dapukan. Memerlukan Nyada otomatis."
        >
          <label className="flex items-start gap-2 text-sm text-copper-900">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.krama_dapukan_aktif}
              onChange={(e) => setField("krama_dapukan_aktif", e.target.checked)}
              disabled={fieldDisabled}
            />
            <span>
              <strong>Desa Adat menerapkan Krama Dapukan</strong>
              {!form.krama_dapukan_aktif && (
                <span className="block text-[11px] text-copper-600">
                  Tidak aktif: Pengarep langsung Nyada saat mencapai batas umur Nyada.
                </span>
              )}
            </span>
          </label>
          {form.krama_dapukan_aktif && (
            <div className={cn("grid gap-3", gridMd3)}>
              <div>
                <Label>Krama Dapukan mulai</Label>
                <DateInput
                  value={form.krama_dapukan_berlaku_mulai}
                  onChange={(v) => setField("krama_dapukan_berlaku_mulai", v)}
                  disabled={fieldDisabled}
                />
                <p className="text-[11px] text-copper-600 mt-0.5">
                  Hanya Pengarep yang mencapai usia Nyada sejak tanggal ini. Krama yang sudah Nyada
                  tidak berubah.
                </p>
              </div>
              <div>
                <Label>Batas Umur Krama Dapukan</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="Umur (tahun), mis. 70"
                  value={form.batas_umur_dapukan}
                  onChange={(e) =>
                    setField("batas_umur_dapukan", e.target.value.replace(/\D/g, ""))
                  }
                  disabled={fieldDisabled}
                />
                <p className="text-[11px] text-copper-600 mt-0.5">
                  Pada umur ini Pengarep Dapukan otomatis Nyada walaupun Anak belum kawin. Kosongkan
                  jika tanpa batas.
                </p>
              </div>
              <JenisMipilSelect
                label="Jenis Krama Dapukan"
                value={form.jenis_dapukan_mipil_id}
                onChange={(v) => setField("jenis_dapukan_mipil_id", v)}
                jenisMipil={jenisMipil}
                disabled={jenisDisabled}
              />
              <JenisMipilSelect
                label="Jenis Krama Balu Dapukan"
                value={form.jenis_balu_dapukan_mipil_id}
                onChange={(v) => setField("jenis_balu_dapukan_mipil_id", v)}
                jenisMipil={jenisMipil}
                disabled={jenisDisabled}
                hint="Suami/istri Pengarep Dapukan meninggal. Batas umur tetap mengikuti ulang tahun Pengarep Dapukan semula."
              />
              <JenisMipilSelect
                label="Jenis Krama Balu Nglintik"
                value={form.jenis_balu_nglintik_mipil_id}
                onChange={(v) => setField("jenis_balu_nglintik_mipil_id", v)}
                jenisMipil={jenisMipil}
                disabled={jenisDisabled}
                hint="Nyada untuk Balu Dapukan yang tinggal sendirian di Pipil. Kosongkan untuk memakai jenis Nyada."
              />
            </div>
          )}
        </ProfilSection>

        <ProfilSection title="Prajuru Desa Adat">
          <div className={cn("grid gap-4", gridPrajuru)}>
            <PrajuruCard
              title="Bandesa"
              nama={form.bandesa_nama}
              jabatan={form.bandesa_jabatan}
              onNama={(v) => setField("bandesa_nama", v)}
              onJabatan={(v) => setField("bandesa_jabatan", v)}
              disabled={fieldDisabled}
              isPhone={isPhone}
            >
              <div className={cn("grid gap-3", grid2)}>
                <div>
                  <Label>NIK</Label>
                  <Input
                    value={form.bandesa_nik}
                    onChange={(e) =>
                      setField("bandesa_nik", e.target.value.replace(/\D/g, "").slice(0, 16))
                    }
                    inputMode="numeric"
                    placeholder="16 digit"
                    disabled={fieldDisabled}
                  />
                  <p className="text-[11px] text-copper-600 mt-0.5">
                    Wajib 16 digit untuk menerbitkan surat keterangan krama.
                  </p>
                </div>
                <div>
                  <Label>Call Center</Label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder="Nomor call center desa adat"
                    value={form.call_center}
                    onChange={(e) =>
                      setField("call_center", e.target.value.replace(/[^\d+\-\s/().]/g, ""))
                    }
                    disabled={fieldDisabled}
                  />
                  <p className="text-[11px] text-copper-600 mt-0.5">
                    Ditampilkan di bagian belakang kartu anggota Krama Mipil.
                  </p>
                </div>
              </div>
              <LogoUploadField
                label="Tanda tangan Bandesa Adat (PNG)"
                value={form.bandesa_ttd_url}
                onChange={(v) => setField("bandesa_ttd_url", v)}
                disabled={fieldDisabled}
                accept="image/png"
                hint="PNG transparan disarankan, maks. 2 MB."
              />
            </PrajuruCard>

            <PrajuruCard
              title="Panyarikan"
              nama={form.panyarikan_nama}
              jabatan={form.panyarikan_jabatan}
              onNama={(v) => setField("panyarikan_nama", v)}
              onJabatan={(v) => setField("panyarikan_jabatan", v)}
              disabled={fieldDisabled}
              isPhone={isPhone}
            >
              <LogoUploadField
                label="Tanda tangan Panyarikan (PNG)"
                value={form.panyarikan_ttd_url}
                onChange={(v) => setField("panyarikan_ttd_url", v)}
                disabled={fieldDisabled}
                accept="image/png"
                hint="PNG transparan disarankan, maks. 2 MB. Dipakai di surat penagihan dudukan."
              />
            </PrajuruCard>

            <PrajuruCard
              title="Patengen"
              nama={form.patengen_nama}
              jabatan={form.patengen_jabatan}
              onNama={(v) => setField("patengen_nama", v)}
              onJabatan={(v) => setField("patengen_jabatan", v)}
              disabled={fieldDisabled}
              isPhone={isPhone}
            />
          </div>

          <div className="rounded-md border border-copper-100 bg-white/70 p-3 space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-copper-900">Pararem Desa Adat</h4>
              <p className="text-[11px] text-copper-600 mt-0.5">
                Rujukan legal surat penagihan dudukan (nomor, tahun, dan judul pararem).
              </p>
            </div>
            <div className={cn("grid gap-3", gridPararem)}>
              <div>
                <Label>Nomor Pararem</Label>
                <Input
                  value={form.pararem_nomor}
                  onChange={(e) => setField("pararem_nomor", e.target.value)}
                  disabled={fieldDisabled}
                  placeholder="02"
                />
              </div>
              <div>
                <Label>Tahun Pararem</Label>
                <Input
                  value={form.pararem_tahun}
                  onChange={(e) =>
                    setField("pararem_tahun", e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  disabled={fieldDisabled}
                  placeholder="2025"
                />
              </div>
              <div className={isPhone ? undefined : "sm:col-span-2 lg:col-span-3"}>
                <Label>Tentang (judul pararem)</Label>
                <Input
                  value={form.pararem_judul}
                  onChange={(e) => setField("pararem_judul", e.target.value)}
                  disabled={fieldDisabled}
                  placeholder="Kasukretan Krama di Wewidangan Desa Adat"
                />
              </div>
            </div>
          </div>
        </ProfilSection>

        {canEdit ? (
          <div className="pt-1">
            <Button type="submit" icon={Check} disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan profil"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted leading-snug">
            Hanya admin yang dapat mengubah data.
          </p>
        )}
      </form>
      <MatikanDapukanDialog
        open={matikanDapukan !== null}
        daftar={matikanDapukan ?? []}
        busy={saving}
        onConfirm={() => void simpan(true)}
        onCancel={() => setMatikanDapukan(null)}
      />
    </Card>
  );
}
