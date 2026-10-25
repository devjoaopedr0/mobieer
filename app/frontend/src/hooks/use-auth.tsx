import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api, apiPost, getToken, setToken } from "@/services/api";
import type { AuthUser } from "@/types";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Há login guardado, mas o servidor não respondeu: a tela oferece tentar de novo. */
  sessionError: boolean;
  /** Devolve `mfaToken` quando a conta pede o código do autenticador antes de entrar. */
  login: (email: string, password: string) => Promise<{ mfaToken?: string }>;
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Quem estava logado neste navegador. Sair não apaga mais o que as telas já
 * carregaram: entrando de novo a mesma pessoa, as telas aparecem na hora e se
 * atualizam por trás. Entrando outra pessoa, o cache é apagado antes.
 */
const LAST_USER_KEY = "mobieer_last_user";
const lastUser = () => {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
};
const rememberUser = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LAST_USER_KEY, id);
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // sem armazenamento: só perde o reaproveitamento do cache
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [initialToken] = useState(() => getToken());
  const [user, setUser] = useState<AuthUser | null>(null);

  const {
    data: meData,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["me"],
    // Sem tempo limite, um pedido que o servidor não respondia deixava a tela em
    // "Carregando sessão..." até a pessoa recarregar. Agora desiste em 10 s e
    // tenta de novo sozinho, que é o que o recarregar fazia.
    queryFn: () => api<{ data: AuthUser }>("/auth/me", { timeoutMs: 10_000 }),
    enabled: Boolean(initialToken),
    // sessão recusada (401/403) não adianta repetir; rede, demora e 5xx, sim
    retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status < 500),
    retryDelay: 800,
  });

  // Copia o usuário no mesmo render em que /auth/me responde. Com useEffect
  // havia um render "carregado, sem usuário": o guard mandava para /login e
  // o link direto (ou recarregar a página) acabava no Dashboard.
  const [syncedMe, setSyncedMe] = useState(meData);
  if (meData !== syncedMe) {
    setSyncedMe(meData);
    if (meData) setUser(meData.data);
  }

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      rememberUser(null);
      queryClient.clear();
    };
    window.addEventListener("mobieer:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("mobieer:unauthorized", handleUnauthorized);
  }, [queryClient]);

  const startSession = useCallback(
    (token: string, next: AuthUser) => {
      // outra pessoa neste navegador: nada do cache anterior pode aparecer para ela
      if (lastUser() !== next.id) queryClient.clear();
      else void queryClient.invalidateQueries();
      rememberUser(next.id);
      setToken(token);
      setUser(next);
    },
    [queryClient]
  );

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<{ data: { token?: string; user?: AuthUser; mfaRequired?: boolean; mfaToken?: string } }>("/auth/login", { method: "POST", body: credentials }),
    onSuccess: (data) => {
      // com verificação em duas etapas a sessão só vem depois do código
      if (!data.data.token || !data.data.user) return;
      startSession(data.data.token, data.data.user);
    },
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await loginMutation.mutateAsync({ email, password });
      return r.data.mfaRequired && r.data.mfaToken ? { mfaToken: r.data.mfaToken } : {};
    },
    [loginMutation]
  );

  const verifyMfa = useCallback(async (mfaToken: string, code: string) => {
    const r = await api<{ data: { token: string; user: AuthUser } }>("/auth/mfa/verify", { method: "POST", body: { mfaToken, code } });
    startSession(r.data.token, r.data.user);
  }, [startSession]);

  const logout = useCallback(async () => {
    // o aviso ao servidor (registro de saída) sai com o token de agora e não segura a tela:
    // antes, sair esperava a resposta inteira para só então ir ao login
    void apiPost("/auth/logout").catch(() => undefined);
    setToken(null);
    setUser(null);
    // param as atualizações automáticas (avisos, chat) até alguém entrar de novo
    void queryClient.cancelQueries();
  }, [queryClient]);

  const can = useCallback(
    (permission: string) => Boolean(user?.permissions.includes(permission)),
    [user]
  );

  const value = useMemo(
    () => ({
      user,
      isLoading: Boolean(initialToken) && isLoading && !user,
      isAuthenticated: Boolean(user),
      // o 401 apaga o token (aí é login mesmo); com o token ainda guardado, foi o servidor que não respondeu
      sessionError: Boolean(initialToken) && isError && !isFetching && !user && Boolean(getToken()),
      login,
      verifyMfa,
      logout,
      can,
      // relê o /auth/me (ex.: depois de trocar a senha obrigatória)
      refresh: async () => {
        const r = await refetch();
        if (r.data) setUser(r.data.data);
      },
    }),
    [user, initialToken, isLoading, isError, isFetching, login, verifyMfa, logout, can, refetch]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
