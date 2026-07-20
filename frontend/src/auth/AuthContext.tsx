import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAuthToken, setUnauthorizedHandler } from "../api/client";
import type { AuthUser, Municipality } from "../types";

interface AuthState {
  user: AuthUser | null;
  municipality: Municipality | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerUser: (email: string, password: string, name: string) => Promise<void>;
  registerMunicipality: (input: {
    email: string;
    password: string;
    name: string;
    municipalityName: string;
    prefecture: string;
  }) => Promise<void>;
  logout: (notice?: string) => void;
  setMunicipality: (m: Municipality) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "tourism-sns-auth";
export const AUTH_NOTICE_KEY = "tourism-sns-auth-notice";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [municipality, setMunicipalityState] = useState<Municipality | null>(null);
  const [ready, setReady] = useState(false);

  function logout(notice?: string) {
    setToken(null);
    setUser(null);
    setMunicipalityState(null);
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
    if (notice) sessionStorage.setItem(AUTH_NOTICE_KEY, notice);
  }

  useEffect(() => {
    setUnauthorizedHandler(() => logout("セッションが切れました。もう一度ログインしてください。"));
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setAuthToken(parsed.token);
      // Validate the token against the server instead of trusting local storage —
      // see the comment in api/client.ts for why a locally-saved session can be stale.
      api
        .get("/auth/me")
        .then(({ data }) => {
          setToken(parsed.token);
          setUser(data.user);
          setMunicipalityState(data.municipality);
        })
        .catch(() => {
          logout();
        })
        .finally(() => setReady(true));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setReady(true);
    }
  }, []);

  function persist(next: { token: string; user: AuthUser; municipality: Municipality | null }) {
    setToken(next.token);
    setUser(next.user);
    setMunicipalityState(next.municipality);
    setAuthToken(next.token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function login(email: string, password: string) {
    const { data } = await api.post("/auth/login", { email, password });
    persist({ token: data.token, user: data.user, municipality: data.municipality });
  }

  async function registerUser(email: string, password: string, name: string) {
    const { data } = await api.post("/auth/register", { email, password, name });
    persist({ token: data.token, user: data.user, municipality: null });
  }

  async function registerMunicipality(input: {
    email: string;
    password: string;
    name: string;
    municipalityName: string;
    prefecture: string;
  }) {
    const { data } = await api.post("/auth/register-municipality", input);
    persist({ token: data.token, user: data.user, municipality: data.municipality });
  }

  function setMunicipality(m: Municipality) {
    setMunicipalityState(m);
    if (token && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, municipality: m }));
    }
  }

  const value = useMemo(
    () => ({ user, municipality, token, ready, login, registerUser, registerMunicipality, logout, setMunicipality }),
    [user, municipality, token, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
