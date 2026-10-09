import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";

type ModalLayerEntry = {
  id: string;
  onClose: () => void;
  onEnter?: () => void;
  canClose: boolean;
  canEnter: boolean;
};

type ModalStackContextValue = {
  register: (entry: ModalLayerEntry) => void;
  update: (id: string, patch: Partial<Omit<ModalLayerEntry, "id">>) => void;
  unregister: (id: string) => void;
};

const ModalStackContext = createContext<ModalStackContextValue | null>(null);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    return type !== "button" && type !== "submit" && type !== "checkbox" && type !== "radio";
  }
  return target.isContentEditable;
}

export function ModalStackProvider({ children }: { children: ReactNode }) {
  const stackRef = useRef<ModalLayerEntry[]>([]);

  const register = useCallback((entry: ModalLayerEntry) => {
    stackRef.current = [...stackRef.current.filter((e) => e.id !== entry.id), entry];
  }, []);

  const update = useCallback((id: string, patch: Partial<Omit<ModalLayerEntry, "id">>) => {
    stackRef.current = stackRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e));
  }, []);

  const unregister = useCallback((id: string) => {
    stackRef.current = stackRef.current.filter((e) => e.id !== id);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const top = stackRef.current[stackRef.current.length - 1];
      if (!top) return;

      if (e.key === "Escape") {
        if (!top.canClose) return;
        e.preventDefault();
        e.stopPropagation();
        top.onClose();
        return;
      }

      if (e.key === "Enter" && top.onEnter) {
        if (!top.canEnter) return;
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        top.onEnter();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <ModalStackContext.Provider value={{ register, update, unregister }}>
      {children}
    </ModalStackContext.Provider>
  );
}

export function useModalLayer({
  open,
  onClose,
  onEnter,
  closeOnEscape = true,
  canClose = true,
  canEnter = true,
}: {
  open: boolean;
  onClose: () => void;
  onEnter?: () => void;
  closeOnEscape?: boolean;
  canClose?: boolean;
  canEnter?: boolean;
}) {
  const ctx = useContext(ModalStackContext);
  const id = useId();

  useEffect(() => {
    if (!open || !ctx) return;

    ctx.register({
      id,
      onClose,
      onEnter,
      canClose: closeOnEscape && canClose,
      canEnter: canEnter && !!onEnter,
    });

    return () => ctx.unregister(id);
  }, [open, ctx, id, onClose, onEnter, closeOnEscape, canClose, canEnter]);

  useEffect(() => {
    if (!open || !ctx) return;
    ctx.update(id, {
      onClose,
      onEnter,
      canClose: closeOnEscape && canClose,
      canEnter: canEnter && !!onEnter,
    });
  }, [open, ctx, id, onClose, onEnter, closeOnEscape, canClose, canEnter]);
}
