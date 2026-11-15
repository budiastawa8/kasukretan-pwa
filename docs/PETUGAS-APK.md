# APK Kasukretan Petugas

Shell Android (Capacitor) untuk petugas lapangan. Aplikasi memuat PWA live di WebView dan mencetak struk lewat Bluetooth native (**SPP klasik + BLE**).

## Alur yang benar

Petugas di project ini memakai **app staf PWA** dengan peran `petugas`:

1. Buka APK → **pilih server desa** (jika belum dipilih)
2. Login di `/login` (akun petugas lapangan di desa itu)
3. Langsung ke **`/pengumpulan`**

Route `/petugas` (modul legacy) sudah dihapus; akses lama dialihkan ke `/login`.

## Multi-desa (satu APK, banyak Vercel/Turso)

APK **tidak** mengunci satu database. Setiap desa punya proyek Vercel (+ Turso) sendiri; petugas memilih URL server di layar awal.

1. Tambah / pilih URL `https://nama-proyek.vercel.app`
2. WebView membuka PWA desa itu (login & sesi terpisah per origin)
3. Di layar login APK: **Ganti desa / server** kembali ke pemilih lokal

Daftar server disimpan di penyimpanan lokal shell (`localStorage` origin Capacitor). Jangan arahkan dua desa ke satu URL/Vercel yang sama.

Build tunggal-desa (tanpa pemilih), opsional:

```powershell
$env:PETUGAS_SERVER_URL = "https://proyek-desa.vercel.app"
npm run petugas:apk
```

## Prasyarat

- Node.js 20+
- **JDK 17 atau 21** untuk Gradle (JDK 25 tidak didukung Gradle 8.11 di template ini)
  - Set `JAVA_HOME` ke JDK tersebut sebelum `petugas:apk`
- [Android Studio](https://developer.android.com/studio) (SDK + platform tools)
- Variabel `ANDROID_HOME` / `ANDROID_SDK_ROOT` sudah di-set
- HP Android untuk sideload (izinkan *Install unknown apps*)
- Izin **Kamera** (scan QR) dan **Bluetooth** (cetak struk)

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

Default: **pemilih lokal** di `mobile/petugas/www` (tanpa `server.url` fixed).

Override build tunggal-desa: set `PETUGAS_SERVER_URL` sebelum sync/apk (lihat di atas).

Pastikan PWA yang di-deploy sudah berisi bridge Capacitor dan tombol **Ganti desa / server** di login.

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
3. Buka **Kasukretan Petugas** → pilih / tambah server desa → login akun **petugas lapangan**.
4. Anda masuk ke halaman **Pengumpulan** (sama seperti PWA di Chrome).
5. Saat cetak struk: tap ikon **Bluetooth** sekali.
6. Pilih printer (daftar perangkat yang sudah di-pair sistem, atau hasil scan).
7. Izinkan akses Bluetooth / Kamera jika diminta.
8. Tap **Cetak**.

Printer tersimpan di aplikasi; cetak berikutnya menyambung ulang otomatis (termasuk setelah printer sleep).

## Pairing printer

1. Di **Pengaturan Bluetooth HP**, pair printer thermal dulu (PIN biasanya `0000` / `1234`).
2. Di app, tap ikon Bluetooth pada layar struk.
3. Transport dipilih otomatis: coba **SPP** dulu, lalu **BLE**.

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| Halaman pilih desa terus muncul | Belum ada server aktif, atau dibuka lewat **Ganti desa / server** |
| Halaman fallback lama / kosong | Sync ulang APK; pastikan `www/index.html` pemilih ikut ter-bundle |
| Tidak bisa ganti desa dari login | Deploy PWA terbaru ke Vercel desa itu, lalu buka ulang login |
| “Izin Bluetooth” / kamera | Settings → Apps → Kasukretan Petugas → Permissions |
| SPP gagal, BLE OK | Normal untuk printer BLE-only |
| BLE gagal, “kanal tulis tidak dikenali” | Kemungkinan printer klasik SPP — pastikan sudah di-pair di sistem |
| Cetak terputus di tengah | App akan retry dengan chunk lebih kecil; nyalakan ulang printer bila perlu |
| Cadangan | Tombol PDF / dialog cetak browser tetap ada |

## Arsitektur singkat

- Pemilih server: aset lokal `mobile/petugas/www`
- UI & ESC/POS: PWA remote (`/login` → `/pengumpulan` → `/pengumpulan/struk`)
- Transport: plugin `ThermalPrinter` (Kotlin) di APK
- Browser Chrome tanpa APK: tetap memakai Web Bluetooth (BLE saja); tanpa pemilih server APK

## Di luar v1

- Signing release / Play Store
- iOS
- Bundle aset offline penuh
- Direktori pusat daftar desa (saat ini daftar diisi manual di HP)
