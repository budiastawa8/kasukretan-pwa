import { cn } from "../../lib/utils";

export function Card({
  children,
  className,
  title,
  compact = false,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  /** Padding rapat untuk daftar (filter + tabel). */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-copper-300/75 bg-card shadow-sm shadow-copper-900/8 overflow-hidden leading-snug",
        className
      )}
    >
      {title && (
        <div
          className={cn(
            "border-b border-copper-300/90 bg-copper-100",
            compact ? "px-2 py-1.5" : "px-4 py-2"
          )}
        >
          <h3
            className={cn(
              "font-semibold text-copper-950 tracking-tight leading-snug",
              compact ? "text-sm" : "text-base"
            )}
          >
            {title}
          </h3>
        </div>
      )}
      <div className={cn("bg-card leading-snug", compact ? "p-2" : "p-4")}>{children}</div>
    </div>
  );
}
