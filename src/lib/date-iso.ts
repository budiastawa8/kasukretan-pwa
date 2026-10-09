import { pad2 } from "./utils";

/** Tanggal lokal → ISO YYYY-MM-DD (untuk penyimpanan). */
export function dateToIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIsoDateString(iso?: string | null): string | null {
  const raw = iso?.trim() ?? "";
  if (!raw) return null;

  const head = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head)) {
    const [y, m, d] = head.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d
    ) {
      return head;
    }
  }

  const dm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(raw);
  if (dm) {
    return parseIsoDateString(
      `${dm[3]}-${pad2(dm[2])}-${pad2(dm[1])}`
    );
  }

  return null;
}

/** Normalisasi tanggal dari DB/form ke ISO untuk DateInput (kosong jika tidak valid). */
export function normalizeTanggalIsoForInput(raw?: string | null): string {
  return parseIsoDateString(raw) ?? "";
}

export function parseTanggalTerdaftarIso(raw?: string | null): string {
  const t = parseIsoDateString(raw);
  if (!t) throw new Error("Tanggal tidak valid (gunakan format dd/mm/yyyy)");
  return t;
}
