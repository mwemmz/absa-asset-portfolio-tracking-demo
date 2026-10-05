import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearSession, getStoredUser, getToken, storeSession, UNAUTHORISED_EVENT } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [booting, setBooting] = useState(() => !!getToken());

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    const onUnauthorised = () => setUser(null);
    window.addEventListener(UNAUTHORISED_EVENT, onUnauthorised);
    return () => window.removeEventListener(UNAUTHORISED_EVENT, onUnauthorised);
  }, []);

  // A stored token may have been cleared or expired by the server while the tab
  // was closed. Confirm it once on boot.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setBooting(false);
      return undefined;
    }
    api
      .me()
      .then(({ user: me }) => {
        if (cancelled) return;
        setUser(me);
        storeSession({ token: getToken(), user: me });
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const result = await api.login(email, password);
    storeSession({ token: result.token, user: result.user });
    setUser(result.user);
    return result;
  }, []);

  const value = useMemo(
    () => ({ user, booting, signIn, signOut, isAdmin: user?.role === 'admin' }),
    [user, booting, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}