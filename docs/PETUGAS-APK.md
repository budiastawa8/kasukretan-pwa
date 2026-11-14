# APK Kasukretan Petugas

Shell Android (Capacitor) untuk petugas lapangan. Aplikasi memuat PWA live di WebView dan mencetak struk lewat Bluetooth native (**SPP klasik + BLE**).

## Prasyarat

- Node.js 20+
- **JDK 17 atau 21** untuk Gradle (JDK 25 tidak didukung Gradle 8.11 di template ini)
  - Set `JAVA_HOME` ke JDK tersebut sebelum `petugas:apk`
- [Android Studio](https://developer.android.com/studio) (SDK + platform tools)
- Variabel `ANDROID_HOME` / `ANDROID_SDK_ROOT` sudah di-set
- HP Android untuk sideload (izinkan *Install unknown apps*)

## Instal dependency shell

```powershell
cd G:\BUDIAST\kasukretan-pwa\mobile\petugas
npm install
npm --prefix plugins\thermal-printer run build
npx cap sync android
```

Dari root repo:

```powershell
npm run petugas:sync
```

## URL server

Default: `https://kasukretan-pwa.vercel.app/petugas`

Override saat sync/build:

```powershell
$env:PETUGAS_SERVER_URL = "https://proyek-anda.vercel.app/petugas"
npm run petugas:sync
```

Pastikan PWA yang di-deploy sudah berisi bridge Capacitor (deploy setelah merge perubahan cetak native).

## Build debug APK

```powershell
npm run petugas:apk
```

Hasil: `mobile/petugas/android/app/build/outputs/apk/debug/app-debug.apk`

Atau buka Android Studio:

```powershell
npm run petugas:open
```

lalu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Pasang di HP petugas

1. Salin `app-debug.apk` ke HP.
2. Buka file → Install.
3. Buka **Kasukretan Petugas** → login petugas.
4. Saat cetak struk: tap ikon **Bluetooth** sekali.
5. Pilih printer (daftar perangkat yang sudah di-pair sistem, atau hasil scan).
6. Izinkan akses Bluetooth jika diminta.
7. Tap **Cetak**.

Printer tersimpan di aplikasi; cetak berikutnya menyambung ulang otomatis (termasuk setelah printer sleep).

## Pairing printer

1. Di **Pengaturan Bluetooth HP**, pair printer thermal dulu (PIN biasanya `0000` / `1234`).
2. Di app, tap ikon Bluetooth pada layar struk.
3. Transport dipilih otomatis: coba **SPP** dulu, lalu **BLE**.

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| Halaman fallback “Shell ini memuat…” | Internet / `server.url` salah |
| “Izin Bluetooth” | Settings → Apps → Kasukretan Petugas → Permissions |
| SPP gagal, BLE OK | Normal untuk printer BLE-only |
| BLE gagal, “kanal tulis tidak dikenali” | Kemungkinan printer klasik SPP — pastikan sudah di-pair di sistem |
| Cetak terputus di tengah | App akan retry dengan chunk lebih kecil; nyalakan ulang printer bila perlu |
| Cadangan | Tombol PDF / dialog cetak browser tetap ada |

## Arsitektur singkat

- UI & ESC/POS: PWA (`/petugas`, `buildEscPosReceipt`)
- Transport: plugin `ThermalPrinter` (Kotlin) di APK
- Browser Chrome tanpa APK: tetap memakai Web Bluetooth (BLE saja)

## Di luar v1

- Signing release / Play Store
- iOS
- Bundle aset offline penuh
