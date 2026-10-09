import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { SessionUser } from "../lib/services/auth";
import { refreshSessionUser, SESSION_USER_KEY } from "../lib/services/auth";
import {
  clearLanSession,
  getLanToken,
  lanLogout,
  SESSION_EXPIRED_EVENT,
} from "../lib/lan-client";

interface AuthContextValue {
  user: SessionUser | null;
  setUser: (u: SessionUser | null) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): SessionUser | null {
  const raw = localStorage.getItem(SESSION_USER_KEY);
  if (!raw || !getLanToken()) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readStoredUser);

  const setUserPersist = useCallback((u: SessionUser | null) => {
    setUser(u);
    if (u) localStorage.setItem(SESSION_USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(SESSION_USER_KEY);
  }, []);

  const logout = useCallback(() => {
    void lanLogout();
    clearLanSession();
    setUserPersist(null);
  }, [setUserPersist]);

  const refreshUser = useCallback(async () => {
    if (!user?.id) return;
    try {
      const fresh = await refreshSessionUser(user.id);
      if (!fresh) {
        logout();
        return;
      }
      setUserPersist(fresh);
    } catch {
      if (!getLanToken()) logout();
    }
  }, [user?.id, logout, setUserPersist]);

  useEffect(() => {
    const stored = readStoredUser();
    if (!stored) return;
    void refreshSessionUser(stored.id)
      .then((fresh) => {
        if (!fresh) logout();
        else setUserPersist(fresh);
      })
      .catch(() => {
        if (!getLanToken()) logout();
      });
  }, [logout, setUserPersist]);

  useEffect(() => {
    const onExpired = () => setUserPersist(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [setUserPersist]);

  return (
    <AuthContext.Provider value={{ user, setUser: setUserPersist, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be within AuthProvider");
  return ctx;
}
