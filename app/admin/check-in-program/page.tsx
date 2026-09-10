import { redirect } from "next/navigation";

export default function AdminCheckInProgramRedirectPage() {
  redirect("/admin/campaigns?tab=check-in");
}
