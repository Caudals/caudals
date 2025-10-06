"use client";

import { createContext, useContext, useEffect, useState } from "react";
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
  const supabase = createClient();

  useEffect(() => {
    // Get initial session and user role
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      // Fetch user role if user exists
      if (session?.user) {
        try {
          const response = await fetch("/api/user/role");
          const data = await response.json();
          setUserRole(data.role || "contributor");
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole("contributor");
        }
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
        try {
          const response = await fetch("/api/user/role");
          const data = await response.json();
          setUserRole(data.role || "contributor");
        } catch (error) {
          console.error('Error fetching user role:', error);
          setUserRole("contributor");
        }
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
