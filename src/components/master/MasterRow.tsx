import { Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";

export function MasterRow({
  label,
  selected,
  onSelect,
  canEdit,
  onEdit,
  onDelete,
  showDelete = true,
}: {
  label: string;
  selected?: boolean;
  onSelect?: () => void;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Sembunyikan tombol hapus (mis. akun inti). Default true. */
  showDelete?: boolean;
}) {
  const isPhone = useIsPhoneClient();
  const iconBtnClass = isPhone ? "!min-h-10 !min-w-10 !h-10 !p-1.5" : undefined;

  return (
    <li
      className={cn(
        "flex items-center gap-1 py-0.5 px-1 -mx-1 rounded-lg group transition-colors leading-snug",
        isPhone && "py-1.5 px-2",
        onSelect && "cursor-pointer hover:bg-copper-50",
        selected && "bg-copper-100/80 ring-1 ring-copper-300/50"
      )}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      <span
        className={cn(
          "flex-1 text-sm truncate",
          selected ? "font-bold text-copper-800" : "text-copper-900"
        )}
      >
        {label}
      </span>
      {canEdit && (
        <div className="flex gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            icon={Pencil}
            iconOnly
            className={iconBtnClass}
            title="Edit"
            aria-label="Edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          />
          {showDelete && (
            <Button
              type="button"
              variant="ghost"
              icon={Trash2}
              iconOnly
              title="Hapus"
              aria-label="Hapus"
              className={cn(
                "text-red-600 hover:text-red-700 hover:bg-red-50",
                iconBtnClass
              )}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            />
          )}
        </div>
      )}
    </li>
  );
}
