import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  HandCoins,
  MessageCircle,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { unduhBuktiSetoran } from "../../lib/bukti-setoran-petugas-unduh";
import {
  batalkanSetoran,
  listPembayaranBelumDisetor,
  listPembayaranDalamSetoran,
  listSetoran,
  listUangBelumDisetorPerPetugas,
  terimaSetoran,
  type PembayaranSetoranItem,
  type SetoranRow,
  type UangBelumDisetorPetugas,
} from "../../lib/services/setoran";
import { formatRupiah } from "../../lib/dudukan-hitung";
import {
  buildPesanWhatsAppSetoranTelat,
  isSetoranTelat,
} from "../../lib/setoran-telat";
import { cn, formatTanggalLahir, today } from "../../lib/utils";
import { hasWhatsAppContact, openWhatsAppChat } from "../../lib/whatsapp";
import { SetoranTelatBendaharaBanner } from "../setoran/SetoranTelatBanner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { DateInput } from "../ui/DateInput";
import { Input, Label } from "../ui/Input";
import { LIST_CARD, LIST_CARD_PHONE, LIST_HEAD_ROW, LIST_TABLE, LIST_TABLE_ELEMENT } from "../ui/list-compact";

const TANPA_PETUGAS = "__tanpa__";

function petugasKey(id: string | null): string {
  return id ?? TANPA_PETUGAS;
}

function itemKey(item: PembayaranSetoranItem): string {
  return `${item.sumber}:${item.id}`;
}

function DaftarPembayaran({
  items,
  selected,
  onToggle,
}: {
  items: PembayaranSetoranItem[];
  selected?: Set<string>;
  onToggle?: (key: string) => void;
}) {
  return (
    <ul className="divide-y divide-copper-100 border border-copper-100 rounded-md max-h-80 overflow-y-auto">
      {items.map((item) => {
        const key = itemKey(item);
        return (
          <li key={key}>
            <label
              className={cn(
                "flex items-start gap-2 px-2 py-1.5 text-xs",
                onToggle && "cursor-pointer hover:bg-copper-50/60"
              )}
            >
              {onToggle && (
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  checked={selected?.has(key) ?? false}
                  onChange={() => onToggle(key)}
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="text-muted">{formatTanggalLahir(item.tanggal)}</span>
                {" · "}
                <span className="font-medium text-copper-950">
                  {item.nomor_kartu} {item.kepala_nama}
                </span>
                <span className="block text-muted truncate">
                  {item.uraian}
                  {item.akun_nama ? ` · ${item.akun_nama}` : ""}
                </span>
              </span>
              <span className="shrink-0 tabular-nums font-medium">{formatRupiah(item.jumlah)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export function SetoranPanel({
  canEdit,
  userId,
  isPhone,
  onChanged,
}: {
  canEdit: boolean;
  userId: string | undefined;
  isPhone: boolean;
  /** Dipanggil setelah setoran diterima/dibatalkan agar saldo & buku kas dimuat ulang. */
  onChanged: () => void;
}) {
  const [ringkasan, setRingkasan] = useState<UangBelumDisetorPetugas[]>([]);
  const [riwayat, setRiwayat] = useState<SetoranRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [petugasDipilih, setPetugasDipilih] = useState<string | null>(null);
  const [items, setItems] = useState<PembayaranSetoranItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tanggal, setTanggal] = useState(today());
  const [keterangan, setKeterangan] = useState("");
  const [busy, setBusy] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PembayaranSetoranItem[]>([]);
  const [batalId, setBatalId] = useState<string | null>(null);
  const [batalBusy, setBatalBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  async function unduhPdf(s: SetoranRow) {
    setPdfBusy(s.id);
    setError("");
    try {
      await unduhBuktiSetoran(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusy(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [r, s] = await Promise.all([listUangBelumDisetorPerPetugas(), listSetoran({ limit: 50 })]);
      setRingkasan(r);
      setRiwayat(s);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pilihPetugas = useCallback(async (key: string | null) => {
    setPetugasDipilih(key);
    setItems([]);
    setSelected(new Set());
    setInfo("");
    if (key == null) return;
    setItemsLoading(true);
    try {
      const rows = await listPembayaranBelumDisetor(key === TANPA_PETUGAS ? null : key);
      setItems(rows);
      setSelected(new Set(rows.map(itemKey)));
    } catch (e) {
      setError(String(e));
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const totalBelumDisetor = ringkasan.reduce((s, r) => s + r.total, 0);
  const dipilih = useMemo(() => items.filter((i) => selected.has(itemKey(i))), [items, selected]);
  const totalDipilih = dipilih.reduce((s, i) => s + i.jumlah, 0);
  const ringkasanDipilih = ringkasan.find((r) => petugasKey(r.petugas_id) === petugasDipilih);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function simpanSetoran() {
    if (!canEdit || !userId || petugasDipilih == null || dipilih.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const r = await terimaSetoran({
        petugasId: petugasDipilih === TANPA_PETUGAS ? null : petugasDipilih,
        tanggal,
        keterangan: keterangan || undefined,
        items: dipilih.map((i) => ({ sumber: i.sumber, id: i.id })),
        diterimaOleh: userId,
      });
      setInfo(
        `Setoran ${formatRupiah(r.total)} (${r.jumlahTransaksi} transaksi) diterima dan masuk buku kas ${formatTanggalLahir(tanggal)}.`
      );
      setKeterangan("");
      setPetugasDipilih(null);
      setItems([]);
      setSelected(new Set());
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setDetail([]);
    try {
      setDetail(await listPembayaranDalamSetoran(id));
    } catch (e) {
      setError(String(e));
    }
  }

  async function confirmBatal() {
    if (!batalId) return;
    setBatalBusy(true);
    try {
      await batalkanSetoran(batalId);
      if (expandedId === batalId) setExpandedId(null);
      setBatalId(null);
      setInfo("");
      await load();
      if (petugasDipilih != null) await pilihPetugas(petugasDipilih);
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBatalBusy(false);
    }
  }

  return (
    <>
      <SetoranTelatBendaharaBanner ringkasan={ringkasan} onRefresh={() => void load()} />
      <Card title="Uang belum disetor (dipegang petugas)">
        <p className="text-xs text-muted mb-2 leading-snug">
          Pembayaran yang dicatat dengan centang “langsung masuk buku kas” dimatikan belum tercatat di buku
          kas. Status krama tetap lunas sejak tanggal bayar.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm mb-2">
          <span>
            Total: <strong>{formatRupiah(totalBelumDisetor)}</strong>
          </span>
          <Button
            type="button"
            variant="secondary"
            icon={RotateCcw}
            className="h-8 text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            Muat ulang
          </Button>
        </div>
        {error && <p className="text-xs text-red-700 mb-2">{error}</p>}
        {info && (
          <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mb-2">
            {info}
          </p>
        )}
        {ringkasan.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">
            {loading ? "Memuat…" : "Tidak ada uang yang belum disetor."}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ringkasan.map((r) => {
              const key = petugasKey(r.petugas_id);
              const aktif = key === petugasDipilih;
              const telat = isSetoranTelat(r.tanggal_tertua);
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left rounded-lg border px-3 py-2 transition-colors",
                      aktif
                        ? "border-amber-400 bg-amber-50 ring-1 ring-amber-200"
                        : telat
                          ? "border-amber-300 bg-amber-50/40 hover:bg-amber-50/70"
                          : "border-copper-200 bg-card hover:bg-copper-50/60"
                    )}
                    onClick={() => void pilihPetugas(aktif ? null : key)}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-copper-950 truncate">
                          {r.petugas_nama}
                          {telat ? (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              Telat setor
                            </span>
                          ) : null}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {r.jumlah_transaksi} transaksi · sejak {formatTanggalLahir(r.tanggal_tertua)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-amber-900">
                        {formatRupiah(r.total)}
                      </span>
                    </span>
                  </button>
                  {telat && hasWhatsAppContact(r.petugas_nomor_kontak) ? (
                    <Button
                      type="button"
                      variant="secondary"
                      icon={MessageCircle}
                      className="mt-1 h-8 w-full text-[11px]"
                      onClick={() =>
                        void openWhatsAppChat(
                          r.petugas_nomor_kontak!,
                          buildPesanWhatsAppSetoranTelat(r)
                        )
                      }
                    >
                      Pengingat WhatsApp
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {petugasDipilih != null && (
        <Card title={`Terima setoran — ${ringkasanDipilih?.petugas_nama ?? "petugas"}`}>
          {itemsLoading ? (
            <p className="py-4 text-center text-xs text-muted">Memuat…</p>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">Tidak ada pembayaran belum disetor.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  className="text-copper-800 underline hover:no-underline"
                  onClick={() => setSelected(new Set(items.map(itemKey)))}
                >
                  Pilih semua
                </button>
                <button
                  type="button"
                  className="text-copper-800 underline hover:no-underline"
                  onClick={() => setSelected(new Set())}
                >
                  Kosongkan
                </button>
                <span className="text-muted">
                  {dipilih.length} dari {items.length} dipilih
                </span>
              </div>
              <DaftarPembayaran
                items={items}
                selected={selected}
                onToggle={canEdit ? toggle : undefined}
              />
              {canEdit ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                    <div className="min-w-0">
                      <Label className="text-[11px]">Tanggal setor</Label>
                      <DateInput value={tanggal} onChange={setTanggal} required />
                    </div>
                    <div className="min-w-0">
                      <Label className="text-[11px]">Keterangan</Label>
                      <Input
                        value={keterangan}
                        onChange={(e) => setKeterangan(e.target.value)}
                        placeholder="Opsional — mis. setoran pungutan banjar"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-copper-100 pt-2 gap-2">
                    <span className="text-sm font-semibold">Diterima: {formatRupiah(totalDipilih)}</span>
                    <Button
                      type="button"
                      icon={HandCoins}
                      className="h-8 text-xs"
                      disabled={busy || dipilih.length === 0 || !tanggal}
                      onClick={() => void simpanSetoran()}
                    >
                      {busy ? "Menyimpan…" : "Terima setoran"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted leading-snug">
                    Setelah diterima, pembayaran masuk buku kas pada tanggal setor dan terkunci — untuk mengubah
                    atau menghapusnya, batalkan setoran di riwayat di bawah.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted">Hanya admin/keuangan yang dapat menerima setoran.</p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Riwayat setoran" className={cn(LIST_CARD, isPhone && LIST_CARD_PHONE, LIST_TABLE)}>
        {riwayat.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted">
            {loading ? "Memuat…" : "Belum ada setoran."}
          </p>
        ) : (
          <div className="overflow-x-auto app-scroll-x">
            <table className={LIST_TABLE_ELEMENT}>
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <th />
                  <th>Tanggal</th>
                  <th>Petugas</th>
                  <th className="text-right pr-3">Total</th>
                  {!isPhone && <th className="pr-3">Diterima oleh</th>}
                  {!isPhone && <th className="pr-3">Keterangan</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {riwayat.map((s) => {
                  const open = expandedId === s.id;
                  const colSpan = 5 + (isPhone ? 0 : 2);
                  return [
                    <tr
                      key={s.id}
                      className="border-b border-copper-100 cursor-pointer hover:bg-copper-50/40"
                      onClick={() => void toggleDetail(s.id)}
                    >
                      <td className="w-5 text-muted">
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="pr-3 py-1 whitespace-nowrap">{formatTanggalLahir(s.tanggal)}</td>
                      <td className="pr-3">
                        {s.petugas_nama ?? "Tanpa petugas"}
                        <span className="text-muted text-[11px]"> · {s.jumlah_transaksi} trx</span>
                      </td>
                      <td className="pr-3 text-right tabular-nums font-medium">{formatRupiah(s.total)}</td>
                      {!isPhone && <td className="pr-3 text-xs">{s.diterima_oleh_nama ?? "—"}</td>}
                      {!isPhone && (
                        <td className="pr-3 text-muted text-xs truncate max-w-xs">{s.keterangan ?? "—"}</td>
                      )}
                      <td className="whitespace-nowrap">
                        <Button
                          type="button"
                          variant="ghost"
                          icon={FileDown}
                          iconOnly
                          title="Unduh PDF bukti setoran"
                          aria-label="Unduh PDF bukti setoran"
                          disabled={pdfBusy != null}
                          onClick={(e) => {
                            e.stopPropagation();
                            void unduhPdf(s);
                          }}
                        />
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            icon={Undo2}
                            iconOnly
                            title="Batalkan setoran"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBatalId(s.id);
                            }}
                          />
                        )}
                      </td>
                    </tr>,
                    open && (
                      <tr key={`${s.id}-detail`} className="border-b border-copper-100 bg-copper-50/30">
                        <td colSpan={colSpan} className="p-2">
                          {detail.length === 0 ? (
                            <p className="text-xs text-muted">Memuat…</p>
                          ) : (
                            <DaftarPembayaran items={detail} />
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={batalId != null}
        title="Batalkan setoran?"
        message="Pembayaran dalam setoran ini kembali berstatus belum disetor dan keluar dari buku kas sampai disetor lagi. Data pembayaran krama tidak dihapus."
        confirmLabel="Ya, batalkan"
        busy={batalBusy}
        onConfirm={() => void confirmBatal()}
        onCancel={() => {
          if (!batalBusy) setBatalId(null);
        }}
      />
    </>
  );
}
