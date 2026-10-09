import "./load-env.js";
import { countUserRows, openTarget } from "./lib/db-tools.js";

const { client, url } = await openTarget();
console.log("[turso] url:", url.replace(/\/\/[^@]+@/, "//***@"));
const ping = await client.execute("SELECT 1 AS ok");
console.log("[turso] ping:", ping.rows[0]?.[0] === 1 ? "ok" : ping.rows);
const rows = await countUserRows(client);
console.log("[turso] total baris (semua tabel):", rows);
client.close();
