import { cn } from "../../lib/utils";
import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export function Button({
  className,
  variant = "primary",
  size = "default",
  icon: Icon,
  iconRight: IconRight,
  iconOnly,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm";
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  /** Tombol persegi hanya ikon — wajib beri aria-label atau title */
  iconOnly?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50",
        iconOnly
          ? "p-2 min-h-10 min-w-10"
          : size === "sm"
            ? "px-2 py-1 text-xs min-h-8"
            : "px-3.5 py-2 text-sm min-h-10",
        variant === "primary" &&
          "bg-primary text-primary-foreground shadow-sm shadow-copper-900/15 hover:bg-copper-700",
        variant === "secondary" &&
          "bg-copper-100 text-copper-900 border border-copper-200 hover:bg-copper-200",
        variant === "ghost" && "text-copper-800 hover:bg-copper-100",
        variant === "danger" && "bg-red-700 text-white hover:bg-red-800",
        className
      )}
      {...props}
    >
      {Icon && <Icon size={18} strokeWidth={2} className="shrink-0" aria-hidden />}
      {!iconOnly && children}
      {IconRight && <IconRight size={18} strokeWidth={2} className="shrink-0" aria-hidden />}
    </button>
  );
}
