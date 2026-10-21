import { supabase } from "./supabase";

export const API_BASE_URL = "https://walkthroughai-api.onrender.com";

export async function getCurrentUserEmail(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user?.email?.trim() || "";
}

export async function apiFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your session ended. Sign in and try again.");
  }

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${session.access_token}`);

  const controller = new AbortController();
  const finalizing = input.split("?")[0].endsWith("/api/finalize");
  const timer = init.signal ? undefined : setTimeout(() => controller.abort(), finalizing ? 300000 : 30000);
  try {
    const response = await fetch(input, { ...init, headers, signal: init.signal || controller.signal });
    if (response.status === 401) throw new Error("Your session expired. Sign out and sign in again.");
    return response;
  } catch (error) {
    if (!init.signal && controller.signal.aborted) {
      const timeoutError = new Error(finalizing
        ? "Saving took longer than expected. Your report may already be saved. Check this customer's History before retrying; do not restart the analysis."
        : "The connection timed out. Check your internet connection and try again.");
      if (finalizing) timeoutError.name = "FinalizationPendingError";
      throw timeoutError;
    }
    throw error;
  } finally { if (timer) clearTimeout(timer); }
}
