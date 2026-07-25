import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setToken, getToken } from '../lib/api';
import type { UserInfo } from '@bookkeeper/shared';

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<any>;
  verify2FA: (email: string, code: string) => Promise<any>;
  register: (email: string, password: string, display_name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<any> => {
    const res = await api.login({ email, password });
    if (res.token) {
      setToken(res.token);
      setUser(res.user!);
    }
    return res;
  };

  const verify2FA = async (email: string, code: string) => {
    const res: any = await api.verify2FA({ email, code });
    setToken(res.token);
    setUser(res.user);
    if (res.device_token) localStorage.setItem('device_token', res.device_token);
  };

  const register = async (email: string, password: string, display_name: string) => {
    const res = await api.register({ email, password, display_name });
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('device_token');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, verify2FA }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
