import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Card } from "../ui/Card";

export function DashboardMetricCard({
  label,
  value,
  sub,
  icon: Icon,
  iconClass,
  iconColorClass,
  alert,
  href,
  progress,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  iconClass?: string;
  iconColorClass?: string;
  alert?: boolean;
  href?: string;
  progress?: { pct: number; label: string };
}) {
  const inner = (
    <Card
      className={cn(
        "!p-4 h-full transition-all duration-200",
        alert && "border-amber-300 bg-amber-50/60",
        href && "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "rounded-xl p-2.5 shrink-0",
            alert ? "bg-amber-200/70" : "bg-copper-200/50",
            iconClass
          )}
        >
          <Icon
            size={22}
            className={cn(
              alert ? "text-amber-900" : "text-copper-800",
              iconColorClass
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted font-medium">{label}</p>
          <p
            className={cn(
              "text-xl font-bold tabular-nums tracking-tight mt-0.5",
              alert ? "text-amber-950" : "text-copper-950"
            )}
          >
            {value}
          </p>
          {sub && <p className="text-[11px] text-muted mt-1 leading-snug">{sub}</p>}
          {progress && progress.pct >= 0 && (
            <div className="mt-2.5">
              <div className="h-1.5 rounded-full bg-copper-100 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    progress.pct >= 80 ? "bg-emerald-600" : progress.pct >= 50 ? "bg-copper-600" : "bg-amber-500"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }}
                />
              </div>
              <p className="text-[10px] text-muted mt-1">{progress.label}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );

  if (href) {
    return (
      <Link to={href} className="block group">
        {inner}
      </Link>
    );
  }

  return inner;
}
