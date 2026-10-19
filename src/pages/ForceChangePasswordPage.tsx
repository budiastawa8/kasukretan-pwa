import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { defaultHomePath } from "../lib/auth-roles";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { AppLogo } from "../components/ui/AppLogo";
import { ChangePasswordForm } from "../components/settings/ChangePasswordForm";

export function ForceChangePasswordPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
        <ChangePasswordForm
          onSuccess={() => {
            if (user) navigate(defaultHomePath(user.peran), { replace: true });
          }}
        />
        <Button
          type="button"
          variant="ghost"
          className="mt-3 w-full"
          icon={LogOut}
          onClick={logout}
        >
          Keluar
        </Button>
      </Card>
    </div>
  );
}
