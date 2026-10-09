import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { isDesktopApp } from "../../lib/runtime";
import {
  CLOUD_SYNC_NOTIFY_EVENT,
  type CloudSyncNotifyDetail,
} from "../../lib/sync/sync-notify";
import { getCloudApiToken } from "../../lib/sync/cloud-config";

export function CloudSyncBanner() {
  const { user } = useAuth();
  const [notice, setNotice] = useState<CloudSyncNotifyDetail | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;

    const onNotify = (e: Event) => {
      const detail = (e as CustomEvent<CloudSyncNotifyDetail>).detail;
      if (!detail?.message) return;
      setNotice(detail);
    };

    window.addEventListener(CLOUD_SYNC_NOTIFY_EVENT, onNotify);
    return () => window.removeEventListener(CLOUD_SYNC_NOTIFY_EVENT, onNotify);
  }, []);

  if (!isDesktopApp() || !user || !getCloudApiToken() || !notice) return null;

  const isError = notice.kind === "error";
  const styles = isError
    ? "bg-red-50 border-red-200 text-red-900"
    : "bg-emerald-50 border-emerald-200 text-emerald-900";

  return (
    <div
      role="status"
      className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${styles}`}
    >
      {isError ? (
        <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden />
      ) : (
        <CheckCircle2 size={16} className="shrink-0 mt-0.5" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {isError ? "Sinkronisasi cloud gagal" : "Sinkronisasi cloud"}
        </p>
        <p className="mt-0.5 leading-relaxed opacity-90">{notice.message}</p>
        {notice.source && (
          <p className="mt-0.5 text-[10px] opacity-70">{notice.source}</p>
        )}
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        onClick={() => setNotice(null)}
        aria-label="Tutup pemberitahuan"
      >
        <X size={14} />
      </button>
    </div>
  );
}
