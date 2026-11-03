import { getDb } from "@/lib/db";
import { hashPin, isPin, login } from "@/lib/auth";

// 最初の1回だけ：YMM の管理者を作る（だれも登録されていないときだけ動く）。暗証番号は本人が決める
export async function POST(req: Request) {
  const { name, pin } = (await req.json()) as { name?: string; pin?: string };
  const db = getDb();
  const n = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (n > 0) return Response.json({ error: "もう登録されています。ログインしてください" }, { status: 400 });
  if (!name?.trim()) return Response.json({ error: "名前を入れてください" }, { status: 400 });
  if (!isPin(pin)) return Response.json({ error: "暗証番号は数字4けたです" }, { status: 400 });
  const r = db.prepare("INSERT INTO users (name, role, pin_hash) VALUES (?, 'admin', ?)").run(name.trim(), hashPin(pin));
  const res = await login(Number(r.lastInsertRowid), pin);
  return Response.json({ user: res.user });
}
