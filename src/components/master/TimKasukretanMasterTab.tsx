import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  createTimKasukretan,
  deleteTimKasukretan,
  listBanjar,
  listTimKasukretan,
  updateTimKasukretan,
} from "../../lib/services/master";
import { getDesaAdat } from "../../lib/services/desa";
import type { Banjar, TimKasukretan } from "../../lib/types";
import {
  isTimBantuanFiturAktif,
  isTimBantuanTipe,
  normalizeTimKasukretanTipe,
  timKasukretanTipeLabel,
  type TimKasukretanTipe,
} from "../../lib/tim-bantuan";
import { MASTER_CARD_PHONE, MASTER_CARD_TITLED, MASTER_PAGE, MASTER_TABLE } from "./master-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import {
  LIST_BODY_ROW,
  LIST_HEAD_ROW,
  LIST_TABLE_ELEMENT,
} from "../ui/list-compact";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input, Label, Select } from "../ui/Input";

type TimForm = {
  nama: string;
  banjar_id: string;
  jabatan: string;
  nomor_kontak: string;
  tipe: TimKasukretanTipe;
};

const emptyForm = (): TimForm => ({
  nama: "",
  banjar_id: "",
  jabatan: "",
  nomor_kontak: "",
  tipe: "banjar",
});

function formFromItem(item: TimKasukretan): TimForm {
  return {
    nama: item.nama,
    banjar_id: item.banjar_id,
    jabatan: item.jabatan,
    nomor_kontak: item.nomor_kontak?.trim() ?? "",
    tipe: normalizeTimKasukretanTipe(item.tipe),
  };
}

function matchesTimCari(item: TimKasukretan, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const tipe = normalizeTimKasukretanTipe(item.tipe);
  const hay = [
    item.nama,
    item.jabatan,
    item.banjar_nama,
    item.banjar_kode,
    item.nomor_kontak ?? "",
    timKasukretanTipeLabel(tipe),
    tipe,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

function TimFormFields({
  form,
  banjar,
  onChange,
  disabled,
  idPrefix,
  isPhone,
  timBantuanAktif,
}: {
  form: TimForm;
  banjar: Banjar[];
  onChange: (next: TimForm) => void;
  disabled?: boolean;
  idPrefix: string;
  isPhone?: boolean;
  timBantuanAktif: boolean;
}) {
  return (
    <div className={cn("grid gap-2", isPhone ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3")}>
      {timBantuanAktif && (
        <div>
          <Label htmlFor={`${idPrefix}-tipe`}>Tipe</Label>
          <Select
            id={`${idPrefix}-tipe`}
            value={form.tipe}
            onChange={(e) =>
              onChange({
                ...form,
                tipe: normalizeTimKasukretanTipe(e.target.value),
                jabatan:
                  e.target.value === "bantuan" && !form.jabatan.trim()
                    ? "Tim Bantuan"
                    : form.jabatan,
              })
            }
            disabled={disabled}
          >
            <option value="banjar">Tim Banjar</option>
            <option value="bantuan">Tim Bantuan</option>
          </Select>
          {form.tipe === "bantuan" && (
            <p className="mt-0.5 text-[11px] text-muted leading-snug">
              Hanya pengumpulan Dudukan di satu banjar; tanpa lihat penerimaan banjar.
            </p>
          )}
        </div>
      )}
      <div>
        <Label htmlFor={`${idPrefix}-nama`}>Nama</Label>
        <Input
          id={`${idPrefix}-nama`}
          value={form.nama}
          onChange={(e) => onChange({ ...form, nama: e.target.value })}
          disabled={disabled}
          required
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-banjar`}>Banjar</Label>
        <Select
          id={`${idPrefix}-banjar`}
          value={form.banjar_id}
          onChange={(e) => onChange({ ...form, banjar_id: e.target.value })}
          disabled={disabled || !banjar.length}
          required
        >
          <option value="">Pilih banjar</option>
          {banjar.map((b) => (
            <option key={b.id} value={b.id}>
              {b.kode} — {b.nama}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-jabatan`}>Jabatan</Label>
        <Input
          id={`${idPrefix}-jabatan`}
          value={form.jabatan}
          onChange={(e) => onChange({ ...form, jabatan: e.target.value })}
          disabled={disabled}
          placeholder={form.tipe === "bantuan" ? "Tim Bantuan" : "Mis. Ketua, Anggota"}
          required
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-kontak`}>No. WhatsApp / HP</Label>
        <Input
          id={`${idPrefix}-kontak`}
          type="tel"
          inputMode="tel"
          value={form.nomor_kontak}
          onChange={(e) => onChange({ ...form, nomor_kontak: e.target.value })}
          disabled={disabled}
          placeholder="08…"
        />
      </div>
    </div>
  );
}

export function TimKasukretanMasterTab({
  canEdit,
  onSaved,
  onError,
}: {
  canEdit: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isPhone = useIsPhoneClient();
  const cardClass = cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE);
  const [rows, setRows] = useState<TimKasukretan[]>([]);
  const [cari, setCari] = useState("");
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [timBantuanAktif, setTimBantuanAktif] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState<TimForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TimForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimKasukretan | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [tim, b, desa] = await Promise.all([listTimKasukretan(), listBanjar(), getDesaAdat()]);
    setRows(tim);
    setBanjar(b);
    setTimBantuanAktif(isTimBantuanFiturAktif(desa));
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e) => onError(String(e)))
      .finally(() => setLoading(false));
  }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    onError("");
    try {
      const tipe = timBantuanAktif ? addForm.tipe : "banjar";
      await createTimKasukretan(
        addForm.nama,
        addForm.banjar_id,
        addForm.jabatan,
        addForm.nomor_kontak,
        tipe
      );
      setAddForm(emptyForm());
      await refresh();
      onSaved(
        tipe === "bantuan"
          ? "Anggota Tim Bantuan berhasil ditambahkan"
          : "Anggota Tim Kasukretan berhasil ditambahkan"
      );
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !editingId) return;
    setSaving(true);
    onError("");
    try {
      const tipe = timBantuanAktif ? editForm.tipe : normalizeTimKasukretanTipe(editForm.tipe);
      await updateTimKasukretan(
        editingId,
        editForm.nama,
        editForm.banjar_id,
        editForm.jabatan,
        editForm.nomor_kontak,
        tipe
      );
      setEditingId(null);
      await refresh();
      onSaved("Data Tim Kasukretan berhasil disimpan");
    } catch (err) {
      onError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function requestDelete(item: TimKasukretan) {
    if (!canEdit) return;
    setDeleteTarget(item);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    onError("");
    try {
      await deleteTimKasukretan(deleteTarget.id);
      if (editingId === deleteTarget.id) setEditingId(null);
      await refresh();
      setDeleteTarget(null);
      onSaved("Anggota tim berhasil dihapus");
    } catch (err) {
      onError(String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  function startEdit(item: TimKasukretan) {
    setEditingId(item.id);
    setEditForm(formFromItem(item));
  }

  const filteredRows = useMemo(
    () => rows.filter((r) => matchesTimCari(r, cari)),
    [rows, cari]
  );

  if (loading) {
    return <p className="text-sm text-muted leading-snug">Memuat Tim Kasukretan...</p>;
  }

  return (
    <div className={MASTER_PAGE}>
      <p className="text-sm text-muted leading-snug">
        Tim Banjar memungut <strong>Paturunan</strong> dan <strong>Dudukan</strong> per banjar.
        {timBantuanAktif ? (
          <>
            {" "}
            <strong>Tim Bantuan</strong> hanya mengumpulkan Dudukan di banjar tugas (aktifkan di
            Profil Desa).
          </>
        ) : (
          <> Aktifkan Tim Bantuan di Profil Desa bila desa memakainya.</>
        )}
      </p>

      {canEdit && (
        <Card title="Tambah anggota" className={cardClass}>
          {!banjar.length ? (
            <p className="text-sm text-copper-800 leading-snug">
              Tambahkan data <strong>Banjar</strong> di tab Wilayah terlebih dahulu.
            </p>
          ) : (
            <form onSubmit={handleAdd} className="space-y-2 leading-snug">
              <TimFormFields
                form={addForm}
                banjar={banjar}
                onChange={setAddForm}
                disabled={saving}
                idPrefix="tim-add"
                isPhone={isPhone}
                timBantuanAktif={timBantuanAktif}
              />
              <Button
                type="submit"
                icon={Plus}
                disabled={saving}
                className={cn(isPhone && "h-10 w-full")}
              >
                {saving ? "Menyimpan..." : "Tambah"}
              </Button>
            </form>
          )}
        </Card>
      )}

      <Card title="Daftar Tim Kasukretan" compact className={cn(cardClass, MASTER_TABLE)}>
        {rows.length > 0 && (
          <div className="mb-2 relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              aria-hidden
            />
            <Input
              className="pl-8 h-10"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama, banjar, jabatan, tipe, kontak…"
              aria-label="Cari anggota tim"
            />
            {cari.trim() && (
              <p className="mt-1 text-[11px] text-muted">
                Menampilkan {filteredRows.length} dari {rows.length} anggota
              </p>
            )}
          </div>
        )}

        {editingId && canEdit && (
          <form
            onSubmit={handleEditSave}
            className={cn(
              "space-y-2 mb-3 p-2.5 rounded-lg bg-copper-50 border border-copper-200 leading-snug",
              isPhone && MASTER_CARD_PHONE
            )}
          >
            <p className="text-sm font-semibold text-copper-900">Edit anggota</p>
            <TimFormFields
              form={editForm}
              banjar={banjar}
              onChange={setEditForm}
              disabled={saving}
              idPrefix="tim-edit"
              isPhone={isPhone}
              timBantuanAktif={timBantuanAktif || isTimBantuanTipe(editForm.tipe)}
            />
            <div className={cn("flex flex-wrap gap-2", isPhone && "flex-col")}>
              <Button
                type="submit"
                icon={Check}
                disabled={saving}
                className={cn(isPhone && "h-10 w-full")}
              >
                Simpan
              </Button>
              <Button
                type="button"
                variant="secondary"
                icon={X}
                onClick={() => setEditingId(null)}
                disabled={saving}
                className={cn(isPhone && "h-10 w-full")}
              >
                Batal
              </Button>
            </div>
          </form>
        )}

        {isPhone ? (
          <ul className="space-y-2">
            {filteredRows.map((r) =>
              editingId === r.id ? null : (
                <li
                  key={r.id}
                  className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                >
                  <p className="text-sm font-semibold text-copper-950">{r.nama}</p>
                  <p className="text-[11px] text-copper-700 mt-0.5">
                    {timKasukretanTipeLabel(normalizeTimKasukretanTipe(r.tipe))}
                  </p>
                  <p className="text-xs text-copper-800 mt-0.5">
                    {r.banjar_kode} — {r.banjar_nama}
                  </p>
                  <p className="text-xs text-muted">{r.jabatan}</p>
                  {r.nomor_kontak?.trim() ? (
                    <p className="text-xs text-copper-800 mt-0.5">{r.nomor_kontak.trim()}</p>
                  ) : null}
                  {canEdit && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 flex-1 text-xs"
                        onClick={() => startEdit(r)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 flex-1 text-xs text-red-600"
                        onClick={() => requestDelete(r)}
                      >
                        Hapus
                      </Button>
                    </div>
                  )}
                </li>
              )
            )}
            {!rows.length && (
              <p className="text-center py-6 text-muted leading-snug">Belum ada anggota tim</p>
            )}
            {rows.length > 0 && !filteredRows.length && (
              <p className="text-center py-6 text-muted leading-snug">Tidak ada yang cocok dengan pencarian</p>
            )}
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className={LIST_TABLE_ELEMENT}>
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th>Nama</th>
                  <th>Tipe</th>
                  <th>Banjar</th>
                  <th>Jabatan</th>
                  <th>Kontak</th>
                  {canEdit && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) =>
                  editingId === r.id ? null : (
                    <tr key={r.id} className={LIST_BODY_ROW}>
                      <td>{r.nama}</td>
                      <td>{timKasukretanTipeLabel(normalizeTimKasukretanTipe(r.tipe))}</td>
                      <td>
                        {r.banjar_kode} — {r.banjar_nama}
                      </td>
                      <td>{r.jabatan}</td>
                      <td className="text-muted">{r.nomor_kontak?.trim() || "—"}</td>
                      {canEdit && (
                        <td>
                          <div className="flex gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Pencil}
                              iconOnly
                              title="Edit"
                              aria-label="Edit"
                              onClick={() => startEdit(r)}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Trash2}
                              iconOnly
                              title="Hapus"
                              aria-label="Hapus"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => requestDelete(r)}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                )}
              </tbody>
            </table>
            {!rows.length && (
              <p className="text-center py-6 text-muted leading-snug">Belum ada anggota tim</p>
            )}
            {rows.length > 0 && !filteredRows.length && (
              <p className="text-center py-6 text-muted leading-snug">Tidak ada yang cocok dengan pencarian</p>
            )}
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-muted pt-2 leading-snug">Hanya admin yang dapat mengubah data.</p>
        )}
      </Card>

      <ConfirmDialog
        open={deleteTarget != null}
        message={
          deleteTarget
            ? `Hapus ${deleteTarget.nama} dari Tim Kasukretan? Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
