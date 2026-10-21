import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

interface SessionContextValue { session: Session | null; client: SupabaseClient | null; loading: boolean; configurationError: string | null; }
const SessionContext = createContext<SessionContextValue | null>(null);

function configuredClient(): { client: SupabaseClient | null; error: string | null } {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { client: null, error: "Supabase browser configuration is missing." };
  return { client: createClient(url, anonKey), error: null };
}

export function SupabaseSessionProvider({ children }: { children: React.ReactNode }) {
  const [{ client, error }] = useState(configuredClient);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.subscription.unsubscribe();
  }, [client]);
  const value = useMemo(() => ({ session, client, loading, configurationError: error }), [session, client, loading, error]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSupabaseSession() { const value = useContext(SessionContext); if (!value) throw new Error("useSupabaseSession must be used under SupabaseSessionProvider."); return value; }
