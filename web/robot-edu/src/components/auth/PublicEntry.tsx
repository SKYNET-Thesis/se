import React from "react";
import { useSupabaseSession } from "../../contexts/SupabaseSessionContext";
import { RoleHome } from "./RoleHome";

const HomeV2 = React.lazy(() => import("../../pages/home-v2/HomeV2"));

/** The public `/` entry: signed-in users go to their role home, everyone else sees Homepage V2. */
export function PublicEntry() {
  const { session, loading } = useSupabaseSession();
  if (loading) return <main className="grid h-full place-items-center text-sm text-ink-muted">Restoring secure session…</main>;
  if (session) return <RoleHome />;
  return <React.Suspense fallback={null}><HomeV2 /></React.Suspense>;
}
