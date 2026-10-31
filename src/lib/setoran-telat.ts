/**
 * Pengingat setoran: uang di tangan petugas lebih dari sehari (tanggal tertua < hari ini).
 */

import { parseIsoDateString } from "./date-iso";
import type { UangBelumDisetorPetugas } from "./services/setoran";
import { formatRupiah } from "./dudukan-hitung";
import { formatTanggalLahir, pad2, today } from "./utils";
import { buildSetoranTelatWhatsAppMessageFromTemplate } from "./whatsapp-template";

const SNOOZE_KEY = "kasukretan.setoran_telat_snooze.v1";
const NOTIF_SENT_KEY = "kasukretan.setoran_telat_notif.v1";
export const SETORAN_TELAT_UPDATED_EVENT = "kasukretan:setoran-telat-updated";

/** Selisih hari kalender (tanggal ISO → hari ini). */
export function hariSejakTanggal(tanggalIso: string, nowIso: string = today()): number | null {
  const a = parseIsoDateString(tanggalIso);
  const b = parseIsoDateString(nowIso);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const t0 = Date.UTC(ay, am - 1, ad);
  const t1 = Date.UTC(by, bm - 1, bd);
  return Math.floor((t1 - t0) / (24 * 60 * 60 * 1000));
}

/** True bila tanggal bayar tertua sudah lewat hari kalender berjalan (≥ 1 hari di tangan). */
export function isSetoranTelat(tanggalTertua: string, nowIso: string = today()): boolean {
  const hari = hariSejakTanggal(tanggalTertua, nowIso);
  return hari != null && hari >= 1;
}

export function filterSetoranTelat(
  rows: UangBelumDisetorPetugas[],
  nowIso: string = today()
): UangBelumDisetorPetugas[] {
  return rows.filter((r) => r.petugas_id && isSetoranTelat(r.tanggal_tertua, nowIso));
}

export function ringkasanTeksSetoranTelat(row: UangBelumDisetorPetugas): string {
  const hari = hariSejakTanggal(row.tanggal_tertua) ?? 0;
  const sejak = formatTanggalLahir(row.tanggal_tertua);
  return `${formatRupiah(row.total)} · ${row.jumlah_transaksi} transaksi · sejak ${sejak} (${hari} hari)`;
}

export function buildPesanWhatsAppSetoranTelat(row: UangBelumDisetorPetugas): string {
  const hari = hariSejakTanggal(row.tanggal_tertua) ?? 0;
  return buildSetoranTelatWhatsAppMessageFromTemplate({
    nama: row.petugas_nama,
    total: row.total,
    jumlahTransaksi: row.jumlah_transaksi,
    tanggalTertua: formatTanggalLahir(row.tanggal_tertua),
    hari,
  });
}

type SnoozeMap = Record<string, string>;

function readSnoozeMap(): SnoozeMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSnoozeMap(map: SnoozeMap): void {
  localStorage.setItem(SNOOZE_KEY, JSON.stringify(map));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SETORAN_TELAT_UPDATED_EVENT));
  }
}

function snoozeKey(petugasId: string | null | undefined, scope: "petugas" | "bendahara"): string {
  return `${scope}:${petugasId ?? "all"}`;
}

export function isSetoranTelatSnoozed(
  petugasId: string | null | undefined,
  scope: "petugas" | "bendahara",
  nowIso: string = today()
): boolean {
  const until = readSnoozeMap()[snoozeKey(petugasId, scope)];
  return Boolean(until && nowIso < until);
}

export function snoozeSetoranTelat(
  petugasId: string | null | undefined,
  scope: "petugas" | "bendahara",
  days = 1
): void {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const until = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const map = readSnoozeMap();
  map[snoozeKey(petugasId, scope)] = until;
  writeSnoozeMap(map);
}

/** Dedup notifikasi sistem: sekali per petugas per hari. */
export function shouldSendSetoranTelatNotif(
  petugasId: string,
  nowIso: string = today()
): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    const raw = localStorage.getItem(NOTIF_SENT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    return map[petugasId] !== nowIso;
  } catch {
    return true;
  }
}

export function markSetoranTelatNotifSent(petugasId: string, nowIso: string = today()): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(NOTIF_SENT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[petugasId] = nowIso;
    localStorage.setItem(NOTIF_SENT_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
