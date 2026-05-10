import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function requireRole(allowedRoles: string[], redirectPath?: string) {
  const supabase = await createClient();
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('No user found, redirecting to sign-in');
      redirect('/auth/sign-in');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.log('No profile found, redirecting to sign-in');
      redirect('/auth/sign-in');
    }

    const userRole = profile.role;
    console.log('User role:', userRole, 'Allowed roles:', allowedRoles);

    // If user role is not in allowed roles, redirect to appropriate dashboard
    if (!allowedRoles.includes(userRole)) {
      console.log('User role not allowed, redirecting...');
      if (userRole === 'requester') {
        redirect('/requester');
      } else if (userRole === 'admin') {
        redirect('/admin');
      } else {
        redirect(redirectPath || '/');
      }
    }

    console.log('Access granted for role:', userRole);
    return { user, userRole };
  } catch (error) {
    console.error('Error in route guard:', error);
    redirect('/auth/sign-in');
  }
}

// Helper functions for specific role checks
export async function requireRequester() {
  return await requireRole(['requester']);
}

export async function requireAdmin() {
  return await requireRole(['admin']);
}
