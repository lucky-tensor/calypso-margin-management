import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

export type Role = 'sales_rep' | 'inventory_manager' | 'admin';

export interface User {
  id: string;
  username: string;
  role: Role;
  display_name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const defaultAuthContext: AuthContextType = {
  user: null,
  loading: false,
  setUser: () => {},
  logout: async () => {},
};

const AuthContext = createContext<AuthContextType>(defaultAuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Calls GET /api/auth/me and updates local user state.
   * Returns true if the session is still valid, false on 401 or network error.
   *
   * Mid-session expiry handling (issue #129):
   * When the response is 401 the user is set to null, causing the login screen
   * to render automatically — no page reload required.
   */
  const checkSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          return true;
        }
      } else if (res.status === 401) {
        // Token has expired or was revoked — clear the session immediately
        setUser(null);
        return false;
      } else {
        console.warn(`Auth check failed with status: ${res.status}`);
      }
    } catch (err) {
      // Network error or fetch failure
      console.error('Auth check failed:', err);
    }
    return false;
  }, []);

  // Initial session check on mount
  useEffect(() => {
    checkSession().finally(() => setLoading(false));
  }, [checkSession]);

  // Re-validate the session when the browser tab becomes visible after being
  // hidden (e.g. the user switches back from another tab). This ensures that
  // a token that expired while the tab was inactive is detected promptly and
  // the login screen is shown without requiring a page reload.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        checkSession();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkSession]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
