import { formatCloudFetchError } from "./cloud-config";

export const CLOUD_SYNC_NOTIFY_EVENT = "kasukretan_cloud_sync_notify";

export type CloudSyncNotifyDetail = {
  kind: "error" | "success";
  message: string;
  source?: string;
};

export function formatSyncError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return formatCloudFetchError(e);
  if (typeof e === "string" && e.trim()) return formatCloudFetchError(e);
  return "Sinkronisasi cloud gagal";
}

export function notifyCloudSync(detail: CloudSyncNotifyDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CloudSyncNotifyDetail>(CLOUD_SYNC_NOTIFY_EVENT, { detail })
  );
}
