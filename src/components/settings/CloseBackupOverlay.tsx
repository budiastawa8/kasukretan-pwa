import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import {
  CLOSE_BACKUP_UI_EVENT,
  type CloseBackupUiDetail,
} from "../../lib/auto-backup";

/** Overlay progress saat backup penutupan aplikasi (tampil jika proses agak lama). */
export function CloseBackupOverlay() {
  const [ui, setUi] = useState<CloseBackupUiDetail>({
    visible: false,
    progress: null,
    label: "",
  });

  useEffect(() => {
    const onUi = (e: Event) => {
      const detail = (e as CustomEvent<CloseBackupUiDetail>).detail;
      if (detail) setUi(detail);
    };
    window.addEventListener(CLOSE_BACKUP_UI_EVENT, onUi);
    return () => window.removeEventListener(CLOSE_BACKUP_UI_EVENT, onUi);
  }, []);

  if (!ui.visible) return null;

  const pct = ui.progress == null ? null : Math.max(0, Math.min(100, ui.progress));

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-copper-950/55 backdrop-blur-[2px] print:hidden"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border border-copper-200 bg-white shadow-xl px-5 py-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-copper-100 p-2 text-copper-800">
            <Database size={20} aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-copper-900">Backup database</p>
            <p className="text-xs text-muted mt-0.5 leading-snug">
              {ui.label || "Menyimpan salinan database…"}
            </p>
          </div>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-copper-100">
          {pct == null ? (
            <div className="h-full w-1/3 rounded-full bg-copper-600 animate-[close-backup-indet_1.1s_ease-in-out_infinite]" />
          ) : (
            <div
              className="h-full rounded-full bg-copper-600 transition-[width] duration-200 ease-out"
              style={{ width: `${pct}%` }}
            />
          )}
        </div>

        {pct != null ? (
          <p className="text-[11px] text-muted text-right tabular-nums">{Math.round(pct)}%</p>
        ) : null}
      </div>

      <style>{`
        @keyframes close-backup-indet {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
}
