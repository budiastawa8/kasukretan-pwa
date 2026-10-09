import { Check, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function UnsavedFormDialog({
  open,
  saving,
  onSave,
  onDiscard,
  onStay,
}: {
  open: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  return (
    <Modal open={open} title="Simpan perubahan?" onClose={onStay}>
      <div className="space-y-4">
        <p className="text-sm text-copper-800 leading-relaxed">
          Ada perubahan pada formulir Krama yang belum disimpan. Apakah Anda ingin menyimpan
          terlebih dahulu sebelum meninggalkan halaman ini?
        </p>
        <div className="flex flex-wrap gap-2 pt-1 border-t border-copper-100">
          <Button type="button" icon={Check} onClick={onSave} disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onDiscard}
            disabled={saving}
          >
            Tidak simpan
          </Button>
          <Button type="button" variant="ghost" icon={X} onClick={onStay} disabled={saving}>
            Batal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
