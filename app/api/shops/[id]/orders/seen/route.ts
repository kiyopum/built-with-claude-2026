import { guardShop } from "@/lib/auth";
import { getDb } from "@/lib/db";

// パートナーが、新しい注文の知らせを「確認した」と押す（届け先の確認ではない。知らせを消すだけ）
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  getDb().prepare("UPDATE orders SET partner_seen_at = datetime('now', 'localtime') WHERE shop_id = ? AND partner_seen_at IS NULL").run(Number(id));
  return Response.json({ ok: true });
}
