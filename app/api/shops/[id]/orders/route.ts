import { getDb, letterTokenOf } from "@/lib/db";
import { shopPinError, guardShop } from "@/lib/auth";

// 事業者さん向け：この事業者の注文と届け先。届け先はお客さまの個人情報なので、事業者さんの暗証番号で開く
//   ありがとうの往復便：注文ごとのカードの合言葉と、お客さまからのお便り。返事も暗証番号つきで書く（返事は事業者さんのことば）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const { shopPin, reply } = (await req.json()) as { shopPin?: string; reply?: { letterId?: unknown; text?: unknown } };
  const pinErr = shopPinError(g.shop, shopPin);
  if (pinErr) return Response.json({ error: pinErr }, { status: 403 });
  const db = getDb();
  if (reply) {
    const text = String(reply.text ?? "").trim();
    if (!text) return Response.json({ error: "お返事を入れてください" }, { status: 400 });
    if (text.length > 1000) return Response.json({ error: "長すぎます（1000字まで）" }, { status: 400 });
    const ch = db
      .prepare("UPDATE letters SET owner_reply = ?, replied_at = datetime('now','localtime') WHERE id = ? AND shop_id = ?")
      .run(text, Number(reply.letterId), g.shop.id).changes;
    if (!ch) return Response.json({ error: "お便りが見つかりません" }, { status: 404 });
  }
  const orders = (
    db
      .prepare(
        `SELECT o.id, o.created_at, o.quantity, o.amount_yen, o.shipping_yen, o.owner_yen, o.ship_name, o.ship_address, o.ship_method, o.ship_warning, o.customer_email, d.kind, d.name AS product_name
         FROM orders o JOIN drafts d ON d.id = o.draft_id WHERE o.shop_id = ? ORDER BY o.id DESC LIMIT 100`,
      )
      .all(g.shop.id) as { id: number }[]
  ).map((o) => ({
    ...o,
    letter_token: letterTokenOf(o.id),
    letters: db
      .prepare(
        `SELECT l.id, l.original, l.owner_reply, l.replied_at, l.created_at, v.title, v.message, v.kind
         FROM letters l LEFT JOIN voices v ON v.id = l.voice_id WHERE l.order_id = ? ORDER BY l.id`,
      )
      .all(o.id),
  }));
  return Response.json({ orders });
}
