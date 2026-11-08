import { getDb } from "@/lib/db";
import { hashPin, isPin, login } from "@/lib/auth";

// 最初の1回だけ：YMM の管理者を作る（だれも登録されていないときだけ動く）。暗証番号は本人が決める
export async function POST(req: Request) {
  const { name, pin, key } = (await req.json()) as { name?: string; pin?: string; key?: string };
  // サーバーに置くときは、合言葉（YAOBIZ_SETUP_KEY）つきのリンクからだけ最初の管理者を作れる
  const need = process.env.YAOBIZ_SETUP_KEY;
  // 公開サーバー（NODE_ENV=production）では合言葉が無ければ作らせない（データが空のときに先に来た人が管理者になるのを防ぐ）
  if (!need && process.env.NODE_ENV === "production") return Response.json({ error: "サーバーの設定（YAOBIZ_SETUP_KEY）が無いので、最初の管理者を作れません" }, { status: 403 });
  if (need && key !== need) return Response.json({ error: "最初の設定は、YMM から届いた専用リンクから行ってください" }, { status: 403 });
  const db = getDb();
  const n = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
  if (n > 0) return Response.json({ error: "もう登録されています。ログインしてください" }, { status: 400 });
  if (!name?.trim()) return Response.json({ error: "名前を入れてください" }, { status: 400 });
  if (!isPin(pin)) return Response.json({ error: "暗証番号は数字4けたです" }, { status: 400 });
  const r = db.prepare("INSERT INTO users (name, role, pin_hash) VALUES (?, 'admin', ?)").run(name.trim(), hashPin(pin));
  const res = await login(Number(r.lastInsertRowid), pin);
  return Response.json({ user: res.user });
}
