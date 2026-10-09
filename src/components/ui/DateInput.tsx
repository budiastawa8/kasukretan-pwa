import { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import type { Instance as FlatpickrInstance } from "flatpickr/dist/types/instance";
import "flatpickr/dist/flatpickr.min.css";
import { dateToIsoLocal, parseIsoDateString } from "../../lib/date-iso";
import { cn } from "../../lib/utils";

const INPUT_CLASS =
  "w-full rounded-md border border-copper-200 bg-card px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-copper-400/40 focus:border-copper-400 min-h-10";

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  required,
  placeholder = "dd/mm/yyyy",
  id,
}: {
  value: string;
  onChange: (iso: string) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const hostRef = useRef<HTMLInputElement>(null);
  const fpRef = useRef<FlatpickrInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const syncingRef = useRef(false);
  onChangeRef.current = onChange;
  valueRef.current = value;

  function emitUserChange(selected: Date[]) {
    if (syncingRef.current) return;
    const iso = selected[0] ? dateToIsoLocal(selected[0]) : "";
    const current = parseIsoDateString(valueRef.current) ?? "";
    if (iso === current) return;
    onChangeRef.current(iso);
  }

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const defaultIso = parseIsoDateString(valueRef.current);
    syncingRef.current = true;
    fpRef.current = flatpickr(el, {
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "d/m/Y",
      altInputClass: cn(INPUT_CLASS, className),
      allowInput: true,
      disableMobile: true,
      defaultDate: defaultIso ?? undefined,
      locale: {
        firstDayOfWeek: 1,
      },
      onChange: (_selected, _str, instance) => {
        emitUserChange(instance.selectedDates);
      },
    });
    syncingRef.current = false;

    return () => {
      fpRef.current?.destroy();
      fpRef.current = null;
    };
  }, [className]);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    const iso = parseIsoDateString(value);
    syncingRef.current = true;
    if (iso) {
      fp.setDate(iso, false);
    } else {
      fp.clear(false);
    }
    syncingRef.current = false;
  }, [value]);

  useEffect(() => {
    const fp = fpRef.current;
    if (!fp) return;
    fp.set("clickOpens", !disabled);
    if (fp.altInput) fp.altInput.disabled = Boolean(disabled);
  }, [disabled]);

  return (
    <input
      ref={hostRef}
      type="text"
      id={id}
      className="sr-only"
      required={required}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}
