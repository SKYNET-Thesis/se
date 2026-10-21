import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSupabaseSession } from "../../contexts/SupabaseSessionContext";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSupabaseSession(); const location = useLocation();
  if (loading) return <main className="grid h-full place-items-center text-sm text-ink-muted">Restoring secure session…</main>;
  return session ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}
