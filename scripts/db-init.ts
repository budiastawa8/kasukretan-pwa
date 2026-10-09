/**
 * Siapkan / perbarui skema database (Turso atau file lokal) — aman diulang.
 *   npm run db:init
 */
import "./load-env.js";
import { initSchema, openTarget } from "./lib/db-tools.js";

const { client, url } = await openTarget();
console.log(`[db] target: ${url}`);
await initSchema(client);
client.close();
console.log("[db] selesai.");
