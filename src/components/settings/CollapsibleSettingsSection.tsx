import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

type Props = {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
};

export function CollapsibleSettingsSection({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: Props) {
  return (
    <details
      className={cn(
        "group rounded-lg border border-copper-200 bg-copper-50/30 overflow-hidden",
        className
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium text-copper-900 hover:bg-copper-50/80 select-none [&::-webkit-details-marker]:hidden">
        <Icon size={16} className="text-copper-700 shrink-0" aria-hidden />
        <span className="flex-1">{title}</span>
        {subtitle && (
          <span className="text-[11px] font-normal text-muted hidden sm:inline">{subtitle}</span>
        )}
        <ChevronDown
          size={16}
          className="text-muted shrink-0 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="border-t border-copper-200 px-4 py-4 space-y-4 bg-card">{children}</div>
    </details>
  );
}
