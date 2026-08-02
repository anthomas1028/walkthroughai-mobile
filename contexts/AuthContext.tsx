import type { Session } from "@supabase/supabase-js";
import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";

import { API_BASE_URL, apiFetch } from "../lib/api";
import { supabase } from "../lib/supabase";

type Workspace = {
  id: string;
  name: string;
  role: string;
};

type AuthContextValue = {
  session: Session | null;
  workspace: Workspace | null;
  isLoading: boolean;
  refreshWorkspace: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshWorkspace() {
    const response = await apiFetch(`${API_BASE_URL}/api/me`);
    const text = await response.text();
    const data = JSON.parse(text);

    if (!response.ok || !data.success || !data.workspace) {
      throw new Error(data.error || "Your workspace could not be loaded.");
    }

    setWorkspace(data.workspace);
  }

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);

        if (!nextSession) {
          setWorkspace(null);
        }

        setIsLoading(false);
      }
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    refreshWorkspace().catch((error) => {
      console.warn("Workspace loading error:", error);
    });
  }, [session?.access_token]);

  async function signOut() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    setWorkspace(null);
  }

  const value = useMemo(
    () => ({
      session,
      workspace,
      isLoading,
      refreshWorkspace,
      signOut,
    }),
    [session, workspace, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}
