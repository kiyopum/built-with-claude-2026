import { connection } from "next/server";
import { getDb } from "@/lib/db";

// ログイン画面の名前の一覧（名前だけ）。だれも登録されていなければ、最初の管理者を作る画面にする
export async function GET() {
  await connection();
  const users = getDb().prepare("SELECT id, name, role FROM users WHERE active = 1 ORDER BY role = 'admin', id").all();
  return Response.json({ users, setup: users.length === 0 });
}
