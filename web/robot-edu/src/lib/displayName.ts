import { useEffect, useState } from "react";
import { identityApi } from "./api";
import { useSupabaseSession } from "../contexts/SupabaseSessionContext";

/** Students authenticate through an internal Supabase alias (`student-<id>@students.auth.vista.invalid`). It is an implementation detail and is never shown to users. */
const INTERNAL_ALIAS = /^student-[0-9a-f-]{8,}@students\.auth\.vista\.invalid$/i;
export const isInternalAlias = (email?: string | null): boolean => Boolean(email && INTERNAL_ALIAS.test(email.trim()));

type SessionUser = { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined;

/** Best name available from the session alone (no network): profile metadata, then a real email's local part, never an internal alias. */
export function displayNameFromUser(user: SessionUser, fallback = "Learner"): string {
  const meta = user?.user_metadata?.full_name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  const email = user?.email ?? "";
  if (email && !isInternalAlias(email)) return email.split("@")[0];
  return fallback;
}

export function initialsOf(name: string): string {
  return name.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

/** The signed-in user's display name: the VISTA profile name (`/me`) once loaded, otherwise the session-derived name. */
export function useDisplayName(fallback = "Learner"): string {
  const { session } = useSupabaseSession();
  const initial = displayNameFromUser(session?.user, fallback);
  const [profileName, setProfileName] = useState<string | null>(null);
  useEffect(() => {
    if (!session?.access_token) return;
    let cancelled = false;
    identityApi.me(session.access_token).then((me) => { if (!cancelled && me.fullName?.trim()) setProfileName(me.fullName.trim()); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [session?.access_token]);
  return profileName ?? initial;
}
