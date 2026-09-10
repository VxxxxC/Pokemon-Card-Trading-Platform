import { redirect } from "next/navigation";
import { getUserSettings } from "@/app/actions/profile";
import { UserSettingsClient } from "./UserSettingsClient";

export const dynamic = "force-dynamic";

export default async function UserSettingsPage() {
  const result = await getUserSettings();

  if (!result.success) {
    redirect("/auth?redirect=/profile/user/settings");
  }

  return <UserSettingsClient initialData={result.data} />;
}
