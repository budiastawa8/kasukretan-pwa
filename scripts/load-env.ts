import { existsSync } from "node:fs";
import { config } from "dotenv";

// --env=.env.turso menang atas .env.local, yang menang atas .env
const envArg = process.argv.find((a) => a.startsWith("--env="));
if (envArg) {
  const file = envArg.slice("--env=".length);
  if (!existsSync(file)) {
    console.error(`[env] berkas ${file} tidak ditemukan.`);
    process.exit(1);
  }
  config({ path: file });
}
config({ path: ".env.local" });
config({ path: ".env" });
