import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { getCurrentUser } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) redirect("/habits");
  return <main className="auth-shell">{children}</main>;
}
