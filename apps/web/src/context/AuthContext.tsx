import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

  useEffect(() => {
    // Check if user is logged in
    fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.user) setUser(data.user);
        } else if (res.status !== 401) {
          console.warn(`Auth check failed with status: ${res.status}`);
        }
      })
      .catch((err) => {
        // Network error or fetch failure
        console.error('Auth check failed:', err);
      })
      .finally(() => setLoading(false));
  }, []);

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
