import { Check, X } from "lucide-react";
import type { NyadaSuggestion } from "../../lib/nyada-ketentuan";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

export function KramaNyadaSuggestionDialog({
  open,
  suggestion,
  onApplyJenis,
  onSaveWithoutChange,
  onCancel,
}: {
  open: boolean;
  suggestion: NyadaSuggestion | null;
  onApplyJenis: () => void;
  onSaveWithoutChange: () => void;
  onCancel: () => void;
}) {
  if (!suggestion) return null;

  return (
    <Modal open={open} title="Saran perubahan jenis krama" onClose={onCancel} elevated>
      <div className="space-y-4">
        <p className="text-sm text-copper-800 leading-relaxed">
          Umur Pengarep saat ini <strong>{suggestion.umurPengarep} tahun</strong>, sudah mencapai
          atau melebihi Batas Umur Nyada ({suggestion.batasUmur} tahun) pada Pengaturan.
          Disarankan mengubah{" "}
          <strong>Jenis Krama Mipil</strong> menjadi{" "}
          <strong>{suggestion.jenisNyadaNama}</strong> sesuai ketentuan Nyada/Luput di Pengaturan.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 border-t border-copper-100">
          <Button type="button" icon={Check} onClick={onApplyJenis}>
            Ubah jenis krama
          </Button>
          <Button type="button" variant="secondary" onClick={onSaveWithoutChange}>
            Simpan tanpa mengubah
          </Button>
          <Button type="button" variant="ghost" icon={X} onClick={onCancel}>
            Batal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
