import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getCurrentUser } from "@/server/auth/session";

export default async function TrackerLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
