import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AdminSidebar } from "@/app/components/admin/AdminSidebar";
import { AdminBreadcrumb } from "@/app/components/admin/AdminBreadcrumb";
import { requireAdminPageAccess } from "@/lib/auth/require-admin";

export const metadata: Metadata = { title: "後台管理 — HKCardVault" };

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const authUser = await requireAdminPageAccess();

  // 預設收合；用戶切換後以 cookie 記憶側欄開合狀態（跨頁面 / 重載持久化）
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";
  const authEmail = authUser.email ?? "未登入";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AdminSidebar authEmail={authEmail} />
      <SidebarInset className="min-w-0 bg-[#17130f]">
        <header
          className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.08] bg-[#17130f]/95 px-3 backdrop-blur-md lg:h-12 lg:gap-2.5 lg:px-4"
        >
          <SidebarTrigger
            className="-ml-1 size-8 shrink-0 rounded-md text-text-disabled shadow-none hover:bg-white/[0.05] hover:text-brand active:scale-[0.98] [&_svg]:size-[17px]"
          />
          <AdminBreadcrumb className="flex-1" />
        </header>
        <div className="overflow-x-hidden p-4 lg:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
