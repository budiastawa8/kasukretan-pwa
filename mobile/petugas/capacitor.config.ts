import type { CapacitorConfig } from "@capacitor/core";

/**
 * Shell lokal (`www`) menampilkan pemilih server desa.
 * Setelah dipilih, WebView navigasi ke URL Vercel desa (lihat allowNavigation).
 *
 * Override bootstrap (opsional, build tunggal-desa lama):
 *   $env:PETUGAS_SERVER_URL = "https://...."
 * Jika di-set, app langsung memuat URL itu tanpa pemilih lokal.
 */
const SERVER_URL = process.env.PETUGAS_SERVER_URL?.trim() || "";

const config: CapacitorConfig = {
  appId: "id.kasukretan.petugas",
  appName: "Kasukretan Petugas",
  webDir: "www",
  server: {
    ...(SERVER_URL ? { url: SERVER_URL } : {}),
    cleartext: false,
    allowNavigation: [
      "https://*.vercel.app",
      "https://kasukretan-pwa.vercel.app",
      "http://localhost",
      "https://localhost",
    ],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#faf3eb",
  },
  plugins: {
    StatusBar: {
      style: "DARK",
      backgroundColor: "#3d2310",
    },
  },
};

export default config;
