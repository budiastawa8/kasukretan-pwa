import { useCallback, useEffect, useState } from "react";
import { CloudOff, LogIn, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/services/auth";
import { useAuth } from "../context/AuthContext";
import { probeLanBridge } from "../lib/lan-client";
import { initLanClientDatabase } from "../lib/db/init";
import { defaultHomePath } from "../lib/auth-roles";
import { Button } from "../components/ui/Button";
import { Input, Label, PasswordInput } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { AppLogo } from "../components/ui/AppLogo";
import { InstallAppButton } from "../components/pwa/InstallAppButton";
import { UkuranTulisanControl } from "../components/ui/UkuranTulisanControl";

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-login flex min-h-[100dvh] flex-col bg-gradient-to-b from-copper-100 via-background to-copper-200/50">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 sm:py-12">
        {children}
      </div>
    </div>
  );
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-5 flex flex-col items-center gap-3 text-center sm:mb-6">
      <AppLogo size={80} />
      <div>
        <h1 className="text-xl font-bold tracking-tight text-copper-800 sm:text-2xl">
          Kasukretan Krama
        </h1>
        <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function OfflinePage({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <LoginShell>
      <Card className="w-full ring-1 ring-copper-300/30 sm:shadow-md">
        <Brand subtitle="Server belum dapat dijangkau" />
        <div className="mb-4 flex gap-2 rounded-lg border border-copper-200 bg-copper-50/90 px-3 py-2.5 text-sm leading-snug text-copper-900">
          <CloudOff size={18} className="mt-0.5 shrink-0 text-copper-700" aria-hidden />
          <span>
            Aplikasi membutuhkan koneksi internet. Periksa data seluler atau WiFi, lalu coba lagi.
          </span>
        </div>
        <Button
          type="button"
          className="h-12 w-full text-sm sm:h-10"
          icon={RefreshCw}
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Menghubungkan…" : "Coba lagi"}
        </Button>
      </Card>
    </LoginShell>
  );
}

function StaffLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const user = await login(username.trim(), password);
      if (!user) {
        setError("Username atau password salah");
        return;
      }
      setUser(user);
      navigate(user.mustChangePassword ? "/ganti-password-wajib" : defaultHomePath(user.peran));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <LoginShell>
      <Card className="w-full ring-1 ring-copper-300/30 sm:shadow-md">
        <Brand subtitle="Masuk sebagai staf desa adat" />
        <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
          <div>
            <Label>Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              className="min-h-11 text-base sm:min-h-10 sm:text-sm"
            />
          </div>
          <div>
            <Label>Password</Label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="min-h-11 text-base sm:min-h-10 sm:text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button
            type="submit"
            className="h-12 w-full text-sm sm:h-10"
            icon={LogIn}
            disabled={loading}
          >
            {loading ? "Memproses..." : "Masuk"}
          </Button>
        </form>
        <div className="mt-4">
          <UkuranTulisanControl />
        </div>
        <InstallAppButton className="mt-4" />
      </Card>
    </LoginShell>
  );
}

export function LoginPage() {
  const [mode, setMode] = useState<"loading" | "online" | "offline">("loading");
  const [retrying, setRetrying] = useState(false);

  const connect = useCallback(async () => {
    const ok = await probeLanBridge(true);
    if (ok) {
      try {
        await initLanClientDatabase();
      } catch {
        /* login() akan menampilkan pesan bila tetap gagal */
      }
    }
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void connect().then((ok) => {
      if (!cancelled) setMode(ok ? "online" : "offline");
    });
    return () => {
      cancelled = true;
    };
  }, [connect]);

  if (mode === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-copper-50 px-4 text-sm text-muted">
        Menghubungkan ke server…
      </div>
    );
  }

  if (mode === "offline") {
    return (
      <OfflinePage
        retrying={retrying}
        onRetry={() => {
          setRetrying(true);
          void connect().then((ok) => {
            setRetrying(false);
            if (ok) setMode("online");
          });
        }}
      />
    );
  }

  return <StaffLoginForm />;
}
