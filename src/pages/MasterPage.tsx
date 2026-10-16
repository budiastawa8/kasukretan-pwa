import { useCallback, useEffect, useState } from "react";
import { getDesaAdatWithMedia } from "../lib/services/desa";
import {
  listBanjar,
  createBanjar,
  updateBanjar,
  deleteBanjar,
  listTempek,
  createTempek,
  updateTempek,
  deleteTempek,
  listArahan,
  createArahan,
  updateArahan,
  deleteArahan,
  listJenisMipil,
  createJenisMipil,
  updateJenisMipil,
  deleteJenisMipil,
  listJenisKramaTamiu,
  createJenisKramaTamiu,
  updateJenisKramaTamiu,
  deleteJenisKramaTamiu,
  listJenisTamiu,
  createJenisTamiu,
  updateJenisTamiu,
  deleteJenisTamiu,
} from "../lib/services/master";
import {
  Check,
  Clock,
  FileSpreadsheet,
  HandCoins,
  Landmark,
  Layers,
  MapPin,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Input } from "../components/ui/Input";
import { RupiahInput } from "../components/ui/RupiahInput";
import type { RupiahInputValue } from "../lib/rupiah-input";
import { MasterRow } from "../components/master/MasterRow";
import {
  MASTER_CARD_PHONE,
  MASTER_CARD_TITLED,
  MASTER_PAGE,
} from "../components/master/master-compact";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { MasaBerlakuMasterTab } from "../components/master/MasaBerlakuMasterTab";
import { ProfilDesaAdatTab } from "../components/master/ProfilDesaAdatTab";
import { TimKasukretanMasterTab } from "../components/master/TimKasukretanMasterTab";
import { MasterImportExportTab } from "../components/master/MasterImportExportTab";
import { TarifAdministrasiIlikitaMasterTab } from "../components/master/TarifAdministrasiIlikitaMasterTab";
import { PemasihPerpanjanganRiwayatMasterTab } from "../components/master/PemasihPerpanjanganRiwayatMasterTab";
import { KeuanganMasterTab } from "../components/keuangan/KeuanganMasterTab";
import type {
  Arahan,
  Banjar,
  JenisKramaMipilRow,
  JenisKramaTamiuRow,
  JenisTamiuRow,
  Tempek,
} from "../lib/types";
import { cn } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { canEditMaster } from "../lib/auth-roles";
import { scrollAppMainToTop } from "../lib/scroll-main";

type EditTarget =
  | { kind: "banjar"; item: Banjar }
  | { kind: "tempek"; item: Tempek }
  | { kind: "arahan"; item: Arahan }
  | { kind: "mipil"; item: JenisKramaMipilRow }
  | { kind: "kramaTamiu"; item: JenisKramaTamiuRow }
  | { kind: "tamiu"; item: JenisTamiuRow };

export function MasterPage() {
  const isPhone = useIsPhoneClient();
  const { user } = useAuth();
  const canEdit = canEditMaster(user?.peran);
  const masterCardClass = cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE);
  const masterGridClass = cn(
    "grid gap-3",
    isPhone ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
  );
  const editFormClass = cn(
    "space-y-1.5 p-2 mb-2 rounded-lg bg-copper-50 border border-copper-200 leading-snug",
    isPhone && MASTER_CARD_PHONE
  );
  const tabBtnClass = cn(
    "text-xs sm:text-sm",
    isPhone ? "h-10" : "h-8 sm:h-10"
  );
  const [tab, setTab] = useState<
    "wilayah" | "jenis" | "berlaku" | "profil" | "tim" | "keuangan" | "impor"
  >("wilayah");
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [arahan, setArahan] = useState<Arahan[]>([]);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [jenisKT, setJenisKT] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [selBanjar, setSelBanjar] = useState("");
  const [selTempek, setSelTempek] = useState("");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletePending, setDeletePending] = useState<{
    label: string;
    fn: () => Promise<void>;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [newKramaTamiuNominal, setNewKramaTamiuNominal] = useState<RupiahInputValue>("");
  const [newTamiuNominal, setNewTamiuNominal] = useState<RupiahInputValue>("");

  const refreshJenis = useCallback(async () => {
    const [mipil, kramaTamiu, tamiu] = await Promise.all([
      listJenisMipil(),
      listJenisKramaTamiu(),
      listJenisTamiu(),
    ]);
    setJenisMipil(mipil);
    setJenisKT(kramaTamiu);
    setJenisT(tamiu);
  }, []);

  const refreshBanjar = useCallback(async () => {
    setBanjar(await listBanjar());
  }, []);

  useEffect(() => {
    refreshBanjar();
    refreshJenis();
  }, [refreshBanjar, refreshJenis]);

  useEffect(() => {
    if (!selBanjar) {
      setTempek([]);
      return;
    }
    listTempek(selBanjar).then(setTempek);
  }, [selBanjar]);

  useEffect(() => {
    if (!selTempek) {
      setArahan([]);
      return;
    }
    listArahan(selTempek).then(setArahan);
  }, [selTempek]);

  useEffect(() => {
    scrollAppMainToTop();
  }, [tab]);

  const selectedBanjar = banjar.find((b) => b.id === selBanjar);
  const selectedTempek = tempek.find((t) => t.id === selTempek);

  async function refreshAll() {
    await refreshBanjar();
    await refreshJenis();
    if (selBanjar) setTempek(await listTempek(selBanjar));
    if (selTempek) setArahan(await listArahan(selTempek));
  }

  async function runAction(fn: () => Promise<void>, successMsg?: string) {
    setError("");
    setSuccess("");
    try {
      await fn();
      setEditing(null);
      await refreshAll();
      if (successMsg) {
        setSuccess(successMsg);
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function addTempek(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selBanjar) {
      setError("Pilih banjar terlebih dahulu (klik nama banjar di kolom kiri)");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const nama = String(fd.get("nama") ?? "");
    await runAction(async () => {
      await createTempek(selBanjar, nama);
      setTempek(await listTempek(selBanjar));
    }, "Tempek berhasil ditambahkan");
    e.currentTarget.reset();
  }

  async function addArahan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selTempek) {
      setError("Pilih tempek terlebih dahulu (klik nama tempek di kolom tengah)");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const nama = String(fd.get("nama") ?? "");
    await runAction(async () => {
      await createArahan(selTempek, nama);
      setArahan(await listArahan(selTempek));
    }, "Arahan berhasil ditambahkan");
    e.currentTarget.reset();
  }

  function requestDelete(label: string, fn: () => Promise<void>) {
    setDeletePending({ label, fn });
  }

  async function handleConfirmDelete() {
    if (!deletePending) return;
    setDeleteBusy(true);
    try {
      await runAction(deletePending.fn);
      setDeletePending(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function addBanjar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const desa = await getDesaAdatWithMedia();
    if (!desa) return alert("Set desa adat dulu");
    await runAction(async () => {
      await createBanjar(desa.id, String(fd.get("nama")), String(fd.get("kode")));
      await refreshBanjar();
    }, "Banjar berhasil ditambahkan");
    e.currentTarget.reset();
  }

  function EditBanjarForm({ item }: { item: Banjar }) {
    return (
      <form
        className={editFormClass}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          runAction(() =>
            updateBanjar(item.id, String(fd.get("nama")), String(fd.get("kode")))
          );
        }}
      >
        <Input name="nama" defaultValue={item.nama} required />
        <Input name="kode" defaultValue={item.kode} maxLength={2} required />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" icon={Check}>
            Simpan
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={X}
            onClick={() => setEditing(null)}
          >
            Batal
          </Button>
        </div>
      </form>
    );
  }

  function EditNameForm({
    item,
    onSave,
  }: {
    item: { id: string; nama: string };
    onSave: (nama: string) => Promise<void>;
  }) {
    return (
      <form
        className={editFormClass}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          runAction(() => onSave(String(fd.get("nama"))));
        }}
      >
        <Input name="nama" defaultValue={item.nama} required />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" icon={Check}>
            Simpan
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={X}
            onClick={() => setEditing(null)}
          >
            Batal
          </Button>
        </div>
      </form>
    );
  }

  function EditJenisMipilForm({ item }: { item: JenisKramaMipilRow }) {
    return (
      <form
        className={editFormClass}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          runAction(() =>
            updateJenisMipil(
              item.id,
              String(fd.get("nama")),
              Number(fd.get("persen")),
              String(fd.get("kode") || "") || undefined
            )
          );
        }}
      >
        <Input name="nama" defaultValue={item.nama} required />
        <Input name="kode" defaultValue={item.kode ?? ""} placeholder="Kode (opsional)" />
        <Input
          name="persen"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={item.paturunan_persen}
          required
        />
        <p className="text-[11px] text-copper-600 leading-snug">
          Pengali nominal iuran paturunan (0–100%).
        </p>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" icon={Check}>
            Simpan
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={X}
            onClick={() => setEditing(null)}
          >
            Batal
          </Button>
        </div>
      </form>
    );
  }

  function EditJenisTamiuForm({
    item,
    onSave,
  }: {
    item: JenisKramaTamiuRow | JenisTamiuRow;
    onSave: (nama: string, nominal: number) => Promise<void>;
  }) {
    const [nominal, setNominal] = useState<RupiahInputValue>(
      Math.round(Number(item.dudukan_nominal) || 0)
    );

    return (
      <form
        className={editFormClass}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          runAction(() =>
            onSave(String(fd.get("nama")), nominal === "" ? 0 : nominal)
          );
        }}
      >
        <Input name="nama" defaultValue={item.nama} required />
        <RupiahInput value={nominal} onChange={setNominal} required />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" icon={Check}>
            Simpan
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={X}
            onClick={() => setEditing(null)}
          >
            Batal
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className={cn(MASTER_PAGE, "w-full max-w-full")}>
      <h2 className="text-xl sm:text-2xl font-bold">Master Data</h2>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-1.5 leading-snug">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-copper-900 bg-copper-100 border border-copper-300 rounded-lg px-4 py-1.5 leading-snug">
          {success}
        </p>
      )}
      {tab === "wilayah" && (
        <p className="text-sm text-muted leading-snug">
          Alur: pilih <strong>Banjar</strong> → tambah Tempek → pilih <strong>Tempek</strong> → tambah
          Arahan.
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <Button
          variant={tab === "wilayah" ? "primary" : "secondary"}
          icon={MapPin}
          className={tabBtnClass}
          onClick={() => setTab("wilayah")}
        >
          Wilayah
        </Button>
        <Button
          variant={tab === "jenis" ? "primary" : "secondary"}
          icon={Layers}
          className={tabBtnClass}
          onClick={() => setTab("jenis")}
        >
          Jenis Krama
        </Button>
        <Button
          variant={tab === "berlaku" ? "primary" : "secondary"}
          icon={Clock}
          className={tabBtnClass}
          onClick={() => setTab("berlaku")}
        >
          <span className="max-sm:sr-only">ILIKITA & </span>Masa Berlaku
        </Button>
        <Button
          variant={tab === "profil" ? "primary" : "secondary"}
          icon={Landmark}
          className={tabBtnClass}
          onClick={() => setTab("profil")}
        >
          Profil Desa
        </Button>
        <Button
          variant={tab === "tim" ? "primary" : "secondary"}
          icon={HandCoins}
          className={tabBtnClass}
          onClick={() => setTab("tim")}
        >
          Tim Kasukretan
        </Button>
        <Button
          variant={tab === "keuangan" ? "primary" : "secondary"}
          icon={Wallet}
          className={tabBtnClass}
          onClick={() => setTab("keuangan")}
        >
          Akun & Pos
        </Button>
        <Button
          variant={tab === "impor" ? "primary" : "secondary"}
          icon={FileSpreadsheet}
          className={tabBtnClass}
          onClick={() => setTab("impor")}
        >
          Impor/Ekspor
        </Button>
      </div>

      {tab === "keuangan" && <KeuanganMasterTab canEdit={canEdit} />}

      {tab === "berlaku" && (
        <>
          <p className="text-sm text-muted leading-snug">
            Kebijakan perpanjangan Pipil/Pemasih, biaya administrasi ILIKITA (IPMA & Pemasih), dan tarif
            nominal — atur di sini sebelum menerbitkan surat atau perpanjangan.
          </p>
          <MasaBerlakuMasterTab
            canEdit={canEdit}
            onSaved={(msg) => {
              setError("");
              setSuccess(msg);
              setTimeout(() => setSuccess(""), 3000);
            }}
            onError={(msg) => {
              setSuccess("");
              setError(msg);
            }}
          />
          <TarifAdministrasiIlikitaMasterTab
            canEdit={canEdit}
            onSaved={(msg) => {
              setError("");
              setSuccess(msg);
              setTimeout(() => setSuccess(""), 3000);
            }}
            onError={(msg) => {
              setSuccess("");
              setError(msg);
            }}
          />
          <PemasihPerpanjanganRiwayatMasterTab />
        </>
      )}

      {tab === "profil" && (
        <ProfilDesaAdatTab
          canEdit={canEdit}
          onSaved={(msg) => {
            setError("");
            setSuccess(msg);
            setTimeout(() => setSuccess(""), 3000);
          }}
          onError={(msg) => {
            setSuccess("");
            setError(msg);
          }}
        />
      )}

      {tab === "impor" && (
        <MasterImportExportTab
          canEdit={canEdit}
          onRefresh={refreshAll}
          onSaved={(msg) => {
            setError("");
            setSuccess(msg);
            setTimeout(() => setSuccess(""), 3000);
          }}
          onError={(msg) => {
            setSuccess("");
            setError(msg);
          }}
        />
      )}

      {tab === "tim" && (
        <TimKasukretanMasterTab
          canEdit={canEdit}
          onSaved={(msg) => {
            setError("");
            setSuccess(msg);
            setTimeout(() => setSuccess(""), 3000);
          }}
          onError={(msg) => {
            setSuccess("");
            setError(msg);
          }}
        />
      )}

      {tab === "wilayah" && (
        <div className={masterGridClass}>
          <Card title="Banjar" className={masterCardClass}>
            {canEdit && (
              <form onSubmit={addBanjar} className="space-y-1.5 mb-3 leading-snug">
                <Input name="nama" placeholder="Nama banjar" required />
                <Input name="kode" placeholder="Kode 2 digit" maxLength={2} required />
                <Button type="submit" className="w-full" icon={Plus}>
                  Tambah
                </Button>
              </form>
            )}
            {editing?.kind === "banjar" && <EditBanjarForm item={editing.item} />}
            <ul className="text-sm space-y-0">
              {banjar.map((b) =>
                editing?.kind === "banjar" && editing.item.id === b.id ? null : (
                  <MasterRow
                    key={b.id}
                    label={`${b.kode} — ${b.nama}`}
                    selected={selBanjar === b.id}
                    onSelect={() => {
                      setSelBanjar(b.id);
                      setSelTempek("");
                      setEditing(null);
                    }}
                    canEdit={canEdit}
                    onEdit={() => setEditing({ kind: "banjar", item: b })}
                    onDelete={() =>
                      requestDelete(`banjar ${b.nama}`, async () => {
                        await deleteBanjar(b.id);
                        if (selBanjar === b.id) {
                          setSelBanjar("");
                          setSelTempek("");
                        }
                      })
                    }
                  />
                )
              )}
            </ul>
          </Card>
          <Card title="Tempek" className={masterCardClass}>
            {!selBanjar ? (
              <p className="text-sm text-muted mb-2 leading-snug">Pilih banjar di kolom kiri untuk menambah tempek.</p>
            ) : (
              <p className="text-xs text-copper-700 mb-2 font-medium leading-snug">
                Banjar aktif: {selectedBanjar?.kode} — {selectedBanjar?.nama}
              </p>
            )}
            {canEdit && selBanjar && (
              <form onSubmit={addTempek} className="space-y-1.5 mb-3 leading-snug">
                <Input name="nama" placeholder="Nama tempek" required autoComplete="off" />
                <Button type="submit" className="w-full" icon={Plus}>
                  Tambah Tempek
                </Button>
              </form>
            )}
            {editing?.kind === "tempek" && (
              <EditNameForm
                item={editing.item}
                onSave={(nama) => updateTempek(editing.item.id, nama)}
              />
            )}
            <ul className="text-sm space-y-0">
              {tempek.map((t) =>
                editing?.kind === "tempek" && editing.item.id === t.id ? null : (
                  <MasterRow
                    key={t.id}
                    label={t.nama}
                    selected={selTempek === t.id}
                    onSelect={() => {
                      setSelTempek(t.id);
                      setEditing(null);
                    }}
                    canEdit={canEdit}
                    onEdit={() => setEditing({ kind: "tempek", item: t })}
                    onDelete={() =>
                      requestDelete(`tempek ${t.nama}`, async () => {
                        await deleteTempek(t.id);
                        if (selBanjar) setTempek(await listTempek(selBanjar));
                        if (selTempek === t.id) setSelTempek("");
                      })
                    }
                  />
                )
              )}
            </ul>
          </Card>
          <Card title="Arahan" className={masterCardClass}>
            {!selTempek ? (
              <p className="text-sm text-muted mb-2 leading-snug">Pilih tempek di kolom tengah untuk menambah arahan.</p>
            ) : (
              <p className="text-xs text-copper-700 mb-2 font-medium leading-snug">
                Tempek aktif: {selectedTempek?.nama}
              </p>
            )}
            {canEdit && selTempek && (
              <form onSubmit={addArahan} className="space-y-1.5 mb-3 leading-snug">
                <Input name="nama" placeholder="Nama arahan" required autoComplete="off" />
                <Button type="submit" className="w-full" icon={Plus}>
                  Tambah Arahan
                </Button>
              </form>
            )}
            {editing?.kind === "arahan" && (
              <EditNameForm
                item={editing.item}
                onSave={(nama) => updateArahan(editing.item.id, nama)}
              />
            )}
            <ul className="text-sm space-y-0">
              {arahan.map((a) =>
                editing?.kind === "arahan" && editing.item.id === a.id ? null : (
                  <MasterRow
                    key={a.id}
                    label={a.nama}
                    canEdit={canEdit}
                    onEdit={() => setEditing({ kind: "arahan", item: a })}
                    onDelete={() =>
                      requestDelete(`arahan ${a.nama}`, async () => {
                        await deleteArahan(a.id);
                        if (selTempek) setArahan(await listArahan(selTempek));
                      })
                    }
                  />
                )
              )}
            </ul>
          </Card>
        </div>
      )}

      {tab === "jenis" && (
        <>
          <p className="text-sm text-muted leading-snug">
            <strong>% Paturunan</strong> pada jenis krama adalah pengali terhadap nominal iuran (diatur
            di menu Paturunan), bukan nominal iuran itu sendiri. Tarif biaya admin IPMA/Pemasih ada di tab{" "}
            <strong>ILIKITA &amp; Masa Berlaku</strong>.
          </p>
          <div className={masterGridClass}>
          <Card title="Jenis Krama Mipil" className={masterCardClass}>
            {canEdit && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  await runAction(async () => {
                    await createJenisMipil(
                      String(fd.get("nama")),
                      Number(fd.get("persen")),
                      String(fd.get("kode") || "") || undefined
                    );
                  });
                  e.currentTarget.reset();
                }}
                className="space-y-1.5 mb-3 leading-snug"
              >
                <Input name="nama" placeholder="Nama jenis" required />
                <Input
                  name="persen"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  placeholder="% Paturunan (0–100)"
                  required
                />
                <p className="text-[11px] text-copper-600 leading-snug">
                  Contoh: 100 = bayar penuh, 50 = setengah, 0 = tidak kena iuran.
                </p>
                <Button type="submit" className="w-full" icon={Plus}>
                  Tambah
                </Button>
              </form>
            )}
            {editing?.kind === "mipil" && <EditJenisMipilForm item={editing.item} />}
            <ul className="text-sm space-y-0">
              {jenisMipil.map((j) =>
                editing?.kind === "mipil" && editing.item.id === j.id ? null : (
                  <MasterRow
                    key={j.id}
                    label={`${j.nama} — ${j.paturunan_persen}%`}
                    canEdit={canEdit}
                    onEdit={() => setEditing({ kind: "mipil", item: j })}
                    onDelete={() =>
                      requestDelete(`jenis ${j.nama}`, () => deleteJenisMipil(j.id))
                    }
                  />
                )
              )}
            </ul>
          </Card>
          <Card title="Jenis Krama Tamiu" className={masterCardClass}>
            <p className="text-[11px] text-copper-600 leading-snug mb-3">
              Pemasih <strong>Krama Tamiu</strong> — jenis resmi:{" "}
              <strong>Krama Tamiu Rajeg</strong>, <strong>Krama Tamiu Padunungan</strong>,{" "}
              <strong>Krama Tamiu Padgatakala</strong>. Nama di Master harus sama persis (termasuk
              awalan &quot;Krama Tamiu&quot;) agar impor Excel cocok. Berbeda dengan jenis{" "}
              <strong>Tamiu</strong> (Rajeg Mula, Rajeg Anyar, …).
            </p>
            {canEdit && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  await runAction(async () => {
                    await createJenisKramaTamiu(
                      String(fd.get("nama")),
                      newKramaTamiuNominal === "" ? 0 : newKramaTamiuNominal
                    );
                  });
                  setNewKramaTamiuNominal("");
                  e.currentTarget.reset();
                }}
                className="space-y-1.5 mb-3 leading-snug"
              >
                <Input name="nama" placeholder="Contoh: Krama Tamiu Rajeg" required />
                <RupiahInput
                  value={newKramaTamiuNominal}
                  onChange={setNewKramaTamiuNominal}
                  required
                />
                <Button type="submit" className="w-full" icon={Plus}>
                  Tambah
                </Button>
              </form>
            )}
            {editing?.kind === "kramaTamiu" && (
              <EditJenisTamiuForm
                item={editing.item}
                onSave={(nama, nominal) => updateJenisKramaTamiu(editing.item.id, nama, nominal)}
              />
            )}
            <ul className="text-sm space-y-0">
              {jenisKT.map((j) =>
                editing?.kind === "kramaTamiu" && editing.item.id === j.id ? null : (
                  <MasterRow
                    key={j.id}
                    label={`${j.nama} — Rp ${Number(j.dudukan_nominal).toLocaleString("id-ID")}`}
                    canEdit={canEdit}
                    onEdit={() => setEditing({ kind: "kramaTamiu", item: j })}
                    onDelete={() =>
                      requestDelete(`jenis ${j.nama}`, () => deleteJenisKramaTamiu(j.id))
                    }
                  />
                )
              )}
            </ul>
          </Card>
          <Card title="Jenis Tamiu" className={masterCardClass}>
            <p className="text-[11px] text-copper-600 leading-snug mb-3">
              Pemasih <strong>Tamiu</strong> — jenis resmi: <strong>Tamiu Rajeg Mula</strong>,{" "}
              <strong>Tamiu Rajeg Anyar</strong>, <strong>Tamiu Padunungan</strong>,{" "}
              <strong>Tamiu Padgatakala</strong>. &quot;Rajeg&quot; saja tanpa Mula/Anyar adalah jenis{" "}
              <strong>Krama Tamiu</strong>, bukan Tamiu. Kolom impor <strong>klasifikasi</strong>{" "}
              isi <strong>Krama Tamiu</strong> atau <strong>Tamiu</strong> (bukan kode KRAMA_TAMIU
              kecuali disalin dari ekspor lama).
            </p>
            {canEdit && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  await runAction(async () => {
                    await createJenisTamiu(
                      String(fd.get("nama")),
                      newTamiuNominal === "" ? 0 : newTamiuNominal
                    );
                  });
                  setNewTamiuNominal("");
                  e.currentTarget.reset();
                }}
                className="space-y-1.5 mb-3 leading-snug"
              >
                <Input name="nama" placeholder="Contoh: Tamiu Rajeg Mula" required />
                <RupiahInput value={newTamiuNominal} onChange={setNewTamiuNominal} required />
                <Button type="submit" className="w-full" icon={Plus}>
                  Tambah
                </Button>
              </form>
            )}
            {editing?.kind === "tamiu" && (
              <EditJenisTamiuForm
                item={editing.item}
                onSave={(nama, nominal) => updateJenisTamiu(editing.item.id, nama, nominal)}
              />
            )}
            <ul className="text-sm space-y-0">
              {jenisT.map((j) =>
                editing?.kind === "tamiu" && editing.item.id === j.id ? null : (
                  <MasterRow
                    key={j.id}
                    label={`${j.nama} — Rp ${Number(j.dudukan_nominal).toLocaleString("id-ID")}`}
                    canEdit={canEdit}
                    onEdit={() => setEditing({ kind: "tamiu", item: j })}
                    onDelete={() =>
                      requestDelete(`jenis ${j.nama}`, () => deleteJenisTamiu(j.id))
                    }
                  />
                )
              )}
            </ul>
          </Card>
        </div>
        </>
      )}

      <ConfirmDialog
        open={deletePending != null}
        message={
          deletePending
            ? `Hapus ${deletePending.label}? Data akan dinonaktifkan dan tidak dapat dipulihkan dari sini.`
            : ""
        }
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!deleteBusy) setDeletePending(null);
        }}
      />
    </div>
  );
}
