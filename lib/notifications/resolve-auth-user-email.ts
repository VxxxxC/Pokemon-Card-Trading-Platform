import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveAuthUserEmails(
  userIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter((id) => id.trim().length > 0))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const admin = createAdminClient();
  const emails = new Map<string, string>();

  for (const userId of uniqueIds) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) {
      console.warn("[resolveAuthUserEmails]", userId, error.message);
      continue;
    }

    const email = data.user?.email?.trim();
    if (email) {
      emails.set(userId, email);
    }
  }

  return emails;
}

export async function resolveAuthUserEmail(userId: string): Promise<string | null> {
  const emails = await resolveAuthUserEmails([userId]);
  return emails.get(userId) ?? null;
}
