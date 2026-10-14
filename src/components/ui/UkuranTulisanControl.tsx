import { cn } from "../../lib/utils";
import { UKURAN_TULISAN_OPSI, useUkuranTulisan } from "../../lib/ukuran-tulisan";

const CONTOH_PX = [13, 16, 19];

export function UkuranTulisanControl({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [ukuran, setUkuran] = useUkuranTulisan();
  const dark = tone === "dark";
  return (
    <div>
      <p className={cn("text-xs", dark ? "text-copper-400" : "text-muted")}>Ukuran tulisan</p>
      <div
        role="radiogroup"
        aria-label="Ukuran tulisan"
        className={cn(
          "mt-1 grid grid-cols-3 gap-1 rounded-md p-0.5",
          dark ? "bg-copper-950/40" : "bg-copper-100"
        )}
      >
        {UKURAN_TULISAN_OPSI.map((o, i) => {
          const aktif = ukuran === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={aktif}
              aria-label={o.label}
              title={o.label}
              onClick={() => setUkuran(o.value)}
              className={cn(
                "flex min-h-9 items-center justify-center rounded font-semibold leading-none transition-colors",
                aktif
                  ? dark
                    ? "bg-copper-600 text-white"
                    : "bg-primary text-primary-foreground"
                  : dark
                    ? "text-copper-300 hover:bg-copper-800/60"
                    : "text-copper-800 hover:bg-copper-200"
              )}
            >
              <span style={{ fontSize: CONTOH_PX[i] }}>A</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
