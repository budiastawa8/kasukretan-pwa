import { buildBuktiSetoranPdfBytes, namaFileBuktiSetoran } from "./bukti-setoran-petugas-pdf";
import { downloadBytes } from "./download-bytes";
import { getDesaAdatWithMedia } from "./services/desa";
import { listPembayaranDalamSetoran, type SetoranRow } from "./services/setoran";

export async function unduhBuktiSetoran(
  setoran: SetoranRow,
  opts?: { petugasJabatan?: string | null }
): Promise<void> {
  const [items, desa] = await Promise.all([listPembayaranDalamSetoran(setoran.id), getDesaAdatWithMedia()]);
  const bytes = await buildBuktiSetoranPdfBytes({
    setoran,
    items,
    desa,
    petugasJabatan: opts?.petugasJabatan,
  });
  await downloadBytes(bytes, namaFileBuktiSetoran(setoran), "application/pdf");
}
