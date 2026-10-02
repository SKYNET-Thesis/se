import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { clearStoredAuthMode, getStoredAuthMode, setStoredAuthMode } from "../services/authStorage";
import { SignInResult, signInWithEmail, signUp, SignUpResult } from "../services/authService";
import { AuthStatus, SignUpPayload } from "./types";

type AuthContextValue = {
  status: AuthStatus;
  // "Tiếp tục không cần tài khoản". Takes effect immediately; persisting is
  // best-effort in the background.
  continueAsGuest: () => void;
  // Back to the auth entry (never to onboarding). Only clears the auth
  // choice — E-STOP and every other app state are owned elsewhere and are
  // not touched.
  signOut: () => void;
  // Account sign-in through the authService boundary. Today it always
  // resolves "unavailable" and the status does not change; when a real
  // backend answers ok, this is where status becomes "signedIn".
  signInWithEmail: (email: string, password: string) => Promise<SignInResult>;
  // Account creation through the same boundary. Today it always resolves
  // "unavailable": no account is created and the status does not change.
  signUp: (payload: SignUpPayload) => Promise<SignUpResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Owns the app's auth status. There is no sign-in yet: when a backend
// exists, an authService will move status to "signedIn" from here — screens
// never set it themselves.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");

  useEffect(() => {
    let mounted = true;

    getStoredAuthMode().then((stored) => {
      if (!mounted) return;
      // Only fill in the initial value: a choice made while the read was in
      // flight must not be overwritten by it.
      setStatus((current) => (current === "checking" ? (stored === "guest" ? "guest" : "signedOut") : current));
    });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      continueAsGuest: () => {
        setStatus("guest");
        void setStoredAuthMode("guest");
      },
      signOut: () => {
        setStatus("signedOut");
        void clearStoredAuthMode();
      },
      signInWithEmail: (email, password) => signInWithEmail(email.trim(), password),
      signUp: (payload) =>
        signUp({
          ...payload,
          email: payload.email.trim(),
          profile: { ...payload.profile, displayName: payload.profile.displayName.trim() }
        })
    }),
    [status]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be called within an <AuthProvider>");
  }
  return ctx;
}
