import { createClient } from "@/lib/supabase/server";
import { UserRole } from "@/types/database";

export async function getRedirectPathForRole(userRole: UserRole): Promise<string> {
  switch (userRole) {
    case 'contributor':
      return '/dashboard/contributor';
    case 'requester':
      return '/dashboard';
    case 'admin':
      return '/admin';
    default:
      return '/dashboard';
  }
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
  try {
    const supabase = await createClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    return profile?.role || null;
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}
