import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";

const ExpoSecureStoreAdapter: {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} = Platform.select({
  web: {
    getItem: async (key: string) => {
      if (typeof sessionStorage === "undefined") return null;
      return sessionStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      if (typeof sessionStorage === "undefined") return;
      sessionStorage.removeItem(key);
    },
  },
  default: {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) =>
      SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
  },
});

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // Important for React Native
  },
});
