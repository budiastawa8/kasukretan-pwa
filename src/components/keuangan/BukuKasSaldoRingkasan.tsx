import { Coins, HandCoins, Layers } from "lucide-react";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { labelAkunKeuanganJenis, kelompokDisplayOrder, stripSubAkunPrefix } from "../../lib/services/akun-keuangan";
import type { RingkasanSaldoAkun } from "../../lib/services/buku-kas";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";

function jenisBadgeClass(jenis: RingkasanSaldoAkun["akun_jenis"]): string {
  switch (jenis) {
    case "kas_dudukan":
      return "bg-amber-100 text-amber-900";
    case "kas_paturunan":
      return "bg-violet-100 text-violet-900";
    case "bank":
      return "bg-sky-100 text-sky-900";
    case "ewallet":
      return "bg-emerald-100 text-emerald-900";
    default:
      return "bg-copper-100 text-copper-800";
  }
}

type KelompokTheme = {
  section: string;
  parent: string;
  parentSelected: string;
  parentIconWrap: string;
  parentTitle: string;
  parentSaldo: string;
  badge: string;
  subGrid: string;
  subCard: string;
  subSelected: string;
  Icon: typeof HandCoins;
  indukLabel: string;
};

function kelompokTheme(jenis: RingkasanSaldoAkun["akun_jenis"]): KelompokTheme {
  if (jenis === "kas_dudukan") {
    return {
      section: "border-amber-300/80 bg-amber-50/40",
      parent:
        "border-2 border-amber-400 bg-gradient-to-br from-amber-100/90 via-amber-50 to-white shadow-sm",
      parentSelected: "ring-2 ring-amber-500 border-amber-500",
      parentIconWrap: "bg-amber-500 text-white",
      parentTitle: "text-amber-950",
      parentSaldo: "text-amber-950",
      badge: "bg-amber-600 text-white",
      subGrid: "border-amber-200/80 bg-white/60",
      subCard: "border-amber-200 bg-white hover:border-amber-300",
      subSelected: "border-amber-500 bg-amber-50/80 ring-1 ring-amber-300",
      Icon: HandCoins,
      indukLabel: "Induk Dana Dudukan",
    };
  }
  if (jenis === "kas_paturunan") {
    return {
      section: "border-violet-300/80 bg-violet-50/40",
      parent:
        "border-2 border-violet-400 bg-gradient-to-br from-violet-100/90 via-violet-50 to-white shadow-sm",
      parentSelected: "ring-2 ring-violet-500 border-violet-500",
      parentIconWrap: "bg-violet-500 text-white",
      parentTitle: "text-violet-950",
      parentSaldo: "text-violet-950",
      badge: "bg-violet-600 text-white",
      subGrid: "border-violet-200/80 bg-white/60",
      subCard: "border-violet-200 bg-white hover:border-violet-300",
      subSelected: "border-violet-500 bg-violet-50/80 ring-1 ring-violet-300",
      Icon: Coins,
      indukLabel: "Induk Dana Paturunan",
    };
  }
  return {
    section: "border-copper-300 bg-copper-50/40",
    parent: "border-2 border-copper-400 bg-gradient-to-br from-copper-100/80 to-white shadow-sm",
    parentSelected: "ring-2 ring-copper-500 border-copper-500",
    parentIconWrap: "bg-copper-600 text-white",
    parentTitle: "text-copper-950",
    parentSaldo: "text-copper-950",
    badge: "bg-copper-700 text-white",
    subGrid: "border-copper-200 bg-white/60",
    subCard: "border-copper-200 bg-white hover:border-copper-300",
    subSelected: "border-copper-500 bg-copper-50 ring-1 ring-copper-300",
    Icon: Layers,
    indukLabel: "Induk kelompok",
  };
}

type SaldoBlock =
  | { kind: "kelompok"; parent: RingkasanSaldoAkun; subs: RingkasanSaldoAkun[] }
  | { kind: "standalone"; row: RingkasanSaldoAkun };

function buildSaldoBlocks(rows: RingkasanSaldoAkun[]): SaldoBlock[] {
  const blocks: SaldoBlock[] = [];
  for (const r of rows) {
    if (r.is_kelompok) {
      blocks.push({ kind: "kelompok", parent: r, subs: [] });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if ((r.depth ?? 0) > 0 && last?.kind === "kelompok") {
      last.subs.push(r);
    } else {
      blocks.push({ kind: "standalone", row: r });
    }
  }
  return blocks;
}

function SaldoCard({
  row,
  displayNama,
  selected,
  clickable,
  onSelect,
  variant,
  theme,
}: {
  row: RingkasanSaldoAkun;
  displayNama: string;
  selected: boolean;
  clickable: boolean;
  onSelect?: (id: string) => void;
  variant: "parent" | "sub" | "standalone";
  theme?: KelompokTheme;
}) {
  const Tag = clickable ? "button" : "div";
  const isParent = variant === "parent";
  const isSub = variant === "sub";

  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={clickable && onSelect ? () => onSelect(row.akun_id) : undefined}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors w-full",
        isParent &&
          theme &&
          cn(theme.parent, selected && theme.parentSelected, clickable && "cursor-pointer hover:shadow-md"),
        isSub &&
          theme &&
          cn(theme.subCard, selected && theme.subSelected, clickable && "cursor-pointer"),
        variant === "standalone" &&
          cn(
            selected ? "border-copper-500 bg-copper-50 shadow-sm ring-1 ring-copper-300" : "border-copper-200 bg-card hover:border-copper-400",
            clickable && "cursor-pointer"
          )
      )}
    >
      <div className="flex items-start gap-2">
        {isParent && theme && (
          <span
            className={cn(
              "shrink-0 flex items-center justify-center w-8 h-8 rounded-lg",
              theme.parentIconWrap
            )}
            aria-hidden
          >
            <theme.Icon size={16} strokeWidth={2.25} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "leading-tight truncate",
                isParent && theme && cn("font-bold text-sm", theme.parentTitle),
                isSub && "font-normal text-[13px] text-copper-800",
                variant === "standalone" && "font-semibold text-sm text-copper-900"
              )}
            >
              {displayNama}
            </p>
            <span
              className={cn(
                "shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded",
                isParent && theme ? theme.badge : jenisBadgeClass(row.akun_jenis)
              )}
            >
              {isParent && theme
                ? theme.indukLabel
                : row.is_kelompok
                  ? "Kelompok"
                  : labelAkunKeuanganJenis(row.akun_jenis)}
            </span>
          </div>
          {isParent && (
            <p className="text-[10px] text-muted mt-0.5">Saldo gabungan semua sub-akun</p>
          )}
          <p
            className={cn(
              "font-bold tabular-nums mt-1",
              isParent && theme && cn("text-xl", theme.parentSaldo),
              isSub && "text-base text-copper-950",
              variant === "standalone" && "text-lg text-copper-950",
              row.saldo < 0 && "text-red-700"
            )}
          >
            {formatRupiah(row.saldo)}
          </p>
          {!row.is_kelompok && (
            <p className="text-[10px] text-muted mt-1 tabular-nums">
              <span className="text-emerald-800">+{formatRupiah(row.pemasukan)}</span>
              {" · "}
              <span className="text-red-800">−{formatRupiah(row.pengeluaran)}</span>
            </p>
          )}
        </div>
      </div>
    </Tag>
  );
}

function SubSaldoRow({
  row,
  displayNama,
  selected,
  clickable,
  onSelect,
  theme,
}: {
  row: RingkasanSaldoAkun;
  displayNama: string;
  selected: boolean;
  clickable: boolean;
  onSelect?: (id: string) => void;
  theme: KelompokTheme;
}) {
  const Tag = clickable ? "button" : "div";

  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={clickable && onSelect ? () => onSelect(row.akun_id) : undefined}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 text-left text-xs transition-colors",
        selected ? theme.subSelected : "hover:bg-white/80",
        clickable && "cursor-pointer"
      )}
    >
      <span className="min-w-0 flex-1 truncate font-medium text-copper-900">{displayNama}</span>
      <span
        className={cn(
          "shrink-0 text-[9px] font-medium px-1 py-px rounded",
          jenisBadgeClass(row.akun_jenis)
        )}
      >
        {labelAkunKeuanganJenis(row.akun_jenis)}
      </span>
      <span
        className={cn(
          "shrink-0 font-bold tabular-nums text-[11px]",
          row.saldo < 0 ? "text-red-700" : "text-copper-950"
        )}
      >
        {formatRupiah(row.saldo)}
      </span>
    </Tag>
  );
}

export function BukuKasSaldoRingkasan({
  rows,
  totalSaldo,
  selectedAkunId,
  onSelectAkun,
  loading,
  layout = "default",
}: {
  rows: RingkasanSaldoAkun[];
  totalSaldo: number;
  selectedAkunId?: string;
  onSelectAkun?: (akunId: string) => void;
  loading?: boolean;
  /** Keuangan page: tiga kelompok akun sejajar. Dashboard: grid 2 kolom. */
  layout?: "default" | "three-col";
}) {
  const isPhone = useIsPhoneClient();

  if (loading && rows.length === 0) {
    return <p className="text-sm text-muted py-2">Memuat ringkasan saldo…</p>;
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-copper-300 bg-copper-50/50 px-4 py-3 text-sm text-muted">
        Belum ada akun keuangan aktif. Tambahkan di{" "}
        <strong className="text-copper-800">Master Data → Akun &amp; Pos</strong>.
      </div>
    );
  }

  const blocks = buildSaldoBlocks(rows);
  const kelompokBlocks = blocks
    .filter((b): b is Extract<SaldoBlock, { kind: "kelompok" }> => b.kind === "kelompok")
    .sort(
      (a, b) =>
        kelompokDisplayOrder(a.parent.akun_jenis) - kelompokDisplayOrder(b.parent.akun_jenis)
    );
  const standaloneRows = blocks
    .filter((b): b is Extract<SaldoBlock, { kind: "standalone" }> => b.kind === "standalone")
    .map((b) => b.row);
  const clickable = !!onSelectAkun;
  const threeCol = layout === "three-col";
  const kelompokGridClass = isPhone
    ? "grid gap-3 grid-cols-1 items-start"
    : threeCol
      ? "grid gap-3 grid-cols-1 lg:grid-cols-3 items-start"
      : "grid gap-3 lg:grid-cols-2 items-start";
  const standaloneSpanClass = isPhone ? "" : threeCol ? "lg:col-span-3" : "lg:col-span-2";
  const standaloneGridClass = isPhone
    ? "grid gap-2 grid-cols-1"
    : "grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-copper-900 uppercase tracking-wide">
          Ringkasan Buku Kas
        </p>
        <p className="text-sm text-copper-900">
          Total semua akun:{" "}
          <span
            className={cn(
              "font-bold tabular-nums",
              totalSaldo < 0 ? "text-red-700" : "text-copper-950"
            )}
          >
            {formatRupiah(totalSaldo)}
          </span>
        </p>
      </div>

      <div className={kelompokGridClass}>
        {kelompokBlocks.map((block) => {
          const theme = kelompokTheme(block.parent.akun_jenis);
          return (
            <section
              key={block.parent.akun_id}
              className={cn("rounded-xl border p-2 sm:p-2.5 space-y-1.5 min-w-0", theme.section)}
            >
              <SaldoCard
                row={block.parent}
                displayNama={block.parent.akun_nama}
                selected={selectedAkunId === block.parent.akun_id}
                clickable={clickable}
                onSelect={onSelectAkun}
                variant="parent"
                theme={theme}
              />
              {block.subs.length > 0 && (
                <div className={cn("rounded-md border divide-y overflow-hidden", theme.subGrid)}>
                  {block.subs.map((sub) => (
                    <SubSaldoRow
                      key={sub.akun_id}
                      row={sub}
                      displayNama={stripSubAkunPrefix(block.parent.akun_nama, sub.akun_nama)}
                      selected={selectedAkunId === sub.akun_id}
                      clickable={clickable}
                      onSelect={onSelectAkun}
                      theme={theme}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {standaloneRows.length > 0 && (
          <div className={cn(standaloneSpanClass, standaloneGridClass)}>
            {standaloneRows.map((r) => (
              <SaldoCard
                key={r.akun_id}
                row={r}
                displayNama={r.akun_nama}
                selected={selectedAkunId === r.akun_id}
                clickable={clickable}
                onSelect={onSelectAkun}
                variant="standalone"
              />
            ))}
          </div>
        )}
      </div>

      {onSelectAkun && (
        <p className="text-[11px] text-muted">
          {threeCol
            ? "Dana Paturunan · Dana Dudukan · Dana Kasukretan Lainnya. Klik kartu induk atau sub-akun untuk buka buku kas."
            : "Kiri: Dana Paturunan · Kanan: Dana Dudukan. Klik kartu induk atau sub-akun untuk buka buku kas."}
        </p>
      )}
    </div>
  );
}
