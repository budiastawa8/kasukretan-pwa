import { collectPetugasAkunForSync } from "../services/petugas-akun";
import { cloudFetch, fetchCloudApiHealth } from "./cloud-config";

const MIN_API_VERSION = "0.5.1";

type PetugasPushResult = { upserted: number; errors: string[] };

function deployPetugasSyncHint(cloudVersion?: string): string {
  const detected = cloudVersion ? ` (terdeteksi v${cloudVersion})` : "";
  return (
    `API cloud${detected} belum mendukung sinkron akun petugas (butuh v${MIN_API_VERSION}+). ` +
    "Push kode terbaru ke GitHub agar Render rebuild, lalu jalankan migrasi: npm run db:migrate --prefix api"
  );
}

async function assertPetugasSyncSupported(): Promise<void> {
  const health = await fetchCloudApiHealth();
  if (health.features?.petugasUsersSync) return;
  throw new Error(deployPetugasSyncHint(health.version));
}

function parsePetugasPushResult(
  result: Record<string, unknown>,
  cloudVersion?: string
): PetugasPushResult {
  const fromCatalog = result.petugasUsers as PetugasPushResult | undefined;
  if (fromCatalog && typeof fromCatalog.upserted === "number") {
    return fromCatalog;
  }
  const direct = result as Partial<PetugasPushResult>;
  if (typeof direct.upserted === "number") {
    return {
      upserted: direct.upserted,
      errors: direct.errors ?? [],
    };
  }
  throw new Error(deployPetugasSyncHint(cloudVersion));
}

export async function pushPetugasAkunToCloud() {
  const accounts = await collectPetugasAkunForSync();
  if (accounts.length === 0) {
    throw new Error(
      "Belum ada akun petugas di desktop — tambahkan di Pengaturan → tab Modul Online → Akun petugas lapangan."
    );
  }

  const health = await fetchCloudApiHealth();
  await assertPetugasSyncSupported();

  try {
    const viaCatalog = await cloudFetch<{ ok: boolean; result: Record<string, unknown> }>(
      "/sync/catalog/push",
      {
        method: "POST",
        body: JSON.stringify({ petugasUsers: accounts }),
      }
    );
    return { ok: true, result: parsePetugasPushResult(viaCatalog.result, health.version) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("Not found") && !msg.includes("404")) {
      throw e;
    }
  }

  const viaDedicated = await cloudFetch<{ ok: boolean; result: PetugasPushResult }>(
    "/sync/petugas-users/push",
    {
      method: "POST",
      body: JSON.stringify({ accounts }),
    }
  );
  return viaDedicated;
}
