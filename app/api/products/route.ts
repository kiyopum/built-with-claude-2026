import { connection } from "next/server";
import { getDb, type Draft } from "@/lib/db";

// 公開中の商品一覧（お客さま向け）
export async function GET() {
  await connection();
  const products = getDb()
    .prepare(
      `SELECT d.id, d.name, d.description, d.price_yen, d.target_customer, s.name AS shop_name
       FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.status = 'published' ORDER BY d.updated_at DESC`,
    )
    .all() as Partial<Draft>[];
  return Response.json({ products });
}
