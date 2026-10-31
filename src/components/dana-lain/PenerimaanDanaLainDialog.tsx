import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import {
  PetugasLapanganSetorNote,
  SetorLangsungField,
  useSetorLangsung,
} from "../pembayaran/pembayaran-dialog-shared";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { formatTanggalLahir, today } from "../../lib/utils";
import {
  akunPembayaranOptionLabel,
  getDefaultAkunDanaKasukretanLainnyaId,
} from "../../lib/services/akun-keuangan";
import { listTimKasukretan } from "../../lib/services/master";
import {
  MITRA_JENIS_OPTIONS,
  SUMBER_TIPE_OPTIONS,
  createPenerimaanDanaLain,
  getPenerimaanDanaLain,
  hitungJumlahKerjasama,
  labelJenisPenerimaanDanaLain,
  listAkunForPenerimaanDanaLain,
  updatePenerimaanDanaLain,
} from "../../lib/services/penerimaan-dana-lain";
import { cariKramaPengumpulan, type PetugasLapangan } from "../../lib/services/pengumpulan";
import type {
  AkunKeuanganRow,
  PenerimaanDanaLainJenis,
  PenerimaanDanaLainSatuanWaktu,
  PenerimaanDanaLainSumberTipe,
  TimKasukretan,
} from "../../lib/types";
import "../../styles/pengumpulan-module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Untuk buat baru; diabaikan jika `editingId` diisi. */
  jenis: PenerimaanDanaLainJenis;
  /** Jika diisi, mode ubah (kantor). */
  editingId?: string | null;
  petugasLapangan?: PetugasLapangan | null;
  createdBy?: string | null;
  onSaved?: (info: { id: string; jumlah: number; sumberNama: string }) => void;
};

export function PenerimaanDanaLainDialog({
  open,
  onClose,
  jenis: jenisProp,
  editingId,
  petugasLapangan,
  createdBy,
  onSaved,
}: Props) {
  const isEdit = !!editingId;
  const isLapangan = !!petugasLapangan && !isEdit;
  const [disetorLangsung, setDisetorLangsung] = useSetorLangsung();
  const [jenis, setJenis] = useState<PenerimaanDanaLainJenis>(jenisProp);
  const [tanggal, setTanggal] = useState(today());
  const [jumlah, setJumlah] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [kegiatan, setKegiatan] = useState("");
  const [sumberTipe, setSumberTipe] = useState<PenerimaanDanaLainSumberTipe>("lainnya");
  const [sumberNama, setSumberNama] = useState("");
  const [kramaId, setKramaId] = useState<string | null>(null);
  const [kramaLabel, setKramaLabel] = useState("");
  const [cariQ, setCariQ] = useState("");
  const [cariHasil, setCariHasil] = useState<
    { id: string; kepala_nama: string; nomor_kartu: string; banjar_nama: string }[]
  >([]);
  const [cariBusy, setCariBusy] = useState(false);
  const [mitraJenis, setMitraJenis] = useState("");
  const [jumlahOrang, setJumlahOrang] = useState("");
  const [satuanWaktu, setSatuanWaktu] = useState<PenerimaanDanaLainSatuanWaktu>("hari");
  const [lama, setLama] = useState("");
  const [tarifSatuan, setTarifSatuan] = useState("");
  const [akunId, setAkunId] = useState("");
  const [akunList, setAkunList] = useState<AkunKeuanganRow[]>([]);
  const [petugasList, setPetugasList] = useState<TimKasukretan[]>([]);
  const [petugasId, setPetugasId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [error, setError] = useState("");

  const isKerjasama = jenis === "dana_kerjasama";
  const title = `${isEdit ? "Ubah" : ""} ${labelJenisPenerimaanDanaLain(jenis)}`.trim();

  const hitungOtomatis = useMemo(() => {
    if (!isKerjasama) return null;
    const n = hitungJumlahKerjasama({
      tarifSatuan: Number(tarifSatuan) || 0,
      jumlahOrang: Number(jumlahOrang) || 0,
      lama: Number(lama) || 0,
    });
    return n > 0 ? n : null;
  }, [isKerjasama, tarifSatuan, jumlahOrang, lama]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setCariQ("");
    setCariHasil([]);
    void (async () => {
      try {
        const [akun, def, tim] = await Promise.all([
          listAkunForPenerimaanDanaLain(),
          getDefaultAkunDanaKasukretanLainnyaId().catch(() => ""),
          isLapangan ? Promise.resolve([] as TimKasukretan[]) : listTimKasukretan(),
        ]);
        setAkunList(akun);
        setPetugasList(tim);

        if (editingId) {
          setLoadingEdit(true);
          const row = await getPenerimaanDanaLain(editingId);
          if (!row) throw new Error("Penerimaan tidak ditemukan");
          if (row.setoran_id) throw new Error("Sudah masuk setoran — batalkan setoran dulu untuk mengubah");
          setJenis(row.jenis);
          setTanggal(row.tanggal);
          setJumlah(String(row.jumlah));
          setKeterangan(row.keterangan || "");
          setKegiatan(row.kegiatan || "");
          setSumberTipe(row.sumber_tipe);
          setSumberNama(row.sumber_nama || "");
          setKramaId(row.krama_id || null);
          setKramaLabel(row.krama_id ? row.sumber_nama || "" : "");
          setMitraJenis(row.mitra_jenis || "");
          setJumlahOrang(row.jumlah_orang != null ? String(row.jumlah_orang) : "");
          setSatuanWaktu(row.satuan_waktu === "bulan" ? "bulan" : "hari");
          setLama(row.lama != null ? String(row.lama) : "");
          setTarifSatuan(row.tarif_satuan != null ? String(row.tarif_satuan) : "");
          setAkunId(row.akun_keuangan_id || def || akun[0]?.id || "");
          setPetugasId(row.petugas_id || "");
          setLoadingEdit(false);
          return;
        }

        setJenis(jenisProp);
        setTanggal(today());
        setJumlah("");
        setKeterangan("");
        setKegiatan("");
        setSumberTipe("lainnya");
        setSumberNama("");
        setKramaId(null);
        setKramaLabel("");
        setMitraJenis("");
        setJumlahOrang("");
        setSatuanWaktu("hari");
        setLama("");
        setTarifSatuan("");
        setAkunId(def || akun[0]?.id || "");
        setPetugasId(petugasLapangan?.id ?? tim[0]?.id ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat data");
        setLoadingEdit(false);
      }
    })();
  }, [open, petugasLapangan?.id, jenisProp, isLapangan, editingId]);

  async function cariKrama() {
    if (!petugasLapangan || cariQ.trim().length < 2) return;
    setCariBusy(true);
    setError("");
    try {
      const [rows, mipil] = await Promise.all([
        cariKramaPengumpulan(petugasLapangan, cariQ, "dudukan", 15),
        cariKramaPengumpulan(petugasLapangan, cariQ, "paturunan", 15),
      ]);
      const map = new Map<string, (typeof rows)[0]>();
      for (const r of [...mipil, ...rows]) map.set(r.id, r);
      setCariHasil(
        [...map.values()].map((r) => ({
          id: r.id,
          kepala_nama: r.kepala_nama,
          nomor_kartu: r.nomor_kartu,
          banjar_nama: r.banjar_nama,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencari krama");
    } finally {
      setCariBusy(false);
    }
  }

  async function simpan() {
    setBusy(true);
    setError("");
    try {
      const digits = jumlah.replace(/\D/g, "");
      const nominal = Number(digits) || (hitungOtomatis != null ? hitungOtomatis : 0);
      if (nominal <= 0) throw new Error("Jumlah harus lebih dari 0");
      const nama = sumberNama.trim() || kramaLabel.trim();
      if (!kramaId && !nama) throw new Error("Isi nama pemberi/mitra");

      const payload = {
        jenis,
        tanggal,
        jumlah: nominal,
        petugasId: isLapangan ? petugasLapangan!.id : petugasId || null,
        akunKeuanganId: akunId || null,
        keterangan,
        sumberTipe,
        kramaId,
        sumberNama: nama || null,
        kegiatan: kegiatan || null,
        mitraJenis: isKerjasama ? mitraJenis || null : null,
        jumlahOrang: isKerjasama && jumlahOrang ? Number(jumlahOrang) : null,
        satuanWaktu: isKerjasama ? satuanWaktu : null,
        lama: isKerjasama && lama ? Number(lama) : null,
        tarifSatuan: isKerjasama && tarifSatuan ? Number(tarifSatuan) : null,
      };

      let id = editingId || "";
      if (isEdit && editingId) {
        await updatePenerimaanDanaLain(editingId, payload);
      } else {
        id = await createPenerimaanDanaLain({
          ...payload,
          disetorLangsung: isLapangan ? false : disetorLangsung,
          createdBy: createdBy ?? null,
        });
      }
      onSaved?.({ id, jumlah: nominal, sumberNama: nama || "—" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      className="pengumpulan-module max-w-lg"
      onEnter={() => {
        if (!busy && !loadingEdit) void simpan();
      }}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="button" disabled={busy || loadingEdit} onClick={() => void simpan()}>
            {busy ? "Menyimpan…" : isEdit ? "Simpan perubahan" : `Simpan · ${formatTanggalLahir(tanggal)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {loadingEdit ? (
          <p className="text-sm text-muted">Memuat…</p>
        ) : (
          <>
            <p className="text-xs text-muted">
              {isKerjasama
                ? "Pendapatan kerjasama patroli/penjagaan. Tidak ada tagihan berulang."
                : "Pendapatan sukarela/insidental. Boleh tanpa kegiatan."}
            </p>

            {isEdit && (
              <div>
                <Label>Jenis</Label>
                <Select
                  value={jenis}
                  onChange={(e) => setJenis(e.target.value as PenerimaanDanaLainJenis)}
                >
                  <option value="punia_kasukretan">Punia Kasukretan</option>
                  <option value="dana_kerjasama">Dana Kerjasama Kasukretan</option>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tanggal</Label>
                <DateInput value={tanggal} onChange={setTanggal} required />
              </div>
              <div>
                <Label>Jumlah (Rp)</Label>
                <Input
                  inputMode="numeric"
                  value={jumlah}
                  onChange={(e) => setJumlah(e.target.value)}
                  placeholder={hitungOtomatis != null ? String(hitungOtomatis) : "0"}
                />
                {hitungOtomatis != null && (
                  <p className="text-[11px] text-muted mt-0.5">
                    Hitung: {formatRupiah(hitungOtomatis)}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Jenis sumber</Label>
              <Select
                value={sumberTipe}
                onChange={(e) => setSumberTipe(e.target.value as PenerimaanDanaLainSumberTipe)}
              >
                {SUMBER_TIPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label>Nama pemberi / mitra</Label>
              <Input
                value={sumberNama}
                onChange={(e) => {
                  setSumberNama(e.target.value);
                  if (kramaId) {
                    setKramaId(null);
                    setKramaLabel("");
                  }
                }}
                placeholder="Ketik nama, atau cari krama di bawah"
              />
              {kramaLabel && (
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Terpilih: {kramaLabel}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      setKramaId(null);
                      setKramaLabel("");
                    }}
                  >
                    lepas
                  </button>
                </p>
              )}
            </div>

            {isLapangan && (
              <div>
                <Label>Cari krama (opsional)</Label>
                <div className="flex gap-1.5">
                  <Input
                    value={cariQ}
                    onChange={(e) => setCariQ(e.target.value)}
                    placeholder="Nama / nomor kartu"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={cariBusy || cariQ.trim().length < 2}
                    onClick={() => void cariKrama()}
                  >
                    Cari
                  </Button>
                </div>
                {cariHasil.length > 0 && (
                  <ul className="mt-1 max-h-32 overflow-y-auto divide-y border rounded-md text-xs">
                    {cariHasil.map((k) => (
                      <li key={k.id}>
                        <button
                          type="button"
                          className="w-full text-left px-2 py-1.5 hover:bg-copper-50"
                          onClick={() => {
                            setKramaId(k.id);
                            setKramaLabel(`${k.kepala_nama} (${k.nomor_kartu})`);
                            setSumberNama(k.kepala_nama);
                            setCariHasil([]);
                            setCariQ("");
                          }}
                        >
                          <span className="font-medium">{k.kepala_nama}</span>
                          <span className="block text-muted">
                            {k.nomor_kartu} · Banjar {k.banjar_nama}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <Label>Kegiatan (opsional)</Label>
              <Input
                value={kegiatan}
                onChange={(e) => setKegiatan(e.target.value)}
                placeholder="Kosongkan jika ad-hoc"
              />
            </div>

            {isKerjasama && (
              <div className="space-y-2 rounded-md border border-copper-100 bg-copper-50/40 p-2">
                <p className="text-xs font-medium text-copper-950">Detail kerjasama (opsional)</p>
                <div>
                  <Label>Jenis mitra</Label>
                  <Select value={mitraJenis} onChange={(e) => setMitraJenis(e.target.value)}>
                    <option value="">—</option>
                    {MITRA_JENIS_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>Orang</Label>
                    <Input
                      inputMode="numeric"
                      value={jumlahOrang}
                      onChange={(e) => setJumlahOrang(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Lama</Label>
                    <Input
                      inputMode="decimal"
                      value={lama}
                      onChange={(e) => setLama(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Satuan</Label>
                    <Select
                      value={satuanWaktu}
                      onChange={(e) =>
                        setSatuanWaktu(e.target.value as PenerimaanDanaLainSatuanWaktu)
                      }
                    >
                      <option value="hari">Hari</option>
                      <option value="bulan">Bulan</option>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Tarif / orang / {satuanWaktu}</Label>
                  <Input
                    inputMode="numeric"
                    value={tarifSatuan}
                    onChange={(e) => setTarifSatuan(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Keterangan</Label>
              <Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
            </div>

            {akunList.length > 0 && (
              <div>
                <Label>Akun</Label>
                <Select value={akunId} onChange={(e) => setAkunId(e.target.value)} required>
                  {akunList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {akunPembayaranOptionLabel(a, akunList)}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {!isLapangan && (
              <>
                <div>
                  <Label>Petugas penerima</Label>
                  <Select value={petugasId} onChange={(e) => setPetugasId(e.target.value)}>
                    <option value="">— Tanpa petugas —</option>
                    {petugasList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama} ({p.jabatan})
                      </option>
                    ))}
                  </Select>
                </div>
                {!isEdit && (
                  <SetorLangsungField checked={disetorLangsung} onChange={setDisetorLangsung} />
                )}
              </>
            )}
            {isLapangan && <PetugasLapanganSetorNote />}
          </>
        )}

        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}
