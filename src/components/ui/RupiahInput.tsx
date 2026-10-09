import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { formatRupiahDigits, type RupiahInputValue } from "../../lib/rupiah-input";

type RupiahInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: RupiahInputValue;
  onChange: (value: RupiahInputValue) => void;
  showPrefix?: boolean;
};

export function RupiahInput({
  value,
  onChange,
  showPrefix = true,
  className,
  disabled,
  required,
  onFocus,
  onClick,
  onMouseUp,
  ...rest
}: RupiahInputProps) {
  const display = value === "" ? "" : formatRupiahDigits(value);

  function selectAll(e: React.FocusEvent<HTMLInputElement> | React.MouseEvent<HTMLInputElement>) {
    if (disabled || !e.currentTarget.value) return;
    e.currentTarget.select();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) {
      onChange("");
      return;
    }
    const n = Number.parseInt(digits, 10);
    onChange(Number.isFinite(n) ? n : "");
  }

  return (
    <div className="flex items-stretch w-full">
      {showPrefix && (
        <span
          className={cn(
            "inline-flex items-center rounded-l-md border border-r-0 border-copper-200 bg-copper-50 px-2 text-xs font-medium text-copper-700 shrink-0",
            disabled && "opacity-60"
          )}
        >
          Rp
        </span>
      )}
      <input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        value={display}
        onChange={handleChange}
        onFocus={(e) => {
          onFocus?.(e);
          selectAll(e);
        }}
        onClick={(e) => {
          onClick?.(e);
          selectAll(e);
        }}
        onMouseUp={(e) => {
          onMouseUp?.(e);
          if (!disabled && e.currentTarget.value) {
            e.preventDefault();
          }
        }}
        className={cn(
          "w-full rounded-md border border-copper-200 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-copper-400/40 focus:border-copper-400 min-h-10 text-right tabular-nums",
          showPrefix && "rounded-l-none",
          className
        )}
      />
    </div>
  );
}
