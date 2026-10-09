import { useCallback, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useModalLayer } from "../../context/ModalStackContext";
import { playModalWarningSound } from "../../lib/ui-warning-sound";
import { cn } from "../../lib/utils";

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  elevated,
  /** Jika true, klik backdrop menutup modal (perilaku lama). Default: blokir + suara peringatan. */
  dismissOnBackdrop = false,
  /** Jika false, Esc tidak menutup modal. Default: true. */
  closeOnEscape = true,
  /** Dipanggil saat Enter ditekan (hanya layer teratas). */
  onEnter,
  canClose = true,
  canEnter = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Area aksi tetap di bawah (tidak ikut scroll). */
  footer?: ReactNode;
  className?: string;
  /** Tampil di atas modal lain (mis. dialog simpan sebelum keluar). */
  elevated?: boolean;
  dismissOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  onEnter?: () => void;
  canClose?: boolean;
  canEnter?: boolean;
}) {
  const [shake, setShake] = useState(false);

  useModalLayer({
    open,
    onClose,
    onEnter,
    closeOnEscape,
    canClose,
    canEnter,
  });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleBackdropPointer = useCallback(() => {
    if (dismissOnBackdrop) {
      onClose();
      return;
    }
    playModalWarningSound();
    setShake(true);
    window.setTimeout(() => setShake(false), 280);
  }, [dismissOnBackdrop, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center sm:items-center",
        "p-0 sm:p-4",
        "pb-[env(safe-area-inset-bottom)]",
        elevated ? "z-[60]" : "z-50"
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="absolute inset-0 bg-copper-950/45 backdrop-blur-[2px] cursor-default"
        aria-hidden
        onMouseDown={(e) => {
          e.preventDefault();
          handleBackdropPointer();
        }}
      />
      <div
        className={cn(
          "relative z-10 flex w-full max-w-lg flex-col overflow-hidden",
          "max-h-[min(92dvh,760px)] sm:max-h-[min(90vh,720px)]",
          "rounded-t-2xl border border-copper-300/75 bg-card shadow-xl shadow-copper-950/20",
          "sm:rounded-lg",
          shake && "animate-modal-shake",
          className
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-copper-300/90 bg-copper-100 px-3 py-2.5 sm:px-4">
          <h3
            id="modal-title"
            className="min-w-0 truncate text-sm font-semibold leading-snug tracking-tight text-copper-950 sm:text-base"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-copper-600 hover:bg-copper-200/70 hover:text-copper-900 sm:h-8 sm:w-8"
            aria-label="Tutup"
            disabled={!canClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card p-3 text-base leading-snug sm:p-4">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-copper-200 bg-card px-3 py-2.5 sm:px-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
