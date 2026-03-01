import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardEntrypointPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  if (profile?.role === "contributor") {
    redirect("/contributor");
  }

  redirect("/requester");
}
