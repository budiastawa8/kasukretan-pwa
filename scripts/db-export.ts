/**
 * Unduh database cloud menjadi kasukretan.db (bisa di-restore di aplikasi desktop).
 *   npm run db:export                       → backup/kasukretan-YYYY-MM-DD.db
 *   npm run db:export -- "D:\backup\x.db"
 */
import "./load-env.js";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { copyDatabase, openFile, openTarget } from "./lib/db-tools.js";

const arg = process.argv.slice(2).find((a) => !a.startsWith("--"));
const out = resolve(arg ?? `backup/kasukretan-${new Date().toISOString().slice(0, 10)}.db`);

if (existsSync(out)) {
  if (!process.argv.includes("--force")) {
    console.error(`[db] ${out} sudah ada. Tambahkan --force untuk menimpa.`);
    process.exit(1);
  }
  rmSync(out);
}
mkdirSync(dirname(out), { recursive: true });

const { client: source, url } = await openTarget();
const target = await openFile(out);
console.log(`[db] sumber: ${url}`);
console.log(`[db] tujuan: ${out}`);
await copyDatabase(source, target);
source.close();
target.close();
console.log("[db] ekspor selesai.");
