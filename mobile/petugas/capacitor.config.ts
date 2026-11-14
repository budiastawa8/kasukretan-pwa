import type { CapacitorConfig } from "@capacitor/core";

/** Login staf PWA — peran petugas diarahkan ke /pengumpulan (bukan /petugas legacy). */
const SERVER_URL =
  process.env.PETUGAS_SERVER_URL?.trim() || "https://kasukretan-pwa.vercel.app/login";

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
