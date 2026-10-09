import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createTimKasukretan,
  deleteTimKasukretan,
  listBanjar,
  listTimKasukretan,
  updateTimKasukretan,
} from "../../lib/services/master";
import type { Banjar, TimKasukretan } from "../../lib/types";
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
};

const emptyForm = (): TimForm => ({
  nama: "",
  banjar_id: "",
  jabatan: "",
});

function formFromItem(item: TimKasukretan): TimForm {
  return {
    nama: item.nama,
    banjar_id: item.banjar_id,
    jabatan: item.jabatan,
  };
}

function TimFormFields({
  form,
  banjar,
  onChange,
  disabled,
  idPrefix,
  isPhone,
}: {
  form: TimForm;
  banjar: Banjar[];
  onChange: (next: TimForm) => void;
  disabled?: boolean;
  idPrefix: string;
  isPhone?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", isPhone ? "grid-cols-1" : "sm:grid-cols-3")}>
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
          placeholder="Mis. Ketua, Anggota"
          required
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
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [loading, setLoading] = useState(true);
  const [addForm, setAddForm] = useState<TimForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TimForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimKasukretan | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [tim, b] = await Promise.all([listTimKasukretan(), listBanjar()]);
    setRows(tim);
    setBanjar(b);
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
      await createTimKasukretan(addForm.nama, addForm.banjar_id, addForm.jabatan);
      setAddForm(emptyForm());
      await refresh();
      onSaved("Anggota Tim Kasukretan berhasil ditambahkan");
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
      await updateTimKasukretan(editingId, editForm.nama, editForm.banjar_id, editForm.jabatan);
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

  if (loading) {
    return <p className="text-sm text-muted leading-snug">Memuat Tim Kasukretan...</p>;
  }

  return (
    <div className={MASTER_PAGE}>
      <p className="text-sm text-muted leading-snug">
        Tim yang memungut <strong>Paturunan</strong> (Krama Mipil) dan{" "}
        <strong>Dudukan</strong> (Krama Tamiu &amp; Tamiu), per banjar.
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
            {rows.map((r) =>
              editingId === r.id ? null : (
                <li
                  key={r.id}
                  className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                >
                  <p className="text-sm font-semibold text-copper-950">{r.nama}</p>
                  <p className="text-xs text-copper-800 mt-0.5">
                    {r.banjar_kode} — {r.banjar_nama}
                  </p>
                  <p className="text-xs text-muted">{r.jabatan}</p>
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
          </ul>
        ) : (
          <div className="overflow-x-auto">
            <table className={LIST_TABLE_ELEMENT}>
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th>Nama</th>
                  <th>Banjar</th>
                  <th>Jabatan</th>
                  {canEdit && <th>Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  editingId === r.id ? null : (
                    <tr key={r.id} className={LIST_BODY_ROW}>
                      <td>{r.nama}</td>
                      <td>
                        {r.banjar_kode} — {r.banjar_nama}
                      </td>
                      <td>{r.jabatan}</td>
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
