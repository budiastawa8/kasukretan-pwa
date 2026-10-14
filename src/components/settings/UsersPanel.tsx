import { useCallback, useEffect, useState } from "react";
import { KeyRound, Pencil, Plus, UserCog } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Label, Select } from "../ui/Input";
import { useAuth } from "../../context/AuthContext";
import { validatePassword, validateUsername } from "../../lib/auth-password";
import {
  STAFF_ROLE_LABELS,
  STAFF_ROLES,
  type StaffRole,
} from "../../lib/auth-roles";
import {
  countActiveAdmins,
  createUser,
  listUsers,
  setUserPassword,
  updateUser,
  type UserRecord,
} from "../../lib/services/users";
import { listTimKasukretan } from "../../lib/services/master";
import type { TimKasukretan } from "../../lib/types";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { LIST_CARD, LIST_CARD_PHONE } from "../ui/list-compact";
import { cn } from "../../lib/utils";

function TimKasukretanSelect({
  tim,
  value,
  onChange,
}: {
  tim: TimKasukretan[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label>Nama di Tim Kasukretan</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Pilih petugas</option>
        {tim.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nama} — {t.jabatan}
          </option>
        ))}
      </Select>
      <p className="mt-1 text-[11px] text-muted leading-snug">
        Menentukan wilayah pengumpulan: hanya banjar petugas ini, kecuali jabatan Ketua, Sekretaris, atau
        Bendahara (semua banjar).
      </p>
    </div>
  );
}

export function UsersPanel() {
  const isPhone = useIsPhoneClient();
  const { user: session, refreshUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [tim, setTim] = useState<TimKasukretan[]>([]);
  const [newTimId, setNewTimId] = useState("");
  const [editTimId, setEditTimId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPeran, setNewPeran] = useState<StaffRole>("operator");
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
      const [u, t] = await Promise.all([listUsers(), listTimKasukretan()]);
      setUsers(u);
      setTim(t);
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
    try {
      await createUser({
        username: newUsername,
        password: newPassword,
        peran: newPeran,
        nama: newNama || undefined,
        mustChangePassword: true,
        timKasukretanId: newPeran === "petugas" ? newTimId : null,
      });
      setShowCreate(false);
      setNewUsername("");
      setNewPassword("");
      setNewNama("");
      setNewPeran("operator");
      setNewTimId("");
      notify("Pengguna ditambahkan");
      await load();
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    }
  }

  async function toggleAktif(target: UserRecord) {
    if (target.id === session?.id && target.aktif) {
      setError("Tidak bisa menonaktifkan akun yang sedang dipakai");
      return;
    }
    if (target.peran === "admin" && target.aktif) {
      const admins = await countActiveAdmins(target.id);
      if (admins === 0) {
        setError("Harus ada minimal satu admin aktif");
        return;
      }
    }
    try {
      await updateUser(target.id, { aktif: !target.aktif });
      notify(target.aktif ? "Akses login dicabut" : "Pengguna diaktifkan kembali");
      await load();
    } catch (err) {
      setError(String(err));
    }
  }

  async function changePeran(target: UserRecord, peran: StaffRole) {
    if (target.peran === "admin" && peran !== "admin" && target.aktif) {
      const admins = await countActiveAdmins(target.id);
      if (admins === 0) {
        setError("Harus ada minimal satu admin aktif");
        return;
      }
    }
    try {
      await updateUser(target.id, { peran });
      await load();
      if (peran === "petugas" && !target.tim_kasukretan_id) {
        openEdit({ ...target, peran });
        notify("Peran diperbarui — pilih nama di Tim Kasukretan untuk akun ini");
      } else {
        notify("Peran diperbarui");
      }
    } catch (err) {
      setError(String(err));
    }
  }

  function openEdit(target: UserRecord) {
    setEditUserId(target.id);
    setEditUsername(target.username);
    setEditNama(target.nama ?? "");
    setEditTimId(target.tim_kasukretan_id ?? "");
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
    const editPetugas = users.find((u) => u.id === editUserId)?.peran === "petugas";
    if (editPetugas && !editTimId) {
      setError("Pilih nama di Tim Kasukretan untuk akun petugas lapangan");
      return;
    }
    try {
      await updateUser(editUserId, {
        username: editUsername,
        nama: editNama.trim() || null,
        ...(editPetugas ? { timKasukretanId: editTimId } : {}),
      });
      if (editUserId === session?.id) await refreshUser();
      notify("Data pengguna disimpan");
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
      await setUserPassword(resetUserId, resetPassword, { clearMustChange: false });
      notify("Password direset — pengguna wajib ganti saat login berikutnya");
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

  function renderUserActions(u: UserRecord) {
    const btnClass = cn("text-xs", isPhone ? "h-10 flex-1" : "h-8");
    return (
      <div className={cn("flex gap-1", isPhone && "flex-col w-full")}>
        <Button type="button" variant="secondary" className={btnClass} onClick={() => openEdit(u)}>
          Ubah
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={btnClass}
          onClick={() => {
            setEditUserId(null);
            setResetUserId(u.id);
            setResetPassword("");
            setError("");
          }}
        >
          Reset password
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={btnClass}
          disabled={u.id === session?.id}
          title={
            u.aktif ? "Cabut akses login; riwayat transaksi tetap tersimpan" : undefined
          }
          onClick={() => void toggleAktif(u)}
        >
          {u.aktif ? "Nonaktifkan" : "Aktifkan"}
        </Button>
      </div>
    );
  }

  return (
    <Card
      title="Pengguna"
      className={cn("space-y-3", LIST_CARD, isPhone && LIST_CARD_PHONE)}
    >
      <p className="text-sm text-muted">
        Kelola akun staf: admin, operator, keuangan, prajuru, dan petugas lapangan (hanya menu
        Pengumpulan, terikat ke satu nama di Tim Kasukretan). Untuk menghentikan akses,{" "}
        <strong>nonaktifkan</strong> akun — riwayat transaksi tetap tersimpan; penghapusan
        permanen tidak disediakan.
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
          Tambah pengguna
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className={formShell}>
          <p className="text-xs font-medium text-copper-900">Pengguna baru</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Username</Label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            </div>
            <div>
              <Label>Nama tampilan</Label>
              <Input value={newNama} onChange={(e) => setNewNama(e.target.value)} />
            </div>
            <div>
              <Label>Password awal</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label>Peran</Label>
              <Select value={newPeran} onChange={(e) => setNewPeran(e.target.value as StaffRole)}>
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {STAFF_ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </div>
            {newPeran === "petugas" && (
              <TimKasukretanSelect tim={tim} value={newTimId} onChange={setNewTimId} />
            )}
          </div>
          <Button
            type="submit"
            className={cn("text-xs", isPhone ? "h-10 w-full" : "h-9")}
            icon={UserCog}
          >
            Simpan
          </Button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted">Memuat…</p>
      ) : isPhone ? (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5 space-y-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm font-semibold text-copper-950">{u.username}</p>
                <p className="text-sm text-copper-800">{u.nama ?? "—"}</p>
                {u.peran === "petugas" && (
                  <p
                    className={cn(
                      "text-[11px]",
                      u.tim_kasukretan_nama ? "text-muted" : "text-amber-700"
                    )}
                  >
                    {u.tim_kasukretan_nama
                      ? `Tim: ${u.tim_kasukretan_nama}`
                      : "Belum terhubung ke Tim Kasukretan"}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Peran</Label>
                <Select
                  className="text-sm"
                  value={u.peran}
                  disabled={u.id === session?.id}
                  onChange={(e) => void changePeran(u, e.target.value as StaffRole)}
                >
                  {STAFF_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {STAFF_ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-xs">
                {u.aktif ? (
                  u.must_change_password ? (
                    <span className="text-amber-700">Aktif · ganti password</span>
                  ) : (
                    <span className="text-green-700">Aktif</span>
                  )
                ) : (
                  <span className="text-muted">Nonaktif</span>
                )}
              </p>
              {renderUserActions(u)}
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-copper-100">
                <th className="py-2 pr-2">Username</th>
                <th className="py-2 pr-2">Nama</th>
                <th className="py-2 pr-2">Peran</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-copper-50">
                  <td className="py-2 pr-2 font-mono text-xs">{u.username}</td>
                  <td className="py-2 pr-2">
                    {u.nama ?? "—"}
                    {u.peran === "petugas" && (
                      <span
                        className={cn(
                          "block text-[11px]",
                          u.tim_kasukretan_nama ? "text-muted" : "text-amber-700"
                        )}
                      >
                        {u.tim_kasukretan_nama
                          ? `Tim: ${u.tim_kasukretan_nama}`
                          : "Belum terhubung ke Tim Kasukretan"}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    <Select
                      className="text-xs h-8 min-w-[120px]"
                      value={u.peran}
                      disabled={u.id === session?.id}
                      onChange={(e) => void changePeran(u, e.target.value as StaffRole)}
                    >
                      {STAFF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {STAFF_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-2 pr-2 text-xs">
                    {u.aktif ? (
                      u.must_change_password ? (
                        <span className="text-amber-700">Aktif · ganti password</span>
                      ) : (
                        <span className="text-green-700">Aktif</span>
                      )
                    ) : (
                      <span className="text-muted">Nonaktif</span>
                    )}
                  </td>
                  <td className="py-2">{renderUserActions(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editUserId && (
        <form onSubmit={handleEdit} className={formShell}>
          <p className="text-xs font-medium text-copper-900 flex items-center gap-1">
            <Pencil size={14} />
            Ubah pengguna — {users.find((u) => u.id === editUserId)?.username}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Username</Label>
              <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} />
            </div>
            <div>
              <Label>Nama tampilan</Label>
              <Input value={editNama} onChange={(e) => setEditNama(e.target.value)} />
            </div>
            {users.find((u) => u.id === editUserId)?.peran === "petugas" && (
              <TimKasukretanSelect tim={tim} value={editTimId} onChange={setEditTimId} />
            )}
          </div>
          <div className={cn("flex gap-2", isPhone && "flex-col")}>
            <Button type="submit" className={cn("text-xs", isPhone ? "h-10 w-full" : "h-8")}>
              Simpan
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn("text-xs", isPhone ? "h-10 w-full" : "h-8")}
              onClick={() => setEditUserId(null)}
            >
              Batal
            </Button>
          </div>
        </form>
      )}

      {resetUserId && (
        <form
          onSubmit={handleResetPassword}
          className={cn(formShell, !isPhone && "bg-white")}
        >
          <p className="text-xs font-medium text-copper-900 flex items-center gap-1">
            <KeyRound size={14} />
            Reset password — {users.find((u) => u.id === resetUserId)?.username}
          </p>
          <Input
            type="password"
            placeholder="Password baru"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
          />
          <div className={cn("flex gap-2", isPhone && "flex-col")}>
            <Button type="submit" className={cn("text-xs", isPhone ? "h-10 w-full" : "h-8")}>
              Simpan
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn("text-xs", isPhone ? "h-10 w-full" : "h-8")}
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
