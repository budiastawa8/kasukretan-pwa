import { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { defaultHomePath } from "../lib/auth-roles";
import { changeOwnPassword } from "../lib/services/users";
import { validatePassword } from "../lib/auth-password";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";
import { AppLogo } from "../components/ui/AppLogo";

export function ForceChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const policyErr = validatePassword(newPassword);
    if (policyErr) {
      setError(policyErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok");
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      await changeOwnPassword(user.id, oldPassword, newPassword);
      setUser({ ...user, mustChangePassword: false });
      navigate(defaultHomePath(user.peran), { replace: true });
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-copper-100 via-background to-copper-200/60">
      <Card className="w-full max-w-md ring-1 ring-copper-300/30">
        <div className="text-center mb-6 flex flex-col items-center gap-3">
          <AppLogo size={80} />
          <div>
            <h1 className="text-xl font-bold text-copper-800">Ganti Password Wajib</h1>
            <p className="text-sm text-muted mt-2">
              Akun <span className="font-medium text-copper-900">{user?.username}</span> masih
              memakai password bawaan. Buat password baru sebelum melanjutkan.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Password saat ini</Label>
            <Input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div>
            <Label>Password baru</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div>
            <Label>Ulangi password baru</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <p className="text-xs text-muted">Minimal 8 karakter, huruf dan angka.</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" icon={KeyRound} disabled={loading}>
            {loading ? "Menyimpan…" : "Simpan password baru"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            icon={LogOut}
            onClick={logout}
          >
            Keluar
          </Button>
        </form>
      </Card>
    </div>
  );
}
