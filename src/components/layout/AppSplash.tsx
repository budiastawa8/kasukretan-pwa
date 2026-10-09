import { cn } from "../../lib/utils";
import { AppLogo } from "../ui/AppLogo";

export function AppSplash({ fading }: { fading?: boolean }) {
  return (
    <div
      className={cn(
        "app-splash fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[#faf3eb] transition-opacity duration-300",
        fading && "opacity-0 pointer-events-none"
      )}
      role="status"
      aria-live="polite"
      aria-label="Memuat Kasukretan Krama"
    >
      <div
        className="app-splash-glow absolute inset-0 pointer-events-none"
        aria-hidden
      />
      <AppLogo size={128} className="app-splash-logo relative h-32 w-32" alt="" />
      <div className="relative text-center">
        <p className="app-splash-title text-2xl font-bold tracking-tight text-[#3d2310]">
          Kasukretan Krama
        </p>
        <p className="app-splash-subtitle text-sm text-[#8b6f5c] mt-1">
          Memuat aplikasi
          <span className="app-splash-dots inline-flex w-[1.1em]" aria-hidden>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      </div>
    </div>
  );
}
