"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  userRole: string | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userRole: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const fetchRole = async (): Promise<string | null> => {
      try {
        const response = await fetch("/api/user/role", { cache: "no-store" });
        if (!response.ok) {
          return null;
        }
        const data = (await response.json()) as { role?: string };
        return typeof data.role === "string" ? data.role : null;
      } catch (error) {
        console.error("Error fetching user role:", error);
        return null;
      }
    };

    // Get initial session and user role
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      // Fetch user role if user exists
      if (session?.user) {
        const resolvedRole = await fetchRole();
        setUserRole(
          resolvedRole ??
            (typeof session.user.user_metadata?.role === "string"
              ? session.user.user_metadata.role
              : null),
        );
      } else {
        setUserRole(null);
      }

      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      // Fetch user role if user exists
      if (session?.user) {
        const resolvedRole = await fetchRole();
        setUserRole((prev) => {
          if (resolvedRole) {
            return resolvedRole;
          }
          if (typeof session.user.user_metadata?.role === "string") {
            return session.user.user_metadata.role;
          }
          return prev;
        });
      } else {
        setUserRole(null);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  return (
    <AuthContext.Provider value={{ user, session, userRole, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
