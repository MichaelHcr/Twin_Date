import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// For pages and actions that need a signed-in user: returns the Supabase
// client and the user, or sends the visitor to the login page.
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
