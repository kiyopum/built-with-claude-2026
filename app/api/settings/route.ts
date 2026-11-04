import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { RATE_LIMITS } from "@/lib/split";

// 分け方の設定を変える。これからの注文に使う（過去の注文は記録した時の料率のまま）
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof Response) return admin;
  const body = (await req.json()) as Record<string, unknown>;
  const db = getDb();
  const upd = db.prepare("UPDATE settings SET value = ? WHERE key = ?");
  const LABEL: Record<string, string> = { ymm_rate: "YMM の取り分（物販）", ymm_rate_service: "YMM の取り分（サービス）", partner_share: "パートナーへの割合", stripe_fee_rate: "決済手数料" };
  for (const [key, lim] of Object.entries(RATE_LIMITS)) {
    const v = Number(body[key]);
    if (!Number.isFinite(v) || v < lim.min || v > lim.max) {
      return Response.json({ error: `${LABEL[key]}は ${lim.min * 100}〜${lim.max * 100}% の範囲で入れてください` }, { status: 400 });
    }
  }
  for (const key of Object.keys(RATE_LIMITS)) upd.run(String(Number(body[key])), key);
  return Response.json({ ok: true });
}
