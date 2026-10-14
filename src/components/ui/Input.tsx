import { cn } from "../../lib/utils";
import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { Eye, EyeOff } from "lucide-react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-md border border-copper-200 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-copper-400/40 focus:border-copper-400 min-h-10",
          className
        )}
        {...props}
      />
    );
  }
);

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function PasswordInput({ className, ...props }, ref) {
  const [terlihat, setTerlihat] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={terlihat ? "text" : "password"}
        className={cn("pr-11", className)}
        {...props}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-copper-600 hover:text-copper-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper-400/40"
        onClick={() => setTerlihat((v) => !v)}
        aria-label={terlihat ? "Sembunyikan password" : "Tampilkan password"}
        aria-pressed={terlihat}
        title={terlihat ? "Sembunyikan password" : "Tampilkan password"}
      >
        {terlihat ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      </button>
    </div>
  );
});

export function Label({
  className,
  children,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("block text-sm font-medium text-copper-800 mb-1", className)} {...props}>
      {children}
    </label>
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-md border border-copper-200 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-copper-400/40 focus:border-copper-400 min-h-10",
        className
      )}
      {...props}
    />
  );
}
