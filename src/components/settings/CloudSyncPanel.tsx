import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudUpload,
  Database,
  Download,
  RefreshCw,
  Upload,
} from "lucide-react";
import { isDesktopApp } from "../../lib/runtime";
import {
  clearCloudSession,
  cloudLogin,
  fetchCloudApiHealth,
  formatCloudFetchError,
  getCloudApiBase,
  getCloudApiToken,
  getCloudApiUser,
  normalizeCloudApiBase,
  setCloudApiBase,
} from "../../lib/sync/cloud-config";
import { getSyncMeta } from "../../lib/sync/sync-meta";
import { pushCatalogToCloud } from "../../lib/sync/catalog-sync";
import { fetchCloudStatus, pushKramaByNomorKartu, pushKramaToCloud } from "../../lib/sync/krama-sync";
import { pushPortalToCloud } from "../../lib/sync/portal-sync";
import { pushPetugasAkunToCloud } from "../../lib/sync/petugas-akun-sync";
import {
  pullPembayaranFromCloud,
  pushPembayaranToCloud,
  syncPembayaranBidirectional,
} from "../../lib/sync/payment-sync";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";

type StatusBanner = { kind: "success" | "error" | "info"; text: string; details?: string[] };

function errMsg(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return formatCloudFetchError(e);
  if (typeof e === "string" && e.trim()) return formatCloudFetchError(e);
  return "Terjadi kesalahan tidak diketahui";
}

function formatCatalogResult(result: Record<string, unknown>): string {
  const petugasUsers = result.petugasUsers as { upserted?: number } | undefined;
  const parts = [
    result.desa ? `${result.desa} desa` : null,
    result.klasifikasi ? `${result.klasifikasi} klasifikasi` : null,
    result.banjar ? `${result.banjar} banjar` : null,
    result.tempek ? `${result.tempek} tempek` : null,
    result.arahan ? `${result.arahan} arahan` : null,
    result.iuran ? `${result.iuran} iuran` : null,
    result.tim ? `${result.tim} tim` : null,
    result.akunKeuangan ? `${result.akunKeuangan} akun` : null,
    result.jenisMipil ? `${result.jenisMipil} jenis mipil` : null,
    result.jenisKramaTamiu ? `${result.jenisKramaTamiu} jenis KT` : null,
    result.jenisTamiu ? `${result.jenisTamiu} jenis tamiu` : null,
    petugasUsers?.upserted ? `${petugasUsers.upserted} akun petugas` : null,
  ].filter(Boolean);
  if (parts.length === 0) {
    return "Tidak ada data master aktif di desktop untuk dikirim.";
  }
  return parts.join(", ");
}

function StatusBox({ status }: { status: StatusBanner | null }) {
  if (!status) return null;
  const styles =
    status.kind === "success"
      ? "text-emerald-900 bg-emerald-50 border-emerald-200"
      : status.kind === "error"
        ? "text-red-800 bg-red-50 border-red-200"
        : "text-copper-900 bg-copper-100 border-copper-200";
  return (
    <p
      role="status"
      className={`text-xs rounded-md px-2.5 py-2 flex items-start gap-2 border ${styles}`}
    >
      {status.kind === "success" ? (
        <CheckCircle2 size={16} className="shrink-0 mt-0.5" aria-hidden />
      ) : status.kind === "error" ? (
        <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
      ) : (
        <RefreshCw size={16} className="shrink-0 mt-0.5 animate-spin" aria-hidden />
      )}
      <span>
        {status.text}
        {status.details && status.details.length > 0 && (
          <span className="block mt-1 font-mono text-[10px] leading-relaxed opacity-90">
            {status.details.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </span>
        )}
      </span>
    </p>
  );
}

export function CloudSyncPanel({ embedded = false }: { embedded?: boolean }) {
  const [apiBase, setApiBase] = useState(getCloudApiBase());
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(!!getCloudApiToken());
  const [apiUser, setApiUser] = useState(getCloudApiUser());
  const [lastPull, setLastPull] = useState<string | null>(null);
  const [lastPush, setLastPush] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [masterStatus, setMasterStatus] = useState<StatusBanner | null>(null);
  const [kramaStatus, setKramaStatus] = useState<StatusBanner | null>(null);
  const [portalStatus, setPortalStatus] = useState<StatusBanner | null>(null);
  const [petugasStatus, setPetugasStatus] = useState<StatusBanner | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<StatusBanner | null>(null);
  const [paymentAction, setPaymentAction] = useState<
    "pull" | "pull-full" | "push" | "push-full" | "both" | null
  >(null);
  const [kramaPushAction, setKramaPushAction] = useState<"incremental" | "full" | "one" | null>(null);
  const [kramaResyncKartu, setKramaResyncKartu] = useState("");
  const [cloudCounts, setCloudCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    void (async () => {
      setLastPull(await getSyncMeta("last_pull_at"));
      setLastPush(await getSyncMeta("last_push_at"));
    })();
  }, []);

  if (!isDesktopApp()) {
    const body = (
      <p className="text-sm text-muted">
        Sinkronisasi desktop hanya tersedia di aplikasi Electron (
        <code className="text-xs">npm run electron:dev</code>). Mode petugas di browser terhubung
        langsung ke API.
      </p>
    );
    return embedded ? body : <Card title="Sinkronisasi cloud">{body}</Card>;
  }

  async function handleSaveUrl() {
    try {
      setCloudApiBase(apiBase);
      setApiBase(normalizeCloudApiBase(apiBase));
      setMessage("URL API disimpan");
      setError("");
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function handleTestHealth() {
    setBusy(true);
    setError("");
    try {
      setCloudApiBase(apiBase);
      setApiBase(normalizeCloudApiBase(apiBase));
      const health = await fetchCloudApiHealth();
      if (!health.ok) {
        setError(`Health gagal — buka ${normalizeCloudApiBase(apiBase)}/health di browser`);
        return;
      }
      setMessage(
        `API OK v${health.version ?? "?"}${health.features?.petugasUsersSync ? " · sync petugas" : ""}`
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin() {
    setBusy(true);
    setError("");
    try {
      setCloudApiBase(apiBase);
      setApiBase(normalizeCloudApiBase(apiBase));
      const user = await cloudLogin(username.trim(), password);
      setLoggedIn(true);
      setApiUser(user);
      setMessage(`Login API: ${user.username}`);
      setPassword("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    clearCloudSession();
    setLoggedIn(false);
    setApiUser(null);
    setMessage("Logout API");
  }

  function paymentResultDetails(
    r: Awaited<ReturnType<typeof pullPembayaranFromCloud>>
  ): string[] {
    return [...r.paturunan.errors, ...r.dudukan.errors, ...r.keringanan.errors].slice(0, 8);
  }

  async function runPull(full = false) {
    setBusy(true);
    setError("");
    setPaymentAction(full ? "pull-full" : "pull");
    setPaymentStatus({
      kind: "info",
      text: full ? "Menarik semua pembayaran dari cloud…" : "Menarik pembayaran dari cloud…",
    });
    try {
      const r = await pullPembayaranFromCloud(full ? { full: true } : undefined);
      setLastPull(r.lastPullAt);
      const errCount =
        r.paturunan.errors.length + r.dudukan.errors.length + r.keringanan.errors.length;
      const ignoredCount = r.paturunan.ignored + r.dudukan.ignored;
      const skippedCount =
        r.paturunan.skipped + r.dudukan.skipped + r.keringanan.skipped;
      const text =
        (full ? "Tarik semua: " : "Tarik berhasil: ") +
        `+${r.paturunan.inserted} paturunan, +${r.dudukan.inserted} dudukan, +${r.keringanan.inserted} keringanan` +
        (skippedCount > 0 ? ` (${skippedCount} sudah ada)` : "") +
        (ignoredCount > 0 ? ` — ${ignoredCount} demo cloud diabaikan` : "") +
        (errCount > 0 ? ` — ${errCount} gagal` : "");
      setMessage(text);
      const details = paymentResultDetails(r);
      setPaymentStatus({
        kind:
          errCount > 0 &&
          r.paturunan.inserted + r.dudukan.inserted + r.keringanan.inserted === 0
            ? "error"
            : "success",
        text,
        details: details.length > 0 ? details : undefined,
      });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setPaymentStatus({ kind: "error", text: msg });
    } finally {
      setBusy(false);
      setPaymentAction(null);
    }
  }

  async function runPush(full = false) {
    setBusy(true);
    setError("");
    setPaymentAction(full ? "push-full" : "push");
    setPaymentStatus({
      kind: "info",
      text: full ? "Mengirim semua pembayaran ke cloud…" : "Mengirim pembayaran baru ke cloud…",
    });
    try {
      const r = await pushPembayaranToCloud(full ? { full: true } : undefined);
      setLastPush(new Date().toISOString());
      const deletedCount =
        r.paturunan.deleted + r.dudukan.deleted + r.keringanan.deleted;
      const sentCount = r.pushed.paturunan + r.pushed.dudukan + r.pushed.keringanan;
      const text =
        (full ? "Kirim semua: " : "Kirim baru: ") +
        `${sentCount} baris dikirim → +${r.paturunan.inserted} paturunan, +${r.dudukan.inserted} dudukan, +${r.keringanan.inserted} keringanan` +
        (deletedCount > 0 ? `, −${deletedCount} dihapus di cloud` : "");
      setMessage(text);
      setPaymentStatus({ kind: "success", text });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setPaymentStatus({ kind: "error", text: msg });
    } finally {
      setBusy(false);
      setPaymentAction(null);
    }
  }

  async function runBoth() {
    setBusy(true);
    setError("");
    setPaymentAction("both");
    setPaymentStatus({ kind: "info", text: "Sinkron pembayaran (tarik + kirim)…" });
    try {
      const { pull, push } = await syncPembayaranBidirectional();
      setLastPull(pull.lastPullAt);
      setLastPush(new Date().toISOString());
      const errCount =
        pull.paturunan.errors.length +
        pull.dudukan.errors.length +
        pull.keringanan.errors.length;
      const ignoredCount = pull.paturunan.ignored + pull.dudukan.ignored;
      const deletedCount =
        push.paturunan.deleted + push.dudukan.deleted + push.keringanan.deleted;
      const text =
        `Sinkron berhasil: tarik +${pull.paturunan.inserted}/${pull.dudukan.inserted}/${pull.keringanan.inserted}, ` +
        `kirim +${push.paturunan.inserted}/${push.dudukan.inserted}/${push.keringanan.inserted}` +
        (deletedCount > 0 ? `, −${deletedCount} dihapus di cloud` : "") +
        (ignoredCount > 0 ? ` — ${ignoredCount} demo cloud diabaikan` : "") +
        (errCount > 0 ? ` — ${errCount} gagal saat tarik` : "");
      setMessage(text);
      const details = paymentResultDetails(pull);
      setPaymentStatus({
        kind:
          errCount > 0 &&
          pull.paturunan.inserted + pull.dudukan.inserted + pull.keringanan.inserted === 0
            ? "error"
            : "success",
        text,
        details: details.length > 0 ? details : undefined,
      });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setPaymentStatus({ kind: "error", text: msg });
    } finally {
      setBusy(false);
      setPaymentAction(null);
    }
  }

  async function runMasterPush() {
    setBusy(true);
    setError("");
    setMasterStatus({ kind: "info", text: "Mengirim master ke cloud…" });
    try {
      const r = await pushCatalogToCloud();
      const detail = formatCatalogResult(r.result);
      const text = detail.includes("Tidak ada data")
        ? detail
        : `Master berhasil dikirim: ${detail}.`;
      setMessage(text);
      setMasterStatus({
        kind: detail.includes("Tidak ada data") ? "error" : "success",
        text,
      });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setMasterStatus({ kind: "error", text: `Gagal kirim master: ${msg}` });
    } finally {
      setBusy(false);
    }
  }

  async function runPortalPush() {
    setBusy(true);
    setError("");
    setPortalStatus({ kind: "info", text: "Mengirim akun portal ke cloud…" });
    try {
      const r = await pushPortalToCloud();
      const errN = r.result.errors.length;
      const text =
        errN > 0
          ? `Portal sebagian: ${r.result.upserted} akun (${errN} error).`
          : `Portal berhasil: ${r.result.upserted} akun dikirim.`;
      setMessage(text);
      setPortalStatus({
        kind: errN > 0 ? "error" : "success",
        text,
        details: errN > 0 ? r.result.errors.slice(0, 5) : undefined,
      });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setPortalStatus({ kind: "error", text: `Gagal kirim portal: ${msg}` });
    } finally {
      setBusy(false);
    }
  }

  async function runPetugasPush() {
    setBusy(true);
    setError("");
    setPetugasStatus({ kind: "info", text: "Mengirim akun petugas ke cloud…" });
    try {
      const r = await pushPetugasAkunToCloud();
      const errN = r.result.errors.length;
      const text =
        errN > 0
          ? `Petugas sebagian: ${r.result.upserted} akun (${errN} error).`
          : `Petugas berhasil: ${r.result.upserted} akun dikirim.`;
      setMessage(text);
      setPetugasStatus({
        kind: errN > 0 ? "error" : "success",
        text,
        details: errN > 0 ? r.result.errors.slice(0, 5) : undefined,
      });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setPetugasStatus({ kind: "error", text: `Gagal kirim akun petugas: ${msg}` });
    } finally {
      setBusy(false);
    }
  }

  async function runKramaPush(full = false) {
    setBusy(true);
    setKramaPushAction(full ? "full" : "incremental");
    setError("");
    setKramaStatus({
      kind: "info",
      text: full ? "Mengirim semua krama aktif…" : "Mengirim krama baru/diubah…",
    });
    try {
      const r = await pushKramaToCloud({
        full,
        onProgress: ({ batch, batchCount, sent, total }) => {
          setKramaStatus({
            kind: "info",
            text:
              batch === 0
                ? full
                  ? `Menyiapkan ${total} krama aktif…`
                  : `Menyiapkan ${total} krama…`
                : `Mengirim krama… batch ${batch}/${batchCount} (${sent}/${total} kartu)`,
          });
        },
      });
      if (r.empty) {
        const text = full
          ? "Tidak ada krama aktif untuk dikirim."
          : "Tidak ada krama baru atau diubah sejak kirim terakhir.";
        setMessage(text);
        setKramaStatus({ kind: "success", text });
        return;
      }
      const errN = r.result.errors.length;
      const text =
        errN > 0
          ? `Krama sebagian: ${r.result.krama} kartu, ${r.result.penduduk} kepala (${errN} error).`
          : full
            ? `Semua krama terkirim: ${r.result.krama} kartu, ${r.result.penduduk} kepala.`
            : `Krama terkirim: ${r.result.krama} kartu, ${r.result.penduduk} kepala.`;
      setMessage(text);
      setKramaStatus({
        kind: errN > 0 ? "error" : "success",
        text,
        details: errN > 0 ? r.result.errors.slice(0, 5) : undefined,
      });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setKramaStatus({ kind: "error", text: `Gagal kirim krama: ${msg}` });
    } finally {
      setBusy(false);
      setKramaPushAction(null);
    }
  }

  async function runKramaResyncOne() {
    const kartu = kramaResyncKartu.trim();
    if (!kartu) return;
    setBusy(true);
    setKramaPushAction("one");
    setError("");
    setKramaStatus({ kind: "info", text: `Mengirim ulang kartu ${kartu}…` });
    try {
      const r = await pushKramaByNomorKartu(kartu);
      const text = `Kartu ${kartu} terkirim (${r.result.krama} krama, ${r.result.penduduk} kepala).`;
      setMessage(text);
      setKramaStatus({
        kind: r.result.errors.length > 0 ? "error" : "success",
        text,
        details: r.result.errors.length > 0 ? r.result.errors.slice(0, 3) : undefined,
      });
    } catch (e) {
      const msg = errMsg(e);
      setError(msg);
      setKramaStatus({ kind: "error", text: `Gagal kirim kartu: ${msg}` });
    } finally {
      setBusy(false);
      setKramaPushAction(null);
    }
  }

  const panel = (
    <>
      <p className="text-sm font-medium text-copper-900 mb-1">Sinkronisasi cloud</p>
      <p className="text-xs text-muted mb-3 leading-relaxed">
        Kirim master dan krama dari desktop ke server agar petugas lapangan mengenali data desa.
        Setelah petugas input pembayaran, tarik ke desktop kantor.
      </p>

      <div className="space-y-3">
        <div>
          <Label>URL API cloud</Label>
          <div className="flex gap-2">
            <Input
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              placeholder="http://localhost:3001/api"
            />
            <Button type="button" variant="secondary" onClick={() => void handleSaveUrl()}>
              Simpan
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy || !apiBase.trim()}
              onClick={() => void handleTestHealth()}
            >
              Tes API
            </Button>
          </div>
          <p className="text-[11px] text-muted mt-1">
            Supabase/production: URL penuh ke server API Anda (bukan URI Postgres).
          </p>
        </div>

        {!loggedIn ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label>Username API</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <Label>Password API</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="button" onClick={handleLogin} disabled={busy} className="sm:col-span-2">
              Login ke API
            </Button>
          </div>
        ) : (
          <p className="text-sm text-copper-800">
            Terhubung sebagai <strong>{apiUser?.nama ?? apiUser?.username}</strong>{" "}
            <button type="button" className="text-xs text-muted underline ml-2" onClick={handleLogout}>
              logout
            </button>
          </p>
        )}

        {loggedIn && (
          <>
            <div className="rounded-lg border border-copper-200 bg-copper-50/50 p-3 space-y-2">
              <p className="text-xs font-semibold text-copper-900">1. Kirim struktur desa (sekali / saat ada perubahan master)</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  icon={Upload}
                  disabled={busy}
                  onClick={() => void runMasterPush()}
                >
                  {busy && masterStatus?.kind === "info" ? "Mengirim…" : "Kirim master ke cloud"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={Database}
                  disabled={busy}
                  onClick={() => void runKramaPush(false)}
                >
                  {busy && kramaPushAction === "incremental" ? "Mengirim…" : "Kirim krama baru/diubah"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void runKramaPush(true)}
                  title="Kirim ulang semua krama aktif"
                >
                  {busy && kramaPushAction === "full" ? "Mengirim…" : "Kirim semua krama"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={CloudUpload}
                  disabled={busy}
                  onClick={() => void runPortalPush()}
                >
                  {busy && portalStatus?.kind === "info" ? "Mengirim…" : "Kirim portal ke cloud"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={CloudUpload}
                  disabled={busy}
                  onClick={() => void runPetugasPush()}
                >
                  {busy && petugasStatus?.kind === "info"
                    ? "Mengirim…"
                    : "Kirim akun petugas ke cloud"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const s = await fetchCloudStatus();
                      setCloudCounts(s.counts);
                    } catch (e) {
                      setError(errMsg(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Cek isi cloud
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[12rem]">
                  <Label className="text-[11px]">Kirim ulang satu kartu (perbaikan periode)</Label>
                  <Input
                    value={kramaResyncKartu}
                    onChange={(e) => setKramaResyncKartu(e.target.value)}
                    placeholder="02130216010343"
                    className="font-mono text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || !kramaResyncKartu.trim()}
                  onClick={() => void runKramaResyncOne()}
                >
                  {busy && kramaPushAction === "one" ? "Mengirim…" : "Kirim kartu ini"}
                </Button>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Periode dudukan dihitung dari <strong>tanggal pencatatan</strong>,{" "}
                <strong>masa berlaku jenis</strong>, dan <strong>perpanjangan pemasih</strong> —{" "}
                <em>bukan</em> dari pembayaran. Urutan perbaikan: (1){" "}
                <strong>Kirim master ke cloud</strong> (jenis &amp; masa berlaku), (2){" "}
                <strong>Kirim semua krama</strong> atau <strong>Kirim kartu ini</strong> untuk satu
                kasus. Setelah mengubah tanggal pencatatan atau perpanjang pemasih, wajib kirim ulang
                krama.
              </p>
              <StatusBox status={masterStatus} />
              <StatusBox status={kramaStatus} />
              <StatusBox status={portalStatus} />
              <StatusBox status={petugasStatus} />
              {cloudCounts && (
                <p className="text-[11px] text-muted">
                  Cloud: {cloudCounts.krama ?? 0} krama · {cloudCounts.banjar ?? 0} banjar ·{" "}
                  {cloudCounts.krama_portal ?? 0} portal · {cloudCounts.paturunan_pembayaran ?? 0}{" "}
                  bayar paturunan · {cloudCounts.dudukan_pembayaran ?? 0} bayar dudukan ·{" "}
                  {cloudCounts.dudukan_keringanan ?? 0} keringanan
                </p>
              )}
            </div>

            <div className="rounded-lg border border-copper-200 p-3 space-y-2">
              <p className="text-xs font-semibold text-copper-900">2. Sinkronkan pembayaran</p>
              <p className="text-[11px] text-muted">
                Pembayaran via Petugas UI tersimpan di cloud — tarik ke desktop agar muncul di
                kantor. Bayar dan keringanan dudukan di kantor otomatis dikirim ke cloud jika sudah
                login API. Tombol Kirim ke cloud hanya mengirim data baru sejak kirim terakhir
                (lebih cepat); gunakan Kirim semua untuk sinkron penuh pertama kali.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  icon={Download}
                  onClick={() => void runPull(false)}
                  disabled={busy}
                >
                  {busy && paymentAction === "pull" ? "Menarik…" : "Tarik dari cloud"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={Download}
                  onClick={() => void runPull(true)}
                  disabled={busy}
                >
                  {busy && paymentAction === "pull-full" ? "Menarik…" : "Tarik semua"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={CloudUpload}
                  onClick={() => void runPush(false)}
                  disabled={busy}
                >
                  {busy && paymentAction === "push" ? "Mengirim…" : "Kirim ke cloud"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  icon={CloudUpload}
                  onClick={() => void runPush(true)}
                  disabled={busy}
                >
                  {busy && paymentAction === "push-full" ? "Mengirim…" : "Kirim semua"}
                </Button>
                <Button
                  type="button"
                  icon={RefreshCw}
                  onClick={() => void runBoth()}
                  disabled={busy}
                >
                  {busy && paymentAction === "both" ? "Menyinkronkan…" : "Tarik + kirim"}
                </Button>
              </div>
              <StatusBox status={paymentStatus} />
            </div>
          </>
        )}

        {(lastPull || lastPush) && (
          <p className="text-xs text-muted flex items-center gap-1">
            <Cloud size={14} />
            {lastPull && <>Tarik terakhir: {new Date(lastPull).toLocaleString("id-ID")}</>}
            {lastPull && lastPush && " · "}
            {lastPush && <>Kirim terakhir: {new Date(lastPush).toLocaleString("id-ID")}</>}
          </p>
        )}

        {message && !loggedIn && (
          <p className="text-xs text-copper-800 bg-copper-50 border border-copper-200 rounded px-2 py-1">
            {message}
          </p>
        )}
        {error && !masterStatus && !kramaStatus && !portalStatus && !petugasStatus && !paymentStatus && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle size={14} aria-hidden />
            {error}
          </p>
        )}
      </div>
    </>
  );

  return embedded ? panel : <Card title="Sinkronisasi cloud">{panel}</Card>;
}
