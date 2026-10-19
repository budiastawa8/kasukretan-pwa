import { useAuth } from "../../context/AuthContext";
import { Card } from "../ui/Card";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { LIST_CARD, LIST_CARD_PHONE } from "../ui/list-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";

export function ChangePasswordPanel() {
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();

  return (
    <Card
      title="Ganti password"
      className={cn(LIST_CARD, isPhone && LIST_CARD_PHONE)}
    >
      <p className="text-sm text-muted mb-4">
        Akun{" "}
        <span className="font-medium text-copper-900">{user?.username}</span>
        {user?.nama ? ` · ${user.nama}` : ""}. Masukkan password saat ini, lalu buat password baru.
      </p>
      <ChangePasswordForm />
    </Card>
  );
}
