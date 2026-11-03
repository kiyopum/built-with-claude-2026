import { login } from "@/lib/auth";

export async function POST(req: Request) {
  const { userId, pin } = (await req.json()) as { userId?: number; pin?: string };
  const r = await login(Number(userId), String(pin ?? ""));
  if (r.error) return Response.json({ error: r.error }, { status: 401 });
  return Response.json({ user: r.user });
}
