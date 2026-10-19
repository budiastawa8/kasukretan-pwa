import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { changeOwnPassword } from "../../lib/services/users";
import { validatePassword } from "../../lib/auth-password";
import { Button } from "../ui/Button";
import { Label, PasswordInput } from "../ui/Input";

type Props = {
  submitLabel?: string;
  onSuccess?: () => void;
  className?: string;
};

export function ChangePasswordForm({
  submitLabel = "Simpan password baru",
  onSuccess,
  className,
}: Props) {
  const { user, setUser } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

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
      const fresh = await changeOwnPassword(user.id, oldPassword, newPassword);
      setUser(fresh ?? { ...user, mustChangePassword: false });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess("Password berhasil diganti.");
      onSuccess?.();
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/, ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className ?? "space-y-4"}>
      <div>
        <Label>Password saat ini</Label>
        <PasswordInput
          value={oldPassword}
          onChange={(e) => setOldPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div>
        <Label>Password baru</Label>
        <PasswordInput
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <div>
        <Label>Ulangi password baru</Label>
        <PasswordInput
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      <p className="text-xs text-muted">Minimal 8 karakter, huruf dan angka.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
      <Button type="submit" className="w-full sm:w-auto" icon={KeyRound} disabled={loading}>
        {loading ? "Menyimpan…" : submitLabel}
      </Button>
    </form>
  );
}
