import { collectPortalAccountsForSync } from "../services/krama-portal";
import { cloudFetch } from "./cloud-config";

export async function pushPortalToCloud() {
  const accounts = await collectPortalAccountsForSync();
  return cloudFetch<{
    ok: boolean;
    result: { upserted: number; errors: string[] };
  }>("/sync/portal/push", {
    method: "POST",
    body: JSON.stringify({ accounts }),
  });
}
