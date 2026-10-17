import { normalizeStatusKawinKode } from "../status-kawin";
import type { KkOcrMember } from "./types";

const NIK_RE = /\b(\d{16})\b/g;

type FieldKey =
  | "nik"
  | "nama"
  | "jenis_kelamin"
  | "lahir"
  | "agama"
  | "status_kawin"
  | "pekerjaan"
  | "hubungan"
  | "ayah"
  | "ibu";

/** Urutan penting: «nama ayah/ibu» harus sebelum alias «nama». */
const FIELD_ALIAS_ENTRIES: { key: FieldKey; aliases: string[] }[] = [
  { key: "nik", aliases: ["nik"] },
  { key: "ayah", aliases: ["nama ayah", "ayah"] },
  { key: "ibu", aliases: ["nama ibu", "ibu"] },
  { key: "nama", aliases: ["nama lengkap", "nama"] },
  { key: "jenis_kelamin", aliases: ["jenis kelamin", "kelamin"] },
  {
    key: "lahir",
    aliases: ["tempat/tgl lahir", "tempat tgl lahir", "tempat tanggal lahir", "ttl"],
  },
  { key: "agama", aliases: ["agama"] },
  {
    key: "status_kawin",
    aliases: ["status perkawinan", "perkawinan", "status kawin"],
  },
  { key: "pekerjaan", aliases: ["pekerjaan"] },
  {
    key: "hubungan",
    aliases: [
      "status hubungan dalam keluarga",
      "hubungan dalam keluarga",
      "status hubungan",
      "hubungan keluarga",
    ],
  },
];

function normKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanValue(raw: string): string {
  return raw
    .replace(/^[\s:.\-–—]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchFieldKey(label: string): FieldKey | null {
  const n = normKey(label);
  for (const { key, aliases } of FIELD_ALIAS_ENTRIES) {
    for (const a of aliases) {
      if (n === a) return key;
    }
  }
  // cocok awalan untuk label OCR yang kelebihan teks
  for (const { key, aliases } of FIELD_ALIAS_ENTRIES) {
    for (const a of aliases) {
      if (a.length >= 4 && (n.startsWith(a) || n.includes(` ${a}`))) {
        return key;
      }
    }
  }
  return null;
}

export function parseJenisKelaminKk(raw?: string | null): "L" | "P" | undefined {
  if (!raw?.trim()) return undefined;
  const s = normKey(raw).replace(/\s+/g, "");
  if (
    s.startsWith("l") ||
    s.includes("laki") ||
    s === "male" ||
    s === "m"
  ) {
    return "L";
  }
  if (
    s.startsWith("p") ||
    s.includes("perempuan") ||
    s.includes("wanita") ||
    s === "female" ||
    s === "f"
  ) {
    return "P";
  }
  return undefined;
}

/** Urai "DENPASAR, 01-02-1990" / "01/02/1990" → tempat + ISO. */
export function parseTempatTanggalLahir(raw?: string | null): {
  tempat_lahir?: string;
  tanggal_lahir?: string;
} {
  if (!raw?.trim()) return {};
  const text = cleanValue(raw);
  const m = text.match(
    /^(.*?)[, ]+(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*$/
  );
  if (m) {
    const tempat = cleanValue(m[1] ?? "");
    const d = Number(m[2]);
    const mo = Number(m[3]);
    let y = Number(m[4]);
    if (y < 100) y += y >= 50 ? 1900 : 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 1900 && y <= 2100) {
      return {
        tempat_lahir: tempat || undefined,
        tanggal_lahir: `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      };
    }
  }
  const onlyDate = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (onlyDate) {
    const d = Number(onlyDate[1]);
    const mo = Number(onlyDate[2]);
    let y = Number(onlyDate[3]);
    if (y < 100) y += y >= 50 ? 1900 : 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 1900 && y <= 2100) {
      return {
        tanggal_lahir: `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      };
    }
  }
  return { tempat_lahir: text || undefined };
}

export function parseAgamaKk(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const s = normKey(raw);
  if (s.includes("hindu")) return "Hindu";
  if (s.includes("islam") || s.includes("muslim")) return "Islam";
  if (s.includes("katholik") || s.includes("katolik") || s.includes("catholic")) {
    return "Katholik";
  }
  if (s.includes("kristen") || s.includes("protestan") || s.includes("christian")) {
    return "Kristen";
  }
  if (s.includes("budha") || s.includes("buddha")) return "Budha";
  if (s.includes("konghucu") || s.includes("khonghucu")) return "Konghucu";
  return cleanValue(raw);
}

function defaultSelected(hubungan?: string): boolean {
  if (!hubungan) return true;
  const s = normKey(hubungan);
  if (s.includes("pembantu") || s.includes("lainnya")) return false;
  return true;
}

type FieldBag = Partial<Record<FieldKey, string>>;

function bagToMember(bag: FieldBag): KkOcrMember | null {
  const nama = cleanValue(bag.nama ?? "");
  const nik = (bag.nik ?? "").replace(/\D/g, "").slice(0, 16);
  if (!nama && nik.length !== 16) return null;
  if (nama && /^(nama|nik|no|nomor)/i.test(nama) && nama.length < 8) return null;

  const lahir = parseTempatTanggalLahir(bag.lahir);
  const hubungan = bag.hubungan ? cleanValue(bag.hubungan) : undefined;
  const jk = parseJenisKelaminKk(bag.jenis_kelamin);

  return {
    nik: nik.length === 16 ? nik : undefined,
    nama_lengkap: nama || (nik.length === 16 ? `NIK ${nik}` : ""),
    jenis_kelamin: jk,
    tempat_lahir: lahir.tempat_lahir,
    tanggal_lahir: lahir.tanggal_lahir,
    agama: parseAgamaKk(bag.agama),
    status_kawin: normalizeStatusKawinKode(bag.status_kawin),
    pekerjaan: bag.pekerjaan ? cleanValue(bag.pekerjaan) : undefined,
    status_hubungan_kk: hubungan,
    nama_ayah: bag.ayah ? cleanValue(bag.ayah) : undefined,
    nama_ibu: bag.ibu ? cleanValue(bag.ibu) : undefined,
    selected: defaultSelected(hubungan),
  };
}

function flushBag(bag: FieldBag, out: KkOcrMember[]) {
  const m = bagToMember(bag);
  if (m && m.nama_lengkap.trim()) out.push(m);
}

/**
 * Urai teks OCR Kartu Keluarga menjadi daftar anggota.
 * Mendukung blok berlabel (Nama Lengkap :, NIK :, …) yang umum dari OCR.
 */
export function parseKkOcrText(text: string): KkOcrMember[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);

  const members: KkOcrMember[] = [];
  let bag: FieldBag = {};

  for (const line of lines) {
    const colon = line.match(/^(.{2,48}?)\s*[:：]\s*(.*)$/);
    if (colon) {
      const key = matchFieldKey(colon[1] ?? "");
      const val = cleanValue(colon[2] ?? "");
      if (key) {
        if (key === "nama" && bag.nama) {
          flushBag(bag, members);
          bag = {};
        }
        if (key === "nik" && bag.nik && bag.nama) {
          flushBag(bag, members);
          bag = {};
        }
        if (key === "nik") {
          const digits = val.replace(/\D/g, "");
          bag.nik = digits.slice(0, 16);
        } else {
          bag[key] = val;
        }
        continue;
      }
    }

    // Baris yang hanya berisi NIK 16 digit — mulailah anggota baru
    const onlyNik = line.replace(/\D/g, "");
    if (/^\d{16}$/.test(onlyNik) && !/nama/i.test(line)) {
      if (bag.nama || bag.nik) flushBag(bag, members);
      bag = { nik: onlyNik };
      continue;
    }

    // Cadangan: "NIK 5171… NAMA …"
    const inlineNik = [...line.matchAll(NIK_RE)];
    if (inlineNik.length === 1 && !matchFieldKey(line.split(":")[0] ?? "")) {
      const nik = inlineNik[0]![1]!;
      if (bag.nama || (bag.nik && bag.nik !== nik)) {
        flushBag(bag, members);
        bag = {};
      }
      bag.nik = nik;
    }
  }
  flushBag(bag, members);

  return dedupeMembers(members);
}

function dedupeMembers(list: KkOcrMember[]): KkOcrMember[] {
  const out: KkOcrMember[] = [];
  const seenNik = new Set<string>();
  const seenNama = new Set<string>();

  for (const m of list) {
    const nik = m.nik?.trim();
    const namaKey = normKey(m.nama_lengkap);
    if (nik && seenNik.has(nik)) continue;
    if (!nik && namaKey && seenNama.has(namaKey)) continue;
    if (nik) seenNik.add(nik);
    if (namaKey) seenNama.add(namaKey);
    out.push(m);
  }
  return out;
}
