import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError, setWorkspaceLockedHandler } from '../utils/apiClient';
import { TOKEN_KEY } from '../utils/constants';
import {
  clearAuthStorage,
  getAuthSession,
  isWorkspaceLocked,
  persistWorkspaceFromUser,
} from '../utils/workspaceStorage';
import { hasPermission } from '../utils/permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => getAuthSession());
  // Solo bloquear UI si hay token pero aún no hay sesión en caché
  const [loading, setLoading] = useState(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    return Boolean(token) && !getAuthSession();
  });
  const refreshingRef = useRef(false);

  const applySession = useCallback((payload) => {
    const next = persistWorkspaceFromUser(payload);
    setSession(next);
    return next;
  }, []);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setSession(null);
      setLoading(false);
      return null;
    }

    if (refreshingRef.current) return getAuthSession();
    refreshingRef.current = true;

    const hadCache = Boolean(getAuthSession());
    if (!hadCache) setLoading(true);

    try {
      const data = await apiFetch('/user', { method: 'GET' });
      return applySession(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAuthStorage();
        setSession(null);
        return null;
      }
      return getAuthSession();
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    setWorkspaceLockedHandler(() => navigate('/billing-locked', { replace: true }));
    // Con caché: entrar ya; refrescar /user en segundo plano
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  const logout = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      apiFetch('/logout', { method: 'POST' }).catch(() => {});
    }
    clearAuthStorage();
    setSession(null);
    setLoading(false);
    navigate('/landing', { replace: true });
  }, [navigate]);

  const switchWorkspace = useCallback(
    async (workspaceId) => {
      const data = await apiFetch('/me/workspace', {
        method: 'POST',
        body: JSON.stringify({ workspace_id: Number(workspaceId) }),
      });
      return applySession(data);
    },
    [applySession]
  );

  const loginWithResponse = useCallback(
    (data) => {
      if (data?.token) localStorage.setItem(TOKEN_KEY, data.token);
      const next = applySession(data);
      setLoading(false);
      return next;
    },
    [applySession]
  );

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      currentWorkspace: session?.current_workspace ?? null,
      workspaces: session?.workspaces ?? [],
      subscription: session?.current_workspace?.subscription ?? null,
      permissions: session?.current_workspace?.membership?.permissions ?? [],
      role: session?.current_workspace?.membership?.role ?? null,
      loading,
      locked: isWorkspaceLocked(session),
      refresh,
      logout,
      switchWorkspace,
      loginWithResponse,
      can: (perm) => hasPermission(session, perm),
    }),
    [session, loading, refresh, logout, switchWorkspace, loginWithResponse]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
