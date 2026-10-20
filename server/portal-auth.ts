import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { dbSelect } from "./db.js";
import { HttpError } from "./auth.js";

const SESSION_IDLE_SEC = 7 * 24 * 60 * 60;

export type PortalSessionUser = {
  kramaId: string;
  nomorKartu: string;
  kepalaNama: string;
  klasifikasiKode: string;
};

type PortalTokenPayload = PortalSessionUser & {
  typ: "portal";
  iat: number;
  exp: number;
};

function secret(): Buffer {
  const s = process.env.JWT_SECRET?.trim();
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET belum di-set atau kurang dari 32 karakter (npm run jwt:secret).");
  }
  return Buffer.from(s, "utf8");
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signPortalToken(user: PortalSessionUser): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: PortalTokenPayload = {
    typ: "portal",
    ...user,
    iat: now,
    exp: now + SESSION_IDLE_SEC,
  };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret()).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export function verifyPortalToken(token: string): PortalSessionUser | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = createHmac("sha256", secret()).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PortalTokenPayload;
    if (payload.typ !== "portal" || !payload.kramaId) return null;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      kramaId: String(payload.kramaId),
      nomorKartu: String(payload.nomorKartu ?? ""),
      kepalaNama: String(payload.kepalaNama ?? ""),
      klasifikasiKode: String(payload.klasifikasiKode ?? ""),
    };
  } catch {
    return null;
  }
}

type PortalLoginRow = {
  krama_id: string;
  nomor_kartu: string;
  kepala_nama: string;
  klasifikasi_kode: string;
  password_hash: string;
  aktif: number;
};

export async function portalLoginWithPin(
  nomorKartu: string,
  pin: string
): Promise<PortalSessionUser | null> {
  const kartu = nomorKartu.trim();
  const pinTrim = pin.trim();
  if (!kartu || !pinTrim) return null;

  const rows = (await dbSelect(
    `SELECT k.id AS krama_id, k.nomor_kartu, p.nama_lengkap AS kepala_nama,
            kk.kode AS klasifikasi_kode, kp.password_hash, kp.aktif
     FROM krama k
     JOIN krama_portal kp ON kp.krama_id = k.id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     WHERE k.nomor_kartu = ? AND k.status_krama = 'aktif'`,
    [kartu]
  )) as PortalLoginRow[];

  const row = rows[0];
  if (!row || Number(row.aktif) !== 1) {
    await bcrypt.compare(pinTrim, "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4mY7n4H4Y5r5Yp4bQ3G3tq6F2y1u");
    return null;
  }
  const ok = await bcrypt.compare(pinTrim, String(row.password_hash));
  if (!ok) return null;
  return {
    kramaId: String(row.krama_id),
    nomorKartu: String(row.nomor_kartu),
    kepalaNama: String(row.kepala_nama),
    klasifikasiKode: String(row.klasifikasi_kode),
  };
}

export function requirePortalAuth(req: { headers: { authorization?: string | string[] } }): PortalSessionUser {
  const header = String(req.headers.authorization ?? "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = token ? verifyPortalToken(token) : null;
  if (!user) throw new HttpError(401, "Sesi portal berakhir. Silakan masuk ulang.");
  return user;
}
