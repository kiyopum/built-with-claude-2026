import { getDb } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/split";

// 分け方の設定を変える。これからの注文に使う（過去の注文は記録した時の料率のまま）
export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const db = getDb();
  const upd = db.prepare("UPDATE settings SET value = ? WHERE key = ?");
  for (const [key, lim] of Object.entries(RATE_LIMITS)) {
    const v = Number(body[key]);
    if (!Number.isFinite(v) || v < lim.min || v > lim.max) {
      return Response.json({ error: `${key} は ${lim.min}〜${lim.max} の範囲で入れてください` }, { status: 400 });
    }
  }
  for (const key of Object.keys(RATE_LIMITS)) upd.run(String(Number(body[key])), key);
  return Response.json({ ok: true });
}
