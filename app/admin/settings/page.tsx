import { getOptionalAuthUser } from "@/lib/auth/session";
import { AdminSettingsClient } from "./AdminSettingsClient";

export default async function AdminSettingsPage() {
  const authUser = await getOptionalAuthUser();
  const authEmail = authUser?.email ?? "";

  return <AdminSettingsClient authEmail={authEmail} />;
}
