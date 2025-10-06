"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UserRole } from "@/types/database";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export function RoleGuard({ children, allowedRoles }: RoleGuardProps) {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    
    async function checkUserRole() {
      const supabase = createClient();
      
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (!isMounted) return;
        
        if (authError || !user) {
          router.push('/auth/sign-in');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!isMounted) return;

        if (profileError || !profile) {
          router.push('/auth/sign-in');
          return;
        }

        const role = profile.role;
        setUserRole(role);

        // If user role is not in allowed roles, redirect to appropriate dashboard
        if (!allowedRoles.includes(role)) {
          if (role === 'contributor') {
            router.push('/dashboard/contributor');
          } else if (role === 'requester') {
            router.push('/dashboard');
          } else if (role === 'admin') {
            router.push('/admin');
          } else if (role === 'both') {
            // Temporary: redirect 'both' users to contributor dashboard
            router.push('/dashboard/contributor');
          } else {
            router.push('/auth/sign-in');
          }
          return;
        }

      } catch (error) {
        console.error('Error checking user role:', error);
        if (isMounted) {
          router.push('/auth/sign-in');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    checkUserRole();
    
    return () => {
      isMounted = false;
    };
  }, [allowedRoles.join(',')]); // Only depend on the string representation of allowedRoles

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If user role is allowed, render children
  if (userRole && allowedRoles.includes(userRole)) {
    return <>{children}</>;
  }

  // If not allowed, show loading (redirect is happening)
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
    </div>
  );
}
