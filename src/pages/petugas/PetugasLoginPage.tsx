import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { usePetugasAuth } from "../../context/PetugasAuthContext";
import { API_BASE } from "../../lib/api/client";
import { isDesktopApp } from "../../lib/runtime";
import { Button } from "../../components/ui/Button";
import { Input, Label } from "../../components/ui/Input";
import { Card } from "../../components/ui/Card";
import { AppLogo } from "../../components/ui/AppLogo";
import "../../styles/petugas-module.css";

export function PetugasLoginPage() {
  const { user, login } = usePetugasAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/petugas" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(username, password);
      navigate("/petugas");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="petugas-module min-h-screen flex items-center justify-center p-4 bg-copper-200">
      <Card className="w-full max-w-sm space-y-4">
        <div className="text-center flex flex-col items-center gap-2">
          <AppLogo size={72} alt="" />
          <div>
            <h1 className="text-lg font-bold text-copper-900">Login Petugas</h1>
            <p className="text-xs text-muted mt-1">Terhubung ke database online (API)</p>
            <p className="text-[10px] text-muted/80 mt-1 break-all">Server: {API_BASE}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" className="w-full" icon={LogIn} disabled={loading}>
            {loading ? "Memproses…" : "Masuk"}
          </Button>
        </form>
        {isDesktopApp() ? (
          <Link to="/" className="block text-center text-xs text-copper-700 hover:underline">
            ← Kembali ke admin
          </Link>
        ) : (
          <Link to="/portal/login" className="block text-center text-xs text-copper-700 hover:underline">
            Portal krama →
          </Link>
        )}
      </Card>
    </div>
  );
}
