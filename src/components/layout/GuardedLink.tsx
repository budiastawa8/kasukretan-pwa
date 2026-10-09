import { Link, type LinkProps } from "react-router-dom";
import { useKramaFormGuard } from "../../context/KramaFormGuardContext";

export function GuardedLink({ to, children, className, ...rest }: LinkProps) {
  const { tryNavigate } = useKramaFormGuard();
  const target = typeof to === "string" ? to : (to.pathname ?? "");

  return (
    <Link
      to={to}
      className={className}
      {...rest}
      onClick={(e) => {
        if (typeof target === "string" && target && !tryNavigate(target)) {
          e.preventDefault();
        }
        rest.onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
