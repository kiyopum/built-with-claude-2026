import { getDb, type Shop } from "@/lib/db";
import { shopPinError } from "@/lib/auth";
import { parseShipDays } from "@/lib/shipping";

// 事業者さん専用ページ（2026-11-07 きよさん）。ログインなし。
//   開けるのは、リンクの合言葉（owner_token）を知っていて、事業者さんの暗証番号を入れた人だけ。
//   GET は名前だけ（届け先は返さない）。POST で暗証番号を確かめてから注文と届け先を返す。間違いが続くと5分止まる（shopPinError）

function shopOf(token: string): Shop | undefined {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return undefined;
  return getDb().prepare("SELECT * FROM shops WHERE owner_token = ?").get(token) as Shop | undefined;
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const shop = shopOf(token);
  if (!shop) return Response.json({ error: "このリンクは使えません" }, { status: 404 });
  return Response.json({ shop: { name: shop.name, has_pin: !!shop.release_pin_hash } });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const shop = shopOf(token);
  if (!shop) return Response.json({ error: "このリンクは使えません" }, { status: 404 });
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: unknown };
  const pinErr = shopPinError(shop, pin);
  if (pinErr) return Response.json({ error: pinErr }, { status: 403 });
  const db = getDb();
  const orders = (
    db
      .prepare(
        `SELECT o.id, o.created_at, o.quantity, o.amount_yen, o.shipping_yen, o.owner_yen, o.ship_name, o.ship_address, o.ship_method, o.ship_warning, o.customer_email,
                o.owner_seen_at IS NULL AS is_new, d.kind, d.name AS product_name
         FROM orders o JOIN drafts d ON d.id = o.draft_id WHERE o.shop_id = ? ORDER BY o.id DESC LIMIT 100`,
      )
      .all(shop.id) as { id: number; is_new: number }[]
  ).map((o) => ({
    ...o,
    is_new: !!o.is_new,
    letters: db
      .prepare(`SELECT l.id, l.original, l.owner_reply, l.replied_at, l.created_at FROM letters l WHERE l.order_id = ? ORDER BY l.id`)
      .all(o.id),
  }));
  db.prepare("UPDATE orders SET owner_seen_at = datetime('now','localtime') WHERE shop_id = ? AND owner_seen_at IS NULL").run(shop.id);
  return Response.json({ shop: { name: shop.name }, orders, ship_days: parseShipDays((shop as Shop & { ship_days: string | null }).ship_days) });
}
