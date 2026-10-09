import { useEffect, useMemo, useState } from "react";
import {
  SEKTOR_SWASTA_KOMERSIAL,
  SEKTOR_UTAMA_OPTIONS,
  getBentukHukumOptions,
  getFokusBidangOptions,
  type SektorUtama,
} from "../../lib/lembaga-badan-options";
import {
  createLembagaBadan,
  getBentukOptionsForSektor,
  getFokusOptionsForSektor,
  updateLembagaBadan,
  type LembagaBadanInput,
} from "../../lib/services/lembaga-badan";
import type { LembagaBadanRow } from "../../lib/types";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input, Label, Select } from "../ui/Input";
import { KramaPenanggungJawabPicker } from "./KramaPenanggungJawabPicker";

type FormState = {
  nama: string;
  alamat: string;
  sektorUtama: string;
  bentukHukum: string;
  fokusBidang: string;
  nomorLegalitas: string;
  namaPenanggungJawab: string;
  noKontak: string;
  penanggungJawabKramaId: string;
};

const emptyForm = (): FormState => ({
  nama: "",
  alamat: "",
  sektorUtama: SEKTOR_UTAMA_OPTIONS[0],
  bentukHukum: getBentukHukumOptions(SEKTOR_UTAMA_OPTIONS[0])[0] ?? "",
  fokusBidang: getFokusBidangOptions(SEKTOR_UTAMA_OPTIONS[0])[0] ?? "",
  nomorLegalitas: "",
  namaPenanggungJawab: "",
  noKontak: "",
  penanggungJawabKramaId: "",
});

function formFromRow(row: LembagaBadanRow): FormState {
  const sektor = row.sektor_utama as SektorUtama;
  const bentukOptions = getBentukHukumOptions(sektor);
  const fokusOptions = getFokusBidangOptions(sektor);
  return {
    nama: row.nama,
    alamat: row.alamat ?? "",
    sektorUtama: row.sektor_utama,
    bentukHukum: bentukOptions.includes(row.bentuk_hukum) ? row.bentuk_hukum : bentukOptions[0] ?? "",
    fokusBidang: fokusOptions.includes(row.fokus_bidang) ? row.fokus_bidang : fokusOptions[0] ?? "",
    nomorLegalitas: row.nomor_legalitas ?? "",
    namaPenanggungJawab: row.nama_penanggung_jawab,
    noKontak: row.no_kontak ?? "",
    penanggungJawabKramaId: row.penanggung_jawab_krama_id ?? "",
  };
}

function toInput(form: FormState): LembagaBadanInput {
  return {
    nama: form.nama,
    alamat: form.alamat,
    sektorUtama: form.sektorUtama,
    bentukHukum: form.bentukHukum,
    fokusBidang: form.fokusBidang,
    nomorLegalitas: form.nomorLegalitas,
    namaPenanggungJawab: form.namaPenanggungJawab,
    noKontak: form.noKontak,
    penanggungJawabKramaId:
      form.sektorUtama === SEKTOR_SWASTA_KOMERSIAL ? form.penanggungJawabKramaId : null,
  };
}

export function LembagaBadanFormDialog({
  open,
  onClose,
  editRow,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editRow: LembagaBadanRow | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bentukOptions = useMemo(
    () => getBentukOptionsForSektor(form.sektorUtama),
    [form.sektorUtama]
  );
  const fokusOptions = useMemo(
    () => getFokusOptionsForSektor(form.sektorUtama),
    [form.sektorUtama]
  );
  const isSwasta = form.sektorUtama === SEKTOR_SWASTA_KOMERSIAL;

  useEffect(() => {
    if (!open) return;
    setForm(editRow ? formFromRow(editRow) : emptyForm());
    setError("");
  }, [open, editRow]);

  useEffect(() => {
    if (!bentukOptions.includes(form.bentukHukum)) {
      setForm((f) => ({ ...f, bentukHukum: bentukOptions[0] ?? "" }));
    }
  }, [bentukOptions, form.bentukHukum]);

  useEffect(() => {
    if (!fokusOptions.includes(form.fokusBidang)) {
      setForm((f) => ({ ...f, fokusBidang: fokusOptions[0] ?? "" }));
    }
  }, [fokusOptions, form.fokusBidang]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = toInput(form);
      if (editRow) {
        await updateLembagaBadan(editRow.id, input);
      } else {
        await createLembagaBadan(input);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={editRow ? "Edit Lembaga/Badan" : "Tambah Lembaga/Badan"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="lb-nama">Nama</Label>
            <Input
              id="lb-nama"
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              required
              disabled={busy}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lb-alamat">Alamat</Label>
            <Input
              id="lb-alamat"
              value={form.alamat}
              onChange={(e) => setForm({ ...form, alamat: e.target.value })}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="lb-sektor">Sektor Utama</Label>
            <Select
              id="lb-sektor"
              value={form.sektorUtama}
              onChange={(e) => setForm({ ...form, sektorUtama: e.target.value })}
              disabled={busy}
            >
              {SEKTOR_UTAMA_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="lb-bentuk">Bentuk Hukum/Organisasi</Label>
            <Select
              id="lb-bentuk"
              value={form.bentukHukum}
              onChange={(e) => setForm({ ...form, bentukHukum: e.target.value })}
              disabled={busy}
            >
              {bentukOptions.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="lb-fokus">Fokus Bidang</Label>
            <Select
              id="lb-fokus"
              value={form.fokusBidang}
              onChange={(e) => setForm({ ...form, fokusBidang: e.target.value })}
              disabled={busy}
            >
              {fokusOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="lb-nib">Nomor Legalitas/NIB</Label>
            <Input
              id="lb-nib"
              value={form.nomorLegalitas}
              onChange={(e) => setForm({ ...form, nomorLegalitas: e.target.value })}
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="lb-pj-nama">Nama Penanggung Jawab</Label>
            <Input
              id="lb-pj-nama"
              value={form.namaPenanggungJawab}
              onChange={(e) => setForm({ ...form, namaPenanggungJawab: e.target.value })}
              required
              disabled={busy}
            />
          </div>
          <div>
            <Label htmlFor="lb-kontak">No Kontak</Label>
            <Input
              id="lb-kontak"
              value={form.noKontak}
              onChange={(e) => setForm({ ...form, noKontak: e.target.value })}
              disabled={busy}
            />
          </div>
        </div>

        {isSwasta && (
          <KramaPenanggungJawabPicker
            value={form.penanggungJawabKramaId}
            disabled={busy}
            onChange={(kramaId, row) =>
              setForm((f) => ({
                ...f,
                penanggungJawabKramaId: kramaId,
                namaPenanggungJawab: row?.kepala_nama ?? f.namaPenanggungJawab,
              }))
            }
          />
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end pt-2 border-t border-copper-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
