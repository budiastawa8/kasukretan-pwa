import { Link, type LinkProps } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const variants = {
  primary:
    "bg-primary text-primary-foreground shadow-sm shadow-copper-900/15 hover:bg-copper-700",
  secondary:
    "bg-copper-100 text-copper-900 border border-copper-200 hover:bg-copper-200",
  ghost: "text-copper-800 hover:bg-copper-100",
};

export function IconLink({
  icon: Icon,
  children,
  variant = "primary",
  iconOnly,
  className,
  title,
  ...props
}: LinkProps & {
  icon: LucideIcon;
  children?: React.ReactNode;
  variant?: keyof typeof variants;
  iconOnly?: boolean;
  title?: string;
}) {
  return (
    <Link
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors",
        iconOnly ? "p-2 min-h-10 min-w-10" : "px-3.5 py-2 text-sm min-h-10",
        variants[variant],
        className
      )}
      {...props}
    >
      <Icon size={18} strokeWidth={2} aria-hidden />
      {!iconOnly && children}
    </Link>
  );
}
