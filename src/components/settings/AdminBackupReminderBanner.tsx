import { useEffect, useState } from "react";
import { Database } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { isAdmin } from "../../lib/auth-roles";
import {
  BACKUP_REMINDER_SNOOZE_DAYS,
  BACKUP_REMINDER_UPDATED_EVENT,
  shouldShowBackupReminder,
  snoozeBackupReminder,
} from "../../lib/backup-reminder";
import { settingsPath } from "../../lib/settings-routes";

export function AdminBackupReminderBanner() {
  const { user } = useAuth();
  const admin = isAdmin(user?.peran);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!admin) {
      setVisible(false);
      return;
    }
    const refresh = () => setVisible(shouldShowBackupReminder());
    refresh();
    window.addEventListener(BACKUP_REMINDER_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(BACKUP_REMINDER_UPDATED_EVENT, refresh);
  }, [admin]);

  if (!admin || !visible) return null;

  return (
    <div
      role="status"
      className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
    >
      <div className="flex items-start gap-2">
        <Database size={16} className="shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Pengingat backup bulanan</p>
          <p className="mt-0.5 leading-relaxed opacity-90">
            Unduh salinan database desa dan simpan di tempat aman. Disarankan dilakukan setiap bulan.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              to={settingsPath("database")}
              className="inline-flex items-center rounded-md bg-amber-900 px-2.5 py-1 text-[11px] font-medium text-amber-50 hover:bg-amber-800"
            >
              Backup sekarang
            </Link>
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-amber-300 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-amber-950 hover:bg-white"
              onClick={() => {
                snoozeBackupReminder();
                setVisible(false);
              }}
            >
              Nanti ({BACKUP_REMINDER_SNOOZE_DAYS} hari)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
