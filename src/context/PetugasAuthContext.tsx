import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import {
  apiLogin,
  clearApiSession,
  getApiUser,
  type ApiSessionUser,
} from "../lib/api/petugas";

type PetugasAuthValue = {
  user: ApiSessionUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const PetugasAuthContext = createContext<PetugasAuthValue | null>(null);

export function PetugasAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ApiSessionUser | null>(() => getApiUser());

  const login = useCallback(async (username: string, password: string) => {
    const u = await apiLogin(username, password);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    clearApiSession();
    setUser(null);
  }, []);

  return (
    <PetugasAuthContext.Provider value={{ user, login, logout }}>
      {children}
    </PetugasAuthContext.Provider>
  );
}

export function usePetugasAuth() {
  const ctx = useContext(PetugasAuthContext);
  if (!ctx) throw new Error("usePetugasAuth must be within PetugasAuthProvider");
  return ctx;
}
