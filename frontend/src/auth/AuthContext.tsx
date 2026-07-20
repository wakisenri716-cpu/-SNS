import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setAuthToken } from "../api/client";
import type { AuthUser, Municipality } from "../types";

interface AuthState {
  user: AuthUser | null;
  municipality: Municipality | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerUser: (email: string, password: string, name: string) => Promise<void>;
  registerMunicipality: (input: {
    email: string;
    password: string;
    name: string;
    municipalityName: string;
    prefecture: string;
  }) => Promise<void>;
  logout: () => void;
  setMunicipality: (m: Municipality) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "tourism-sns-auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [municipality, setMunicipalityState] = useState<Municipality | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setToken(parsed.token);
        setUser(parsed.user);
        setMunicipalityState(parsed.municipality ?? null);
        setAuthToken(parsed.token);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
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

  function logout() {
    setToken(null);
    setUser(null);
    setMunicipalityState(null);
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  function setMunicipality(m: Municipality) {
    setMunicipalityState(m);
    if (token && user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user, municipality: m }));
    }
  }

  const value = useMemo(
    () => ({ user, municipality, token, login, registerUser, registerMunicipality, logout, setMunicipality }),
    [user, municipality, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
