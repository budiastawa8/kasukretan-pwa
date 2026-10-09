import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "../ui/Button";
import { LIST_BODY_ROW, LIST_HEAD_ROW, LIST_TABLE_ELEMENT } from "../ui/list-compact";

export type ImportPreviewError = {
  sheet: string;
  excelRow?: number | string | null;
  column?: string;
  message: string;
};

export type ImportPreviewSummary = {
  sheet: string;
  creates: number;
  updates: number;
  errors: number;
};

export type ImportPreviewWarning = {
  sheet: string;
  excelRow?: number | string | null;
  message: string;
};

export function ImportPreviewPanel({
  filename,
  summaries,
  errors,
  warnings = [],
  canCommit,
  busy,
  canEdit,
  onCommit,
  showSheetTable = true,
  commitLabel = "Simpan ke database",
}: {
  filename: string;
  summaries?: ImportPreviewSummary[];
  errors: ImportPreviewError[];
  warnings?: ImportPreviewWarning[];
  canCommit: boolean;
  busy: boolean;
  canEdit: boolean;
  onCommit: () => void;
  showSheetTable?: boolean;
  commitLabel?: string;
}) {
  const [showDetails, setShowDetails] = useState(true);

  const totalCreates = summaries?.reduce((s, x) => s + x.creates, 0) ?? 0;
  const totalUpdates = summaries?.reduce((s, x) => s + x.updates, 0) ?? 0;
  const totalErrors = errors.length;
  const detailCount = totalErrors + warnings.length;

  return (
    <div className="space-y-3 rounded-lg border border-copper-200 bg-copper-50/50 p-3">
      <p className="text-sm font-medium">Pratinjau: {filename}</p>
      <div className="flex flex-wrap gap-2 text-sm">
        {(summaries?.length ?? 0) > 0 && (
          <>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
              {totalCreates} tambah
            </span>
            <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-200">
              {totalUpdates} update
            </span>
          </>
        )}
        {totalErrors > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-200">
            {totalErrors} error
          </span>
        )}
        {warnings.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
            {warnings.length} dilewati
          </span>
        )}
      </div>

      {showSheetTable && summaries && summaries.length > 0 && (
        <table className={LIST_TABLE_ELEMENT}>
          <thead>
            <tr className={LIST_HEAD_ROW}>
              <th>Sheet</th>
              <th>Tambah</th>
              <th>Update</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.sheet} className={LIST_BODY_ROW}>
                <td>{s.sheet}</td>
                <td>{s.creates}</td>
                <td>{s.updates}</td>
                <td>{s.errors}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {detailCount > 0 && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-copper-800"
            onClick={() => setShowDetails((v) => !v)}
          >
            {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Detail{totalErrors > 0 && !warnings.length ? ` error (${totalErrors})` : ` (${detailCount})`}
          </button>
          {showDetails && (
            <ul className="mt-1 max-h-40 overflow-y-auto text-xs space-y-0.5">
              {errors.map((err, i) => (
                <li key={`e-${i}`} className="text-red-800">
                  [{err.sheet} baris {err.excelRow || "—"}
                  {err.column ? ` / ${err.column}` : ""}] {err.message}
                </li>
              ))}
              {warnings.map((w, i) => (
                <li key={`w-${i}`} className="text-amber-900">
                  [{w.sheet} baris {w.excelRow || "—"}] {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canEdit && (
        <Button icon={Check} onClick={onCommit} disabled={busy || !canCommit}>
          {commitLabel}
        </Button>
      )}
    </div>
  );
}
