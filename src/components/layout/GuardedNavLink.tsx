import { NavLink } from "react-router-dom";
import { useKramaFormGuard } from "../../context/KramaFormGuardContext";
import { cn } from "../../lib/utils";

export function GuardedNavLink({
  to,
  end,
  icon: Icon,
  label,
  onNavigate,
  layout = "sidebar",
}: {
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  onNavigate?: () => void;
  /** sidebar = drawer/sidebar; dock = bottom bar HP */
  layout?: "sidebar" | "dock";
}) {
  const { tryNavigate } = useKramaFormGuard();
  const dock = layout === "dock";

  return (
    <NavLink
      to={to}
      end={end}
      onClick={(e) => {
        if (!tryNavigate(to)) {
          e.preventDefault();
          return;
        }
        onNavigate?.();
      }}
      className={({ isActive }) =>
        cn(
          dock
            ? "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium transition-colors"
            : "flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors md:min-h-0 md:py-2",
          dock
            ? isActive
              ? "text-primary"
              : "text-copper-600 hover:text-copper-900"
            : isActive
              ? "bg-sidebar-active text-white shadow-sm shadow-copper-950/25"
              : "text-copper-200 hover:bg-copper-800/50 hover:text-copper-50"
        )
      }
    >
      <Icon size={dock ? 20 : 18} strokeWidth={2} className="shrink-0" />
      <span className={cn("truncate", dock && "max-w-[4.5rem] leading-tight")}>{label}</span>
    </NavLink>
  );
}
