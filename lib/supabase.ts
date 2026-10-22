import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Walkthrough AI authentication is not configured. Add the Supabase URL and publishable key to the mobile environment."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      storage: Platform.OS !== "web" || typeof window !== "undefined" ? AsyncStorage : undefined,
      autoRefreshToken: Platform.OS !== "web" || typeof window !== "undefined",
      persistSession: Platform.OS !== "web" || typeof window !== "undefined",
      detectSessionInUrl: false,
    },
  }
);
