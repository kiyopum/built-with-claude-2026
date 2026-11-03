import { getDb } from "@/lib/db";
import { shopPinError, guardShop } from "@/lib/auth";

// 店主さん向け：このお店の注文と届け先。届け先はお客さまの個人情報なので、店主さんの暗証番号で開く
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const { shopPin } = (await req.json()) as { shopPin?: string };
  const pinErr = shopPinError(g.shop, shopPin);
  if (pinErr) return Response.json({ error: pinErr }, { status: 403 });
  const orders = getDb()
    .prepare(
      `SELECT o.id, o.created_at, o.quantity, o.amount_yen, o.shipping_yen, o.owner_yen, o.ship_name, o.ship_address, o.ship_method, o.ship_warning, d.name AS product_name
       FROM orders o JOIN drafts d ON d.id = o.draft_id WHERE o.shop_id = ? ORDER BY o.id DESC LIMIT 100`,
    )
    .all(g.shop.id);
  return Response.json({ orders });
}
