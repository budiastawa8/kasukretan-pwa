import { Link, type LinkProps } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "../../lib/utils";
import { GuardedLink } from "../layout/GuardedLink";

const backLinkStyles = cn(
  "group inline-flex shrink-0 items-center gap-2 rounded-lg border-2 border-copper-400",
  "bg-copper-50 px-3.5 py-2 text-sm font-semibold text-copper-950",
  "shadow-sm shadow-copper-900/12 transition-all",
  "hover:border-copper-600 hover:bg-copper-100 hover:shadow-md hover:shadow-copper-900/18",
  "active:scale-[0.98]",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-600"
);

const iconStyles = cn(
  "flex size-7 shrink-0 items-center justify-center rounded-full bg-copper-300/80 text-copper-950",
  "transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
);

export function BackLink({
  to,
  children,
  guarded,
  className,
  ...rest
}: LinkProps & {
  guarded?: boolean;
}) {
  const Comp = guarded ? GuardedLink : Link;
  return (
    <Comp to={to} className={cn(backLinkStyles, className)} {...rest}>
      <span className={iconStyles} aria-hidden>
        <ArrowLeft size={18} strokeWidth={2.5} />
      </span>
      <span>{children}</span>
    </Comp>
  );
}
