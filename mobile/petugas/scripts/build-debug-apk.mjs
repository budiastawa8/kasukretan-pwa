import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = join(root, "android");
const gradlew = join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");

function javaMajorVersion() {
  const r = spawnSync("java", ["-version"], { encoding: "utf8", shell: true });
  const text = `${r.stderr || ""}\n${r.stdout || ""}`;
  const m = text.match(/version "(\d+)(?:\.\d+)?/);
  if (!m) return null;
  const major = Number(m[1]);
  // Legacy "1.8.0_..." → treat as 8
  return major === 1 ? 8 : major;
}

if (!existsSync(gradlew)) {
  console.error(
    "Folder android belum ada. Jalankan dulu: npm install && npx cap add android && npx cap sync android"
  );
  process.exit(1);
}

const major = javaMajorVersion();
if (major == null) {
  console.error("Java tidak ditemukan di PATH / JAVA_HOME.");
  process.exit(1);
}
if (major < 17 || major > 21) {
  console.error(
    `Gradle Android butuh JDK 17 atau 21 (terdeteksi major ${major}).\n` +
      `Set JAVA_HOME ke Temurin/Oracle JDK 21, lalu ulangi.\n` +
      `Contoh: $env:JAVA_HOME = "C:\\Program Files\\Eclipse Adoptium\\jdk-21..."` +
      `\nLihat docs/PETUGAS-APK.md.`
  );
  process.exit(1);
}

console.log("→ cap sync android");
const sync = spawnSync("npx", ["cap", "sync", "android"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (sync.status !== 0) process.exit(sync.status ?? 1);

console.log("→ assembleDebug");
const build = spawnSync(gradlew, ["assembleDebug"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const apk = join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
console.log(`\nAPK siap: ${apk}`);
