import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, Smartphone } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Label, Select } from "../ui/Input";
import { validatePassword, validateUsername } from "../../lib/auth-password";
import { listTimKasukretan } from "../../lib/services/master";
import {
  createPetugasAkun,
  listPetugasAkun,
  setPetugasAkunPassword,
  updatePetugasAkun,
  type PetugasAkunRecord,
} from "../../lib/services/petugas-akun";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { LIST_CARD, LIST_CARD_PHONE } from "../ui/list-compact";
import { cn } from "../../lib/utils";

export function PetugasAkunPanel() {
  const isPhone = useIsPhoneClient();
  const [accounts, setAccounts] = useState<PetugasAkunRecord[]>([]);
  const [timOptions, setTimOptions] = useState<
    { id: string; label: string; nama: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newTimId, setNewTimId] = useState("");
  const [newNama, setNewNama] = useState("");

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editNama, setEditNama] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, tim] = await Promise.all([listPetugasAkun(), listTimKasukretan()]);
      setAccounts(rows);
      setTimOptions(
        tim.map((t) => ({
          id: t.id,
          nama: t.nama,
          label: `${t.nama} · ${t.banjar_nama} · ${t.jabatan}`,
        }))
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function notify(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(""), 3000);
  }

  useEffect(() => {
    if (!newTimId) return;
    const tim = timOptions.find((t) => t.id === newTimId);
    if (tim && !newNama.trim()) setNewNama(tim.nama);
  }, [newTimId, timOptions, newNama]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const uErr = validateUsername(newUsername);
    if (uErr) {
      setError(uErr);
      return;
    }
    const pErr = validatePassword(newPassword);
    if (pErr) {
      setError(pErr);
      return;
    }
    if (!newTimId) {
      setError("Pilih anggota tim kasukretan");
      return;
    }
    try {
      await createPetugasAkun({
        username: newUsername,
        password: newPassword,
        tim_kasukretan_id: newTimId,
        nama: newNama || undefined,
      });
      setShowCreate(false);
      setNewUsername("");
      setNewPassword("");
      setNewTimId("");
      setNewNama("");
      notify("Akun petugas ditambahkan — kirim ke cloud lewat Sinkronisasi");
      await load();
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    }
  }

  async function toggleAktif(target: PetugasAkunRecord) {
    try {
      await updatePetugasAkun(target.id, { aktif: !target.aktif });
      notify(target.aktif ? "Akun dinonaktifkan" : "Akun diaktifkan");
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  function openEdit(target: PetugasAkunRecord) {
    setEditUserId(target.id);
    setEditUsername(target.username);
    setEditNama(target.nama ?? target.tim_nama);
    setResetUserId(null);
    setShowCreate(false);
    setError("");
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUserId) return;
    const uErr = validateUsername(editUsername);
    if (uErr) {
      setError(uErr);
      return;
    }
    try {
      await updatePetugasAkun(editUserId, {
        username: editUsername,
        nama: editNama.trim() || null,
      });
      notify("Username disimpan — kirim akun petugas ke cloud agar login HP ikut berubah");
      setEditUserId(null);
      await load();
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId) return;
    const pErr = validatePassword(resetPassword);
    if (pErr) {
      setError(pErr);
      return;
    }
    try {
      await setPetugasAkunPassword(resetUserId, resetPassword, { clearMustChange: false });
      notify("Password direset — petugas wajib ganti saat login berikutnya");
      setResetUserId(null);
      setResetPassword("");
      await load();
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    }
  }

  const formShell = cn(
    "rounded-lg border border-copper-200 bg-copper-50/50 p-3 space-y-3",
    LIST_CARD,
    isPhone && LIST_CARD_PHONE
  );

  return (
    <Card
      title="Akun petugas lapangan"
      className={cn("space-y-3", LIST_CARD, isPhone && LIST_CARD_PHONE)}
    >
      <p className="text-sm text-muted">
        Username login modul petugas online. Ubah username di sini lalu{" "}
        <strong>kirim akun petugas ke cloud</strong> — jangan edit langsung di Supabase.
        Setiap akun terhubung ke satu anggota Tim Kasukretan.
      </p>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}
      {flash && <p className="text-xs text-green-700">{flash}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          icon={Plus}
          className={cn("text-xs", isPhone ? "h-10" : "h-9")}
          onClick={() => {
            setShowCreate((v) => !v);
            setError("");
          }}
        >
          Tambah akun petugas
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className={formShell}>
          <p className="text-xs font-medium text-copper-900">Akun petugas baru</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Anggota tim kasukretan</Label>
              <Select value={newTimId} onChange={(e) => setNewTimId(e.target.value)}>
                <option value="">— Pilih —</option>
                {timOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Username login</Label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            </div>
            <div>
              <Label>Nama tampilan</Label>
              <Input value={newNama} onChange={(e) => setNewNama(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Password awal</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>
          <div className={cn("flex gap-2", isPhone && "flex-col")}>
            <Button type="submit" className={cn("text-xs", isPhone ? "h-10 w-full" : "h-9")}>
              Simpan
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn("text-xs", isPhone ? "h-10 w-full" : "h-9")}
              onClick={() => setShowCreate(false)}
            >
              Batal
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-muted">Memuat…</p>
      ) : accounts.length === 0 ? (
        <p className="text-xs text-muted">
          Belum ada akun. Tambahkan di atas, lalu kirim ke cloud lewat tombol di bawah.
        </p>
      ) : (
        <ul className="divide-y divide-copper-100 border border-copper-200 rounded-lg overflow-hidden">
          {accounts.map((a) => (
            <li key={a.id} className="px-3 py-2.5 bg-white text-sm space-y-1">
              <div className="flex items-start gap-2">
                <Smartphone size={14} className="text-copper-700 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-copper-900 truncate">
                    {a.nama ?? a.tim_nama}{" "}
                    <span className="text-muted font-normal">({a.username})</span>
                  </p>
                  <p className="text-[11px] text-muted">
                    {a.tim_nama} · {a.banjar_nama}
                    {!a.aktif && " · nonaktif"}
                  </p>
                </div>
                <div
                  className={cn(
                    "shrink-0",
                    isPhone ? "flex flex-col gap-2 w-full mt-2" : "flex flex-col gap-1 items-end"
                  )}
                >
                  {isPhone ? (
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 w-full text-xs"
                        onClick={() => openEdit(a)}
                      >
                        Ubah username
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 w-full text-xs"
                        onClick={() => {
                          setEditUserId(null);
                          setResetUserId(a.id);
                          setResetPassword("");
                          setError("");
                        }}
                      >
                        Reset password
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-10 w-full text-xs"
                        onClick={() => void toggleAktif(a)}
                      >
                        {a.aktif ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-[10px] text-copper-800 underline"
                        onClick={() => openEdit(a)}
                      >
                        Ubah username
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-copper-800 underline"
                        onClick={() => {
                          setEditUserId(null);
                          setResetUserId(a.id);
                          setResetPassword("");
                          setError("");
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        className="text-[10px] text-muted underline"
                        onClick={() => void toggleAktif(a)}
                      >
                        {a.aktif ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editUserId && (
        <form onSubmit={handleEdit} className={formShell}>
          <p className="text-xs font-medium text-copper-900 flex items-center gap-1">
            <Pencil size={12} />
            Ubah username login
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Username login</Label>
              <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div>
              <Label>Nama tampilan</Label>
              <Input value={editNama} onChange={(e) => setEditNama(e.target.value)} />
            </div>
          </div>
          <div className={cn("flex gap-2", isPhone && "flex-col")}>
            <Button type="submit" className={cn("text-xs", isPhone ? "h-10 w-full" : "h-9")}>
              Simpan
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn("text-xs", isPhone ? "h-10 w-full" : "h-9")}
              onClick={() => setEditUserId(null)}
            >
              Batal
            </Button>
          </div>
        </form>
      )}

      {resetUserId && (
        <form onSubmit={handleResetPassword} className={cn(formShell, "space-y-2")}>
          <p className="text-xs font-medium text-copper-900 flex items-center gap-1">
            <KeyRound size={12} />
            Password baru
          </p>
          <Input
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="Min. 6 karakter"
          />
          <div className={cn("flex gap-2", isPhone && "flex-col")}>
            <Button type="submit" className={cn("text-xs", isPhone ? "h-10 w-full" : "h-9")}>
              Simpan password
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn("text-xs", isPhone ? "h-10 w-full" : "h-9")}
              onClick={() => setResetUserId(null)}
            >
              Batal
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
