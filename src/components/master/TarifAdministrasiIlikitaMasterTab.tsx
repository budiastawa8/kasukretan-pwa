import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import {
  listTarifAdministrasiIlikita,
  TARIF_ADMIN_ILIKITA_LABELS,
  updateTarifAdministrasiIlikita,
} from "../../lib/services/tarif-administrasi-ilikita";
import type { TarifAdministrasiIlikitaJenis, TarifAdministrasiIlikitaRow } from "../../lib/types";
import { MASTER_CARD_PHONE, MASTER_CARD_TITLED, MASTER_PAGE } from "./master-compact";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { RupiahInput } from "../ui/RupiahInput";
import { parseRupiahDigits, type RupiahInputValue } from "../../lib/rupiah-input";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";

export function TarifAdministrasiIlikitaMasterTab({
  canEdit,
  onSaved,
  onError,
}: {
  canEdit: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const isPhone = useIsPhoneClient();
  const [rows, setRows] = useState<TarifAdministrasiIlikitaRow[]>([]);
  const [draft, setDraft] = useState<Record<string, RupiahInputValue>>({});
  const [savingJenis, setSavingJenis] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await listTarifAdministrasiIlikita();
    setRows(list);
    const next: Record<string, RupiahInputValue> = {};
    for (const r of list) {
      next[r.jenis] = Math.round(Number(r.nominal) || 0);
    }
    setDraft(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function saveRow(jenis: TarifAdministrasiIlikitaJenis) {
    const nominal = parseRupiahDigits(draft[jenis] ?? 0);
    setSavingJenis(jenis);
    try {
      await updateTarifAdministrasiIlikita(jenis, nominal);
      onSaved(`Tarif ${TARIF_ADMIN_ILIKITA_LABELS[jenis]} disimpan`);
      await refresh();
    } catch (e) {
      onError(String(e));
    } finally {
      setSavingJenis(null);
    }
  }

  return (
    <div className={MASTER_PAGE}>
      <Card
        title="Tarif Administrasi Ilikita"
        className={cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE)}
      >
        <p className="text-sm text-muted mb-3 leading-snug">
          Nominal biaya administrasi untuk surat IPMA (Mautsaha Adat) dan pendaftaran/perpanjangan
          Pemasih. Biaya dicatat ke Dana Kasukretan Lainnya jika nominal &gt; 0.
        </p>
        {!isPhone && (
          <div className="text-xs font-semibold text-copper-800 grid grid-cols-[1fr_8rem_4rem] gap-2 px-1 pb-1 border-b border-copper-200">
            <span>Jenis</span>
            <span className="text-center">Nominal</span>
            <span />
          </div>
        )}
        <ul className={cn("text-sm", isPhone ? "space-y-2" : "divide-y divide-copper-100")}>
          {rows.map((r) => (
            <li
              key={r.jenis}
              className={cn(
                isPhone
                  ? "rounded-lg border border-copper-200 bg-copper-50/40 px-3 py-2.5 space-y-2"
                  : "grid grid-cols-[1fr_8rem_4rem] gap-2 items-center py-2 px-1"
              )}
            >
              <span className="font-medium text-copper-950 leading-tight">
                {TARIF_ADMIN_ILIKITA_LABELS[r.jenis as TarifAdministrasiIlikitaJenis]}
              </span>
              <RupiahInput
                value={draft[r.jenis] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [r.jenis]: v }))}
                disabled={!canEdit || savingJenis === r.jenis}
              />
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  disabled={savingJenis === r.jenis}
                  className={cn(isPhone && "h-10 w-full")}
                  onClick={() => void saveRow(r.jenis as TarifAdministrasiIlikitaJenis)}
                >
                  <Check className={cn(isPhone ? "h-4 w-4" : "h-3.5 w-3.5")} />
                  {isPhone ? " Simpan" : null}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
