# Desktop Electron bridges

Modul di folder ini menggantikan API desktop lama. Semua komunikasi ke main process lewat `window.kasukretanElectron` (`electron/preload.cjs`).

| File | Peran |
|------|--------|
| `core.ts` | `invoke`, `isDesktopShell` |
| `sql.ts` | SQLite IPC |
| `dialog.ts` | Buka / simpan berkas |
| `fs.ts` | Baca / tulis bytes |
| `opener.ts` | `openUrl` |
| `window.ts` | Close-requested / destroy |
