import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export const authState: {
  user: User | null;
  supabase: SupabaseClient<Database> | null;
} = {
  user: null,
  supabase: null,
};
