import { useState } from "react";
import { KeyRound } from "lucide-react";
import { activateLicense, type LicenseStatus } from "../../lib/license";
import { Button } from "../ui/Button";
import { LicenseCodeInput } from "./LicenseCodeInput";

type Props = {
  onActivated?: (status: LicenseStatus) => void;
  submitLabel?: string;
};

export function DesktopActivateForm({ onActivated, submitLabel = "Aktivasi" }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = await activateLicense(code);
      if (next.activated && !next.local_trial) {
        setCode("");
        onActivated?.(next);
      } else {
        setError(next.message ?? "Aktivasi gagal.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleActivate(e)} className="space-y-3">
      <LicenseCodeInput
        label="Kode aktivasi"
        value={code}
        onChange={setCode}
        placeholder="KSK-XXXXX-XXXXX-…"
        disabled={busy}
      />
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">
          {error}
        </p>
      )}
      <Button type="submit" icon={KeyRound} disabled={busy || !code.trim()} className="w-full">
        {busy ? "Mengaktivasi…" : submitLabel}
      </Button>
    </form>
  );
}
