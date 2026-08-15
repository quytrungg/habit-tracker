import { getCurrentUser } from "@/server/auth/session";

export async function GET() {
  return Response.json({ user: await getCurrentUser() });
}
