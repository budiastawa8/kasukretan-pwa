import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  listPekerjaan,
  mergePekerjaanOptions,
  rememberPekerjaan,
} from "../../lib/services/pekerjaan";
import { cn } from "../../lib/utils";
import { Button } from "./Button";
import { Input, Select } from "./Input";

const ADD_NEW_VALUE = "__tambah_pekerjaan_baru__";

type PekerjaanFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

export function PekerjaanField({ value, onChange, disabled, className }: PekerjaanFieldProps) {
  const [options, setOptions] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    let active = true;
    void listPekerjaan()
      .then((list) => {
        if (active) setOptions(mergePekerjaanOptions(list, value));
      })
      .catch(() => {
        if (active && value.trim()) setOptions([value.trim()]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!value.trim()) return;
    setOptions((prev) => mergePekerjaanOptions(prev, value));
  }, [value]);

  const selectedValue =
    adding || !value.trim()
      ? adding
        ? ADD_NEW_VALUE
        : ""
      : options.some((o) => o.toLowerCase() === value.trim().toLowerCase()) ||
          options.includes(value)
        ? options.find((o) => o.toLowerCase() === value.trim().toLowerCase()) ?? value
        : value;

  function handleSelectChange(next: string) {
    if (next === ADD_NEW_VALUE) {
      setAdding(true);
      setNewLabel("");
      return;
    }
    setAdding(false);
    setNewLabel("");
    onChange(next);
  }

  function cancelAdd() {
    setAdding(false);
    setNewLabel("");
  }

  function confirmAdd() {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    rememberPekerjaan(trimmed);
    setOptions((prev) => mergePekerjaanOptions(prev, trimmed));
    onChange(trimmed);
    setAdding(false);
    setNewLabel("");
  }

  const showCustomOption =
    value.trim() !== "" &&
    !options.some((o) => o.toLowerCase() === value.trim().toLowerCase());

  return (
    <div className={cn("space-y-1.5", className)}>
      <Select
        value={selectedValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        disabled={disabled}
        className="text-sm h-9"
      >
        <option value="">— Pilih pekerjaan —</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        {showCustomOption && !adding && (
          <option value={value.trim()}>{value.trim()}</option>
        )}
        <option value={ADD_NEW_VALUE}>+ Tambah pekerjaan baru…</option>
      </Select>

      {adding && (
        <div className="flex flex-wrap items-end gap-1.5">
          <div className="flex-1 min-w-[10rem]">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Nama pekerjaan baru"
              disabled={disabled}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmAdd();
                }
                if (e.key === "Escape") cancelAdd();
              }}
            />
          </div>
          <Button
            type="button"
            icon={Plus}
            className="h-9 text-xs shrink-0"
            onClick={confirmAdd}
            disabled={disabled || !newLabel.trim()}
          >
            Tambah
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 text-xs shrink-0"
            onClick={cancelAdd}
            disabled={disabled}
          >
            Batal
          </Button>
        </div>
      )}
    </div>
  );
}
