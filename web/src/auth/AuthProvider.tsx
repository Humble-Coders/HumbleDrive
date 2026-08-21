import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { callFunction, ApiError } from "../lib/api";

/**
 * Authentication AND authorisation.
 *
 * These are two different things and conflating them is the security mistake
 * this file exists to prevent. Supabase Auth tells us *who* someone is. The
 * `admins` table decides whether they are a supervisor. A session is only
 * valid here once `admin-me` has returned 200 — anyone else is signed out
 * immediately (PRD §5.1).
 */

export interface Supervisor {
  userId: string;
  name: string;
}

type Status =
  | { state: "loading" }
  | { state: "signed-out"; notSupervisor?: boolean }
  | { state: "signed-in"; supervisor: Supervisor };

interface AuthValue {
  status: Status;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Thrown by signIn when credentials are wrong, so the form can say so. */
export class BadCredentials extends Error {}
/** Thrown by signIn when the account authenticates but is not a supervisor. */
export class NotSupervisor extends Error {}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ state: "loading" });

  /** Ask the server whether this session belongs to an active supervisor. */
  async function verify(session: Session | null): Promise<void> {
    if (!session) {
      setStatus({ state: "signed-out" });
      return;
    }
    try {
      const me = await callFunction<Supervisor>("admin-me");
      setStatus({ state: "signed-in", supervisor: me });
    } catch (err) {
      // not_admin is the meaningful one: a real account that is not staff.
      // Anything else (expired token, outage) also cannot be trusted as a
      // supervisor session, so it fails closed either way.
      const notSupervisor = err instanceof ApiError && err.code === "not_admin";
      await supabase.auth.signOut();
      setStatus({ state: "signed-out", notSupervisor });
    }
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) void verify(data.session);
    });

    // Fires on token refresh and on sign-out from another tab.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") setStatus({ state: "signed-out" });
      else if (event === "TOKEN_REFRESHED" && !session) setStatus({ state: "signed-out" });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthValue = {
    status,

    async signIn(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error || !data.session) throw new BadCredentials();

      try {
        const me = await callFunction<Supervisor>("admin-me");
        setStatus({ state: "signed-in", supervisor: me });
      } catch (err) {
        await supabase.auth.signOut();
        setStatus({ state: "signed-out", notSupervisor: true });
        if (err instanceof ApiError && err.code === "not_admin") throw new NotSupervisor();
        throw err;
      }
    },

    async signOut() {
      await supabase.auth.signOut();
      setStatus({ state: "signed-out" });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
