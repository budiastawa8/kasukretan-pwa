import { useEffect, useState } from "react";

import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";

import { FileText } from "lucide-react";

import { Modal } from "../ui/Modal";

import { Button } from "../ui/Button";

import { Input, Label, Select } from "../ui/Input";

import { getDesaAdat } from "../../lib/services/desa";

import {

  defaultAnggotaId,

  issueSuratKeteranganKrama,

} from "../../lib/services/surat-keterangan-krama";

import { stashSuratKeteranganKramaPreview } from "../../lib/laporan-pdf-preview";

import { buildSuratKeteranganKramaPdfPayload } from "../../lib/surat-keterangan-krama-pdf";

import type { KramaDetail } from "../../lib/types";

import { today } from "../../lib/utils";



type Props = {

  open: boolean;

  onClose: () => void;

  krama: KramaDetail;

};



export function SuratKeteranganKramaDialog({ open, onClose, krama }: Props) {

  const openPdf = useLaporanPdfNavigate();

  const [anggotaId, setAnggotaId] = useState("");

  const [tanggalTerbit, setTanggalTerbit] = useState(today());

  const [tujuan, setTujuan] = useState("");

  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(true);

  const [hasTtdImage, setHasTtdImage] = useState(false);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");



  useEffect(() => {

    if (!open) return;

    setAnggotaId(defaultAnggotaId(krama));

    setTanggalTerbit(today());

    setTujuan("");

    setError("");

    void getDesaAdat().then((desa) => {

      const has = !!desa?.bandesa_ttd_url?.trim();

      setHasTtdImage(has);

      setTampilkanTtdBandesa(has);

    });

  }, [open, krama.id]);



  async function handleSubmit(e: React.FormEvent) {

    e.preventDefault();

    setBusy(true);

    setError("");

    try {

      const desa = await getDesaAdat();

      if (!desa) throw new Error("Data desa adat belum ada.");

      const { surat } = await issueSuratKeteranganKrama(krama.id, {

        anggotaId,

        tanggalTerbit,

        tujuan,

        tampilkanTtdBandesa: hasTtdImage ? tampilkanTtdBandesa : false,

      });

      const payload = buildSuratKeteranganKramaPdfPayload(desa, surat);

      openPdf((backTo) =>
        stashSuratKeteranganKramaPreview([payload], backTo, "Kembali ke detail krama")
      );

      onClose();

    } catch (err) {

      const msg = err instanceof Error ? err.message : String(err);

      setError(msg);

    } finally {

      setBusy(false);

    }

  }



  return (

    <Modal open={open} title="Surat Keterangan Krama" onClose={onClose} className="max-w-lg">

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">

        <p className="text-sm text-muted">

          Terbitkan surat keterangan untuk anggota krama ({krama.nomor_kartu}). Setiap penerbitan

          mendapat nomor SKK baru.

        </p>

        <div>

          <Label>Anggota krama</Label>

          <Select

            value={anggotaId}

            onChange={(e) => setAnggotaId(e.target.value)}

            disabled={busy || !krama.anggota_aktif.length}

            required

          >

            {krama.anggota_aktif.map((a) => (

              <option key={a.anggota_id} value={a.anggota_id}>

                {a.nama_lengkap}

                {a.status_keluarga ? ` (${a.status_keluarga})` : ""}

              </option>

            ))}

          </Select>

        </div>

        <div>

          <Label>Tanggal terbit</Label>

          <Input

            type="date"

            value={tanggalTerbit}

            onChange={(e) => setTanggalTerbit(e.target.value)}

            disabled={busy}

            required

          />

        </div>

        <div>

          <Label>Tujuan surat</Label>

          <Input

            value={tujuan}

            onChange={(e) => setTujuan(e.target.value)}

            placeholder="Contoh: Pengajuan pinjaman bank"

            disabled={busy}

            required

          />

        </div>

        <div className="space-y-1">

          <label className="flex items-center gap-2 text-sm text-copper-900 cursor-pointer">

            <input

              type="checkbox"

              className="rounded border-copper-300"

              checked={tampilkanTtdBandesa}

              onChange={(e) => setTampilkanTtdBandesa(e.target.checked)}

              disabled={busy || !hasTtdImage}

            />

            Tampilkan tanda tangan Bandesa

          </label>

          {!hasTtdImage && (

            <p className="text-[11px] text-copper-600">

              Unggah gambar TTD Bandesa di Master Data → Profil Desa Adat.

            </p>

          )}

        </div>

        {error && (

          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">

            {error}

          </p>

        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">

          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>

            Batal

          </Button>

          <Button type="submit" icon={FileText} disabled={busy}>

            {busy ? "Menerbitkan…" : "Terbitkan & pratinjau"}

          </Button>

        </div>

      </form>

    </Modal>

  );

}


