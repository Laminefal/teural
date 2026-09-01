import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** true when we are running on a cached local session (no internet) */
  offlineSession: boolean;
  signOut: () => Promise<void>;
}

const CACHE_KEY = "teural.offline.user";

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore quota errors */
  }
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  offlineSession: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [cachedUser, setCachedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      if (s?.user) {
        writeCachedUser(s.user);
        setCachedUser(s.user);
      } else if (event === "SIGNED_OUT") {
        writeCachedUser(null);
        setCachedUser(null);
      }
    });

    // A device that already signed in once keeps working without internet.
    const local = readCachedUser();
    if (local) setCachedUser(local);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user) {
          writeCachedUser(data.session.user);
          setCachedUser(data.session.user);
        }
      })
      .catch(() => {
        /* offline: we fall back to the cached user below */
      })
      .finally(() => setLoading(false));

    return () => sub.subscription.unsubscribe();
  }, []);

  const offlineSession = !session && !!cachedUser;
  const user = session?.user ?? (offlineSession ? cachedUser : null);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        loading,
        offlineSession,
        signOut: async () => {
          writeCachedUser(null);
          setCachedUser(null);
          await supabase.auth.signOut().catch(() => {});
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
