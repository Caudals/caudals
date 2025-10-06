import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/database";
import { redirect } from "next/navigation";

export async function protectRoute(allowedRoles: UserRole[]) {
  const supabase = await createClient();
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // If no user or auth error, redirect to sign-in
    if (authError || !user) {
      redirect('/auth/sign-in');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // If profile error or no profile, redirect to sign-in
    if (profileError || !profile) {
      redirect('/auth/sign-in');
    }

    const userRole = profile.role;

    // If user role is not in allowed roles, redirect to their appropriate dashboard
    if (!allowedRoles.includes(userRole)) {
      if (userRole === 'contributor') {
        redirect('/dashboard/contributor');
      } else if (userRole === 'requester') {
        redirect('/dashboard');
      } else if (userRole === 'admin') {
        redirect('/admin');
      } else {
        // Unknown role, redirect to sign-in
        redirect('/auth/sign-in');
      }
    }

    return { user, userRole };
  } catch (error) {
    console.error('Error in route protection:', error);
    redirect('/auth/sign-in');
  }
}

// Helper functions for specific role checks
export async function requireContributor() {
  return await protectRoute(['contributor']);
}

export async function requireRequester() {
  return await protectRoute(['requester']);
}

export async function requireAdmin() {
  return await protectRoute(['admin']);
}
