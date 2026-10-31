import { ingatPetugasSetorViaFonnte } from "./api/setoran-ingat";
import type { UangBelumDisetorPetugas } from "./services/setoran";
import { buildPesanWhatsAppSetoranTelat } from "./setoran-telat";
import { hasWhatsAppContact, openWhatsAppChat } from "./whatsapp";

export type IngatSetorOutcome =
  | { mode: "fonnte"; petugas_nama: string }
  | { mode: "whatsapp_web" }
  | { mode: "error"; message: string };

/**
 * Coba Fonnte dulu; jika belum dikonfigurasi (503) buka WhatsApp Web sebagai cadangan.
 */
export async function ingatPetugasSetor(row: UangBelumDisetorPetugas): Promise<IngatSetorOutcome> {
  if (!row.petugas_id) {
    return { mode: "error", message: "Petugas tidak valid." };
  }
  if (!hasWhatsAppContact(row.petugas_nomor_kontak)) {
    return {
      mode: "error",
      message: "Nomor kontak petugas belum diisi. Lengkapi di Master → Tim Kasukretan.",
    };
  }

  try {
    const res = await ingatPetugasSetorViaFonnte(row.petugas_id);
    return { mode: "fonnte", petugas_nama: res.petugas_nama };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const belumFonnte =
      /FONNTE_TOKEN|belum dikonfigurasi|503/i.test(msg) ||
      msg.toLowerCase().includes("fonnte belum");
    if (belumFonnte) {
      const opened = await openWhatsAppChat(
        row.petugas_nomor_kontak!,
        buildPesanWhatsAppSetoranTelat(row)
      );
      if (opened) return { mode: "whatsapp_web" };
      return { mode: "error", message: "Gagal membuka WhatsApp." };
    }
    return { mode: "error", message: msg };
  }
}

export function labelTombolIngatSetor(busy: boolean): string {
  return busy ? "Mengirim…" : "Ingatkan setor";
}
