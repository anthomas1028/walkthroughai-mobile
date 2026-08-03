import { supabase } from "./supabase";

export const API_BASE_URL = "https://walkthroughai-api.onrender.com";

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

  return fetch(input, {
    ...init,
    headers,
  });
}
