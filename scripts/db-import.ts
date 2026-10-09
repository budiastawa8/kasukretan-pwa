/**
 * Pindahkan database desktop (kasukretan.db) ke Turso / database target.
 *   npm run db:import -- "C:\path\kasukretan.db"          (target harus kosong)
 *   npm run db:import -- "C:\path\kasukretan.db" --force  (timpa isi target)
 */
import "./load-env.js";
import { existsSync, readFileSync } from "node:fs";
import { copyDatabase, countUserRows, dropAll, initSchema, openFile, openTarget } from "./lib/db-tools.js";

const args = process.argv.slice(2);
const force = args.includes("--force");
const file = args.find((a) => !a.startsWith("--"));

if (!file || !existsSync(file)) {
  console.error('Pemakaian: npm run db:import -- "path\\ke\\kasukretan.db" [--force]');
  process.exit(1);
}
if (readFileSync(file).subarray(0, 15).toString("latin1") !== "SQLite format 3") {
  console.error("Berkas bukan database SQLite.");
  process.exit(1);
}

const source = await openFile(file);
const { client: target, url } = await openTarget();
console.log(`[db] sumber: ${file}`);
console.log(`[db] target: ${url}`);

const existing = await countUserRows(target);
if (existing > 0 && !force) {
  console.error(
    `[db] Target sudah berisi ${existing} baris. Tambahkan --force untuk MENIMPA seluruh data target.`
  );
  process.exit(1);
}

await dropAll(target);
await copyDatabase(source, target);
await initSchema(target);
source.close();
target.close();
console.log("[db] impor selesai.");
