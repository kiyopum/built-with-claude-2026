import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// みんなの商品：どのパートナーがリリースした商品でも紹介できる
export async function GET() {
  await connection();
  const u = await requireUser();
  if (u instanceof Response) return u;
  const products = getDb()
    .prepare(
      `SELECT d.id, d.shop_id, d.name, d.price_yen, s.name AS shop_name, s.category, s.partner_id, p.name AS partner_name,
              (SELECT '/api/photos/' || file FROM product_photos ph WHERE ph.draft_id = d.id ORDER BY sort LIMIT 1) AS photo,
              (SELECT COUNT(*) FROM orders o WHERE o.draft_id = d.id) AS sold
       FROM drafts d JOIN shops s ON s.id = d.shop_id LEFT JOIN users p ON p.id = s.partner_id
       WHERE d.status = 'published' ORDER BY d.updated_at DESC`,
    )
    .all() as { partner_id: number | null }[];
  return Response.json({ me: u, products: products.map(({ partner_id, ...p }) => ({ ...p, mine: partner_id === u.id })) });
}
