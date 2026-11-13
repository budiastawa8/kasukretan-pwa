import { useMemo } from "react";
import { GuardedLink } from "../layout/GuardedLink";
import { navGroupsForPeran, type NavItem } from "../layout/nav-config";
import { cn } from "../../lib/utils";

const TILE_TONE: Record<string, string> = {
  krama: "bg-teal-100 text-teal-800",
  iuran: "bg-amber-100 text-amber-900",
  ops: "bg-emerald-100 text-emerald-800",
  sistem: "bg-copper-100 text-copper-800",
  home: "bg-copper-100 text-copper-800",
};

function MenuTile({ item, groupId }: { item: NavItem; groupId: string }) {
  const Icon = item.icon;
  return (
    <GuardedLink
      to={item.to}
      className="flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 text-center transition-colors active:bg-copper-100/80 hover:bg-copper-50"
    >
      <span
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-xl",
          TILE_TONE[groupId] ?? "bg-copper-100 text-copper-800"
        )}
      >
        <Icon size={22} strokeWidth={2} aria-hidden />
      </span>
      <span className="max-w-[4.75rem] text-[11px] font-medium leading-tight text-copper-900">
        {item.label}
      </span>
    </GuardedLink>
  );
}

/** Grid ikon menu cepat — hanya item yang boleh diakses peran (tanpa Dashboard). */
export function DashboardMenuGrid({ peran }: { peran: string | undefined }) {
  const groups = useMemo(
    () =>
      navGroupsForPeran(peran)
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => item.to !== "/"),
        }))
        .filter((g) => g.items.length > 0),
    [peran]
  );

  if (groups.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Menu cepat">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-copper-950">Menu</h3>
        <p className="text-[11px] text-muted">Akses cepat sesuai hak peran Anda</p>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.id} className="space-y-1.5">
            {group.label ? (
              <p className="px-0.5 text-[10px] font-semibold uppercase tracking-wider text-copper-500">
                {group.label}
              </p>
            ) : null}
            <div className="grid grid-cols-4 gap-1 rounded-2xl border border-copper-100/90 bg-card/80 p-1.5 shadow-sm shadow-copper-950/5">
              {group.items.map((item) => (
                <MenuTile key={item.to} item={item} groupId={group.id} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
