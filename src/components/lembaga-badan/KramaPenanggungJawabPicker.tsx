import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { listKrama } from "../../lib/services/krama";
import type { KramaListItem } from "../../lib/types";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";

export function KramaPenanggungJawabPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (kramaId: string, row: KramaListItem | null) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<KramaListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<KramaListItem | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    if (debouncedQ.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const result = await listKrama({
        klasifikasiIn: ["MIPIL", "KRAMA_TAMIU", "TAMIU"],
        q: debouncedQ,
        statusKrama: "aktif",
        limit: 20,
      });
      setRows(result);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const found = rows.find((r) => r.id === value);
    if (found) setSelected(found);
  }, [value, rows]);

  function pick(row: KramaListItem) {
    setSelected(row);
    onChange(row.id, row);
  }

  function clear() {
    setSelected(null);
    onChange("", null);
  }

  return (
    <div className="space-y-2">
      <Label>Krama penanggung jawab</Label>
      {selected ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-copper-200 bg-copper-50/60 px-3 py-2 text-sm">
          <div>
            <p className="font-medium text-copper-950">{selected.kepala_nama}</p>
            <p className="text-xs text-muted">
              {selected.nomor_kartu} · {selected.klasifikasi_nama}
              {selected.banjar_nama ? ` · ${selected.banjar_nama}` : ""}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={clear} disabled={disabled}>
            Ganti
          </Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted" />
            <Input
              className="pl-8"
              placeholder="Cari nama / nomor kartu krama..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-copper-200 divide-y divide-copper-100">
            {loading ? (
              <p className="p-2 text-sm text-muted">Memuat...</p>
            ) : debouncedQ.length < 2 ? (
              <p className="p-2 text-sm text-muted">Ketik minimal 2 karakter untuk mencari.</p>
            ) : rows.length === 0 ? (
              <p className="p-2 text-sm text-muted">Tidak ada krama ditemukan.</p>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-copper-50 disabled:opacity-50"
                  onClick={() => pick(r)}
                  disabled={disabled}
                >
                  <span className="font-medium">{r.kepala_nama}</span>
                  <span className="text-muted"> — {r.nomor_kartu} · {r.klasifikasi_nama}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
