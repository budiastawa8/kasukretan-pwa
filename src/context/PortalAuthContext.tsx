import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  clearPortalSession,
  getPortalUser,
  portalLogin,
  type PortalSessionUser,
} from "../lib/api/portal";

type PortalAuthValue = {
  user: PortalSessionUser | null;
  login: (nomorKartu: string, pin: string) => Promise<void>;
  logout: () => void;
};

const PortalAuthContext = createContext<PortalAuthValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PortalSessionUser | null>(() => getPortalUser());

  const login = useCallback(async (nomorKartu: string, pin: string) => {
    const u = await portalLogin(nomorKartu, pin);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearPortalSession();
    setUser(null);
  }, []);

  return (
    <PortalAuthContext.Provider value={{ user, login, logout }}>
      {children}
    </PortalAuthContext.Provider>
  );
}

export function usePortalAuth() {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error("usePortalAuth must be within PortalAuthProvider");
  return ctx;
}
