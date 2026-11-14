import type { CapacitorConfig } from "@capacitor/core";

/**
 * Root PWA (bukan /login). Jika sesi masih ada, router mengarahkan petugas ke /pengumpulan.
 * Override: $env:PETUGAS_SERVER_URL = "https://...."
 */
const SERVER_URL =
  process.env.PETUGAS_SERVER_URL?.trim() || "https://kasukretan-pwa.vercel.app";

const config: CapacitorConfig = {
  appId: "id.kasukretan.petugas",
  appName: "Kasukretan Petugas",
  webDir: "www",
  server: {
    url: SERVER_URL,
    cleartext: false,
    allowNavigation: [
      "https://kasukretan-pwa.vercel.app",
      "https://*.vercel.app",
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
