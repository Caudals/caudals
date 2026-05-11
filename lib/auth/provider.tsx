"use client";

import { createContext, useContext, useEffect, useState } from "react";

import { useSession } from "@/lib/auth/better-auth-client";

type AuthUser = {
  id: string;
  email: string | null;
  user_metadata: {
    full_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
  };
};

type AuthContextType = {
  user: AuthUser | null;
  session: unknown | null;
  userRole: string | null;
  loading: boolean;
};

type RoleState = {
  userId: string | null;
  role: string | null;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userRole: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending } = useSession();
  const [roleState, setRoleState] = useState<RoleState>({
    userId: null,
    role: null,
  });
  const authUser = data?.user ?? null;

  const user: AuthUser | null = authUser
    ? {
        id: authUser.id,
        email: authUser.email,
        user_metadata: {
          full_name: authUser.name,
          avatar_url: authUser.image,
        },
      }
    : null;

  const userRole = roleState.userId === user?.id ? roleState.role : null;
  const roleLoading = Boolean(user?.id && roleState.userId !== user.id);

  useEffect(() => {
    let active = true;

    if (!authUser?.id) {
      return;
    }

    const userId = authUser.id;

    fetch("/api/user/role", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        const body = (await response.json()) as { role?: string | null };
        return typeof body.role === "string" ? body.role : null;
      })
      .then((role) => {
        if (active) {
          setRoleState({ userId, role });
        }
      })
      .catch((error) => {
        console.error("Error fetching operator role:", error);
        if (active) {
          setRoleState({ userId, role: null });
        }
      });

    return () => {
      active = false;
    };
  }, [authUser?.id]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session: data?.session ?? null,
        userRole,
        loading: isPending || roleLoading,
      }}
    >
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
