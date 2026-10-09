import { useEffect, useState } from "react";
import { Input, Select } from "./Input";

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  newOptionLabel?: string;
};

/** Dropdown dengan opsi existing; bisa beralih ke input untuk nilai baru. */
export function CreatableCombobox({
  value,
  onChange,
  options,
  placeholder = "Ketik RT/BTN",
  required,
  disabled,
  newOptionLabel = "+ RT/BTN baru…",
}: Props) {
  const trimmed = value.trim();
  const inList = trimmed !== "" && options.some((o) => o === trimmed);
  const [forceNew, setForceNew] = useState(inList ? false : trimmed !== "");

  useEffect(() => {
    if (trimmed && !options.some((o) => o === trimmed)) {
      setForceNew(true);
    }
  }, [trimmed, options]);

  const showSelect = !forceNew && options.length > 0;

  if (showSelect) {
    return (
      <Select
        value={trimmed}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new__") {
            setForceNew(true);
            onChange("");
            return;
          }
          onChange(v);
        }}
        required={required}
        disabled={disabled}
      >
        <option value="">Pilih RT/BTN</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__new__">{newOptionLabel}</option>
      </Select>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {options.length > 0 && !disabled && (
        <button
          type="button"
          className="text-[11px] text-copper-700 underline hover:text-copper-900"
          onClick={() => {
            setForceNew(false);
            onChange("");
          }}
        >
          Pilih dari daftar
        </button>
      )}
    </div>
  );
}
