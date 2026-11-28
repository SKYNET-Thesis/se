import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { nextSessionRevision } from "./sessionRevision";
import { AUTH_RESTRICTION_EVENT } from "../lib/api";

interface SessionContextValue { session: Session | null; client: SupabaseClient | null; loading: boolean; configurationError: string | null; sessionRevision: number; /** True after supabase-js validated an e-mailed INVITATION link in this browser (see below). */ invitationSetup: boolean; /** Set when the invitation link itself was rejected (expired/used). */ invitationLinkError: string | null; completeInvitation: () => void; /** True only after supabase-js validated an e-mailed recovery token in this page load (PASSWORD_RECOVERY event). */ passwordRecovery: boolean; }
const SessionContext = createContext<SessionContextValue | null>(null);

// The landing URL is captured at module load, BEFORE supabase-js consumes (and clears) the fragment. A fragment alone proves nothing: the setup form is offered only
// when supabase-js ALSO validated the token (a SIGNED_IN event in this page load) - a forged "type=invite" without a valid token yields no session.
const LANDING_HASH = typeof window !== "undefined" ? window.location.hash : "";
const INVITE_LINK = /[#&]type=invite(&|$)/.test(LANDING_HASH);
const INVITE_FLAG = "vista:invitation-setup";
const LINK_ERROR = (() => { const m = /[#&]error_code=([^&]+)/.exec(LANDING_HASH); return m ? decodeURIComponent(m[1]) : null; })();

function configuredClient(): { client: SupabaseClient | null; error: string | null } {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { client: null, error: "Supabase browser configuration is missing." };
  return { client: createClient(url, anonKey), error: null };
}

export function SupabaseSessionProvider({ children }: { children: React.ReactNode }) {
  const [{ client, error }] = useState(configuredClient);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  const sessionToken = useRef<string | null>(null);
  const [loading, setLoading] = useState(Boolean(client));
  const [invitationSetup, setInvitationSetup] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem(INVITE_FLAG) === "1");
  const completeInvitation = useCallback(() => { window.sessionStorage.removeItem(INVITE_FLAG); setInvitationSetup(false); }, []);
  const [passwordRecovery, setPasswordRecovery] = useState(false); // set ONLY by supabase-js's PASSWORD_RECOVERY event, i.e. after it validated a genuine recovery token; a URL fragment alone proves nothing
  const applySession = useCallback((next: Session | null) => {
    const previousToken = sessionToken.current;
    const nextToken = next?.access_token ?? null;
    sessionToken.current = nextToken;
    setSession(next);
    setSessionRevision((current) => nextSessionRevision(previousToken, nextToken, current));
  }, []);
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => applySession(data.session)).finally(() => setLoading(false));
    const { data: subscription } = client.auth.onAuthStateChange((event, next) => { if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true); if (event === "SIGNED_OUT") { setPasswordRecovery(false); window.sessionStorage.removeItem(INVITE_FLAG); setInvitationSetup(false); }
      if (event === "SIGNED_IN" && INVITE_LINK && next) {
        window.sessionStorage.setItem(INVITE_FLAG, "1"); setInvitationSetup(true);
        if (window.location.pathname !== "/accept-invitation") window.location.replace("/accept-invitation"); // the session is already stored; an invitation never opens the app without a password
      }
      applySession(next); setLoading(false); });
    return () => subscription.subscription.unsubscribe();
  }, [applySession, client]);
  useEffect(() => {
    if (!client) return;
    const onRestriction = (event: Event) => {
      const code = (event as CustomEvent<{ code?: string }>).detail?.code ?? "SESSION_ROTATED";
      void client.auth.signOut().finally(() => window.location.assign(`/login?reason=${encodeURIComponent(code)}`));
    };
    window.addEventListener(AUTH_RESTRICTION_EVENT, onRestriction);
    return () => window.removeEventListener(AUTH_RESTRICTION_EVENT, onRestriction);
  }, [client]);
  const value = useMemo(() => ({ session, client, loading, configurationError: error, sessionRevision, passwordRecovery, invitationSetup, invitationLinkError: LINK_ERROR, completeInvitation }), [session, client, loading, error, sessionRevision, passwordRecovery, invitationSetup, completeInvitation]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSupabaseSession() { const value = useContext(SessionContext); if (!value) throw new Error("useSupabaseSession must be used under SupabaseSessionProvider."); return value; }
