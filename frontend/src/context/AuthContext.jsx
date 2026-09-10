import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, onAuthChange } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Supabase Auth persists the session itself (localStorage) and
    // auto-refreshes the access token in the background - no manual token
    // storage/refresh needed here.
    const unsubscribe = onAuthChange((supabaseUser) => {
      setUser(
        supabaseUser
          ? {
              id: supabaseUser.id,
              email: supabaseUser.email,
              name: supabaseUser.user_metadata?.name || 'Administrator',
            }
          : null
      );
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email, password) => {
    const { user } = await api.login(email, password);
    return user; // onAuthChange also fires and updates state; returning lets Login.jsx navigate immediately
  }, []);

  const logout = useCallback(() => {
    return api.logout();
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
