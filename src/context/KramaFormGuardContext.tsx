import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useBeforeUnload, useLocation, useNavigate } from "react-router-dom";
import { UnsavedFormDialog } from "../components/krama/UnsavedFormDialog";

type FormGuardRegistration = {
  isDirty: boolean;
  onSave: () => Promise<boolean>;
};

type KramaFormGuardContextValue = {
  register: (guard: FormGuardRegistration | null) => void;
  tryNavigate: (to: string) => boolean;
  /** Sembunyikan dialog "simpan sebelum keluar" saat dialog lain (mis. saran Nyada) terbuka. */
  setSuppressUnsavedDialog: (suppress: boolean) => void;
};

const KramaFormGuardContext = createContext<KramaFormGuardContextValue | null>(null);

export function KramaFormGuardProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [guard, setGuard] = useState<FormGuardRegistration | null>(null);
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const [guardSaving, setGuardSaving] = useState(false);
  const [suppressUnsavedDialog, setSuppressUnsavedDialog] = useState(false);

  const register = useCallback((next: FormGuardRegistration | null) => {
    setGuard(next);
  }, []);

  const tryNavigate = useCallback(
    (to: string) => {
      if (!guard?.isDirty) return true;
      const target = to.split("?")[0]?.split("#")[0] ?? to;
      const current = location.pathname;
      if (target === current) return true;
      setPendingTo(to);
      return false;
    },
    [guard?.isDirty, location.pathname]
  );

  const stay = useCallback(() => setPendingTo(null), []);

  const goPending = useCallback(
    (to: string | null) => {
      if (!to) return;
      if (to === "__back__") {
        navigate(-1);
        return;
      }
      navigate(to);
    },
    [navigate]
  );

  const discard = useCallback(() => {
    const to = pendingTo;
    setPendingTo(null);
    goPending(to);
  }, [goPending, pendingTo]);

  const saveAndLeave = useCallback(async () => {
    if (!guard?.onSave || guardSaving) return;
    setGuardSaving(true);
    try {
      const ok = await guard.onSave();
      if (!ok) return;
      const to = pendingTo;
      setPendingTo(null);
      goPending(to);
    } finally {
      setGuardSaving(false);
    }
  }, [guard, guardSaving, goPending, pendingTo]);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (guard?.isDirty) {
          event.preventDefault();
        }
      },
      [guard?.isDirty]
    )
  );

  useEffect(() => {
    if (!guard?.isDirty) return;
    const url = window.location.href;
    const onPopState = () => {
      window.history.pushState(null, "", url);
      setPendingTo("__back__");
    };
    window.history.pushState(null, "", url);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [guard?.isDirty, location.pathname, location.search, location.hash]);

  const value = useMemo(
    () => ({ register, tryNavigate, setSuppressUnsavedDialog }),
    [register, tryNavigate]
  );

  return (
    <KramaFormGuardContext.Provider value={value}>
      {children}
      <UnsavedFormDialog
        open={pendingTo !== null && !suppressUnsavedDialog}
        saving={guardSaving}
        onSave={() => void saveAndLeave()}
        onDiscard={discard}
        onStay={stay}
      />
    </KramaFormGuardContext.Provider>
  );
}

export function useKramaFormGuard() {
  const ctx = useContext(KramaFormGuardContext);
  if (!ctx) {
    throw new Error("useKramaFormGuard must be used within KramaFormGuardProvider");
  }
  return ctx;
}

export function useGuardedNavigate() {
  const navigate = useNavigate();
  const { tryNavigate } = useKramaFormGuard();
  return useCallback(
    (to: string, options?: { replace?: boolean }) => {
      if (tryNavigate(to)) {
        navigate(to, options);
      }
    },
    [navigate, tryNavigate]
  );
}
