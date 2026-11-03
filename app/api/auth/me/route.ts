import { connection } from "next/server";
import { currentUser } from "@/lib/auth";

export async function GET() {
  await connection();
  return Response.json({ user: await currentUser() });
}
