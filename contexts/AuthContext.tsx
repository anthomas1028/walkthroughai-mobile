import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Linking } from "react-native";

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

function getAuthParameter(url: string, name: string): string | null {
  const queryStart = url.indexOf("?");
  const hashStart = url.indexOf("#");
  const queryEnd = hashStart >= 0 ? hashStart : url.length;

  const queryParameters =
    queryStart >= 0
      ? new URLSearchParams(url.slice(queryStart + 1, queryEnd))
      : null;
  const hashParameters =
    hashStart >= 0 ? new URLSearchParams(url.slice(hashStart + 1)) : null;

  return hashParameters?.get(name) ?? queryParameters?.get(name) ?? null;
}

async function applyAuthCallback(url: string | null) {
  if (!url) {
    return;
  }

  const errorDescription = getAuthParameter(url, "error_description");

  if (errorDescription) {
    throw new Error(errorDescription.replace(/\+/g, " "));
  }

  const authorizationCode = getAuthParameter(url, "code");

  if (authorizationCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      authorizationCode
    );

    if (error) {
      throw error;
    }

    return;
  }

  const accessToken = getAuthParameter(url, "access_token");
  const refreshToken = getAuthParameter(url, "refresh_token");

  if (!accessToken || !refreshToken) {
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }
}

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
    function handleUrl({ url }: { url: string }) {
      applyAuthCallback(url).catch((error) => {
        console.warn("Authentication link error:", error);
      });
    }

    Linking.getInitialURL()
      .then(applyAuthCallback)
      .catch((error) => {
        console.warn("Initial authentication link error:", error);
      });

    const subscription = Linking.addEventListener("url", handleUrl);

    return () => {
      subscription.remove();
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
