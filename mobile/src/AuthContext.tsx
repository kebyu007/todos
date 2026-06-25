import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError, apiRequest, login, refresh, register } from './api';
import type { AuthResult, User } from './types';

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';
const USER_KEY = 'user';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: {
    email: string;
    username: string;
    password: string;
    timezone: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  // Authenticated request that injects the bearer token and transparently
  // refreshes it once on a 401.
  authedRequest: <T>(
    path: string,
    opts?: { method?: string; body?: unknown },
  ) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Kept in refs so authedRequest always sees the latest tokens without
  // re-creating the callback.
  const accessToken = useRef<string | null>(null);
  const refreshToken = useRef<string | null>(null);

  const persist = useCallback(async (result: AuthResult) => {
    accessToken.current = result.accessToken;
    refreshToken.current = result.refreshToken;
    setUser(result.user);
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, result.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, result.refreshToken),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(result.user)),
    ]);
  }, []);

  const clear = useCallback(async () => {
    accessToken.current = null;
    refreshToken.current = null;
    setUser(null);
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
  }, []);

  // Restore a saved session on launch.
  useEffect(() => {
    (async () => {
      try {
        const [at, rt, rawUser] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_KEY),
          SecureStore.getItemAsync(REFRESH_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);
        if (at && rt && rawUser) {
          accessToken.current = at;
          refreshToken.current = rt;
          setUser(JSON.parse(rawUser));
        }
      } finally {
        setInitializing(false);
      }
    })();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await persist(await login(email, password));
    },
    [persist],
  );

  const signUp = useCallback(
    async (input: {
      email: string;
      username: string;
      password: string;
      timezone: string;
    }) => {
      await persist(await register(input));
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    try {
      if (accessToken.current) {
        await apiRequest('/api/auth/logout', {
          method: 'POST',
          token: accessToken.current,
        });
      }
    } catch {
      // best-effort; clear locally regardless
    }
    await clear();
  }, [clear]);

  const authedRequest = useCallback(
    async <T,>(
      path: string,
      opts: { method?: string; body?: unknown } = {},
    ): Promise<T> => {
      try {
        return await apiRequest<T>(path, {
          ...opts,
          token: accessToken.current,
        });
      } catch (err) {
        // Access token likely expired — refresh once and retry.
        if (err instanceof ApiError && err.status === 401 && refreshToken.current) {
          try {
            const result = await refresh(refreshToken.current);
            await persist(result);
          } catch {
            await clear();
            throw err;
          }
          return apiRequest<T>(path, { ...opts, token: accessToken.current });
        }
        throw err;
      }
    },
    [persist, clear],
  );

  const value = useMemo(
    () => ({ user, initializing, signIn, signUp, signOut, authedRequest }),
    [user, initializing, signIn, signUp, signOut, authedRequest],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
