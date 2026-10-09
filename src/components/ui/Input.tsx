import { cn } from "../../lib/utils";
import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes } from "react";

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
