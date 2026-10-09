# Lisensi Kasukretan (offline + tanda tangan digital)

## Ringkasan

| Komponen | Model | Cakupan |
|----------|-------|---------|
| **Desktop** | Sekali bayar permanen, atau trial vendor (`--days`) | Semua modul offline, 2 mesin per desa, satu kode |
| **Trial lokal** | Otomatis 30 hari di PC baru (tanpa kode) | Semua modul offline; aktivasi kapan saja |
| **Modul cloud** | Langganan bulanan (token `KSKC2`) | Sync API, petugas HP, portal krama |

Validasi di **Rust**; build **release** memakai trial lokal lalu wajib kode desktop; **debug** (`tauri dev`) dilewati.

Grace period cloud: **7 hari** setelah `expires_at` sebelum fitur online terkunci.

## Alur vendor — lisensi desktop

1. **Buat keypair produksi** (sekali):

   ```bash
   npm run license:gen -- keygen
   ```

   Salin `LICENSE_PUBLIC_KEY` ke `src-tauri/src/license/mod.rs`. Private key di `src-tauri/.license-keys/private.hex` (jangan di-commit).

2. **Terbitkan kode desktop** (cukup kode desa — tanpa fingerprint):

   ```bash
   npm run license:issue
   ```

   Skrip interaktif meminta kode desa (4 digit).

   Non-interaktif (PowerShell):

   ```powershell
   .\scripts\issue-license.ps1 -DesaKode 0567
   .\scripts\issue-license.ps1 -DesaKode 0567 -Days 30
   ```

   Trial vendor (CLI langsung):

   ```bash
   npm run license:gen -- issue --desa-kode 0567 --days 30
   ```

   Mesin kedua desa yang sama: **kode yang sama**. Aplikasi mencatat fingerprint lokal (maks. 2).

3. Kirim string `KSK2.<payload>.<signature>` ke pembeli.

## Alur vendor — langganan cloud

Setelah desktop aktif, pembeli mengisi kode cloud di **Pengaturan → Modul Online**.

1. Catat **kode desa** (4 digit) dari lisensi desktop pembeli.

2. Terbitkan kode langganan:

   ```bash
   npm run license:cloud
   ```

   Interaktif, atau:

   ```powershell
   .\scripts\issue-cloud-license.ps1 -DesaKode 0567 -Months 1
   ```

   CLI langsung:

   ```bash
   npm run license:gen -- issue-cloud --desa-kode 0567 --months 1
   npm run license:gen -- issue-cloud --desa-kode 0567 --expires-at 1735689600
   ```

3. Kirim string `KSKC2.<payload>.<signature>` ke pembeli.

Perpanjangan: terbitkan kode baru — aplikasi memakai tanggal kedaluwarsa yang lebih akhir.

## Panel vendor (lokal)

UI internal di folder `vendor/` — jalankan `npm run vendor:dev` di root proyek.  
Lihat [vendor/README.md](../vendor/README.md).

### Baca ulang isi kode

```bash
npm run license:decode -- --code "KSK2...."
```

Menampilkan isi payload setelah verifikasi tanda tangan.

## Uji lokal (developer)

```bash
npm run license:gen -- issue-local --desa-kode 0567
```

Pastikan `LICENSE_PUBLIC_KEY` di `mod.rs` cocok dengan private key di `.license-keys/`.

## Format token

**Desktop:** `KSK2.<payload_base64url>.<signature_base64url>`

Payload biner:

| Panjang | Isi |
|---------|-----|
| **4 byte** (baru / permanen) | Offset 0–3: kode desa |
| **12 byte** (baru / trial vendor) | Offset 0–3: kode desa · 4–11: `expires_at` unix detik (u64 BE) |
| **20 byte** (lama / permanen) | Offset 0–3: kode desa · 4–19: fingerprint |
| **28 byte** (lama / trial) | Offset 0–3: kode desa · 4–19: fingerprint · 20–27: `expires_at` |

`expires_at = 0` atau payload tanpa timestamp = lisensi permanen. Token lama ber-fingerprint tetap diterima.

**Cloud:** `KSKC2.<payload_base64url>.<signature_base64url>`

Payload biner (12 byte):

| Offset | Isi |
|--------|-----|
| 0–3 | Kode desa adat (4 digit ASCII) |
| 4–11 | `expires_at` unix detik (u64 big-endian) |

## Penyimpanan

| File | Isi |
|------|-----|
| `trial.json` | Trial lokal 30 hari (per PC, sebelum aktivasi) |
| `license.json` | Lisensi desktop (AppConfig Tauri) |
| `cloud-subscription.json` | Langganan cloud aktif |

Maks. 2 fingerprint tercatat di `license.json` per PC. Satu kode desa dipakai di kedua mesin.

## Modul cloud di aplikasi

Fitur online aktif jika langganan `KSKC2` masih berlaku (+ grace 7 hari).

UI: **Pengaturan → tab Modul Online**. Di dev build selalu tersedia (kecuali `VITE_ENABLE_ONLINE=false`).
