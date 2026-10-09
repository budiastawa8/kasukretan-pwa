/**
 * API lokal untuk `npm run dev` — sama dengan fungsi Vercel (api/index.ts).
 * Vite mem-proxy /api ke port ini.
 */
import "./load-env.js";
import { createServer } from "node:http";
import { handleApi } from "../server/handler.js";

const PORT = Number(process.env.API_PORT ?? 3001);

createServer((req, res) => {
  void handleApi(req, res);
}).listen(PORT, () => {
  console.log(`[api] http://localhost:${PORT}/api/health  (DB: ${process.env.TURSO_DATABASE_URL})`);
});
