/**
 * Sign-in. People sign in with Google through Supabase Auth; supabase-js keeps the session in
 * the browser and refreshes its token. When the server has development sign-in on, a named
 * test person can sign in instead; that token lives in sessionStorage, so each tab can be a
 * different person (a GM tab beside a player tab).
 */
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { type Config, type User, api, setTokenSource } from "./api.ts";

const DEV_TOKEN = "gradebreaker.devToken";

export interface AuthState {
  status: "loading" | "signed-out" | "signed-in";
  via?: "google" | "dev";
  user?: User;
}

let state: AuthState = { status: "loading" };
const listeners = new Set<() => void>();
let supabase: SupabaseClient | null = null;
let config: Config | null = null;

function set(next: AuthState) {
  state = next;
  for (const l of listeners) l();
}

async function token(): Promise<string | null> {
  const dev = sessionStorage.getItem(DEV_TOKEN);
  if (dev) return dev;
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function refreshUser(via: "google" | "dev") {
  try {
    const me = await api<{ user: User }>("GET", "/me");
    set({ status: "signed-in", via, user: me.user });
  } catch {
    if (via === "dev") sessionStorage.removeItem(DEV_TOKEN);
    set({ status: "signed-out" });
  }
}

export async function initAuth(): Promise<Config> {
  config = await api<Config>("GET", "/config");
  setTokenSource(token);
  if (config.supabaseUrl && config.supabasePublishableKey) {
    supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
    });
    supabase.auth.onAuthStateChange((event, session) => {
      if (sessionStorage.getItem(DEV_TOKEN)) return;
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) void refreshUser("google");
      else if (!session) set({ status: "signed-out" });
    });
  }
  if (sessionStorage.getItem(DEV_TOKEN)) await refreshUser("dev");
  else if (!supabase) set({ status: "signed-out" });
  return config;
}

export function authConfig(): Config | null {
  return config;
}

/** Leaves for Google and returns to `returnTo` (the current page by default). */
export async function signInWithGoogle(returnTo = window.location.href) {
  if (!supabase) throw new Error("Google sign-in is not configured on this server");
  await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: returnTo } });
}

export async function devSignIn(name: string) {
  const { token } = await api<{ token: string }>("POST", "/dev/sign-in", { name });
  sessionStorage.setItem(DEV_TOKEN, token);
  await refreshUser("dev");
}

export async function signOut() {
  sessionStorage.removeItem(DEV_TOKEN);
  if (supabase) await supabase.auth.signOut();
  set({ status: "signed-out" });
}

export function setUser(user: User) {
  if (state.status === "signed-in") set({ ...state, user });
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
