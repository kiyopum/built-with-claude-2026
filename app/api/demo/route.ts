import { connection } from "next/server";
import { getDb, letterTokenOf } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// 見本の一覧：それぞれの機能を開くための番号（管理者は全部のお店、パートナーは担当のお店から選ぶ）
export async function GET() {
  await connection();
  const u = await requireUser();
  if (u instanceof Response) return u;
  const db = getDb();
  const mine = u.role === "admin" ? "" : `AND s.partner_id = ${Number(u.id)}`;
  // 写真のある公開中の商品を先に
  const product = db
    .prepare(
      `SELECT d.id, d.shop_id, d.name, s.name AS shop_name FROM drafts d JOIN shops s ON s.id = d.shop_id
       WHERE d.status = 'published' AND d.kind = 'goods' ${mine}
       ORDER BY EXISTS (SELECT 1 FROM product_photos p WHERE p.draft_id = d.id) DESC, d.id DESC LIMIT 1`,
    )
    .get() as { id: number; shop_id: number; name: string; shop_name: string } | undefined;
  const anyPublic = db.prepare("SELECT d.id, d.name FROM drafts d WHERE d.status = 'published' ORDER BY d.id DESC LIMIT 1").get() as { id: number; name: string } | undefined;
  const shop = (product ? { id: product.shop_id, name: product.shop_name } : db.prepare(`SELECT s.id, s.name FROM shops s WHERE 1=1 ${mine} ORDER BY s.id DESC LIMIT 1`).get()) as
    | { id: number; name: string }
    | undefined;
  const order = db
    .prepare(`SELECT o.id, o.shop_id, s.name AS shop_name FROM orders o JOIN shops s ON s.id = o.shop_id JOIN drafts d ON d.id = o.draft_id WHERE d.kind = 'goods' ${mine} ORDER BY o.id DESC LIMIT 1`)
    .get() as { id: number; shop_id: number; shop_name: string } | undefined;
  return Response.json({
    role: u.role,
    product: product ?? null,
    public_product: anyPublic ?? null,
    shop: shop ?? null,
    order: order ? { ...order, token: letterTokenOf(order.id) } : null,
  });
}
