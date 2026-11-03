import { getDb, type Shop } from "@/lib/db";

// お店のページ用：お店の情報（理念）と商品の一覧
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  const rows = db
    .prepare(
      `SELECT d.id, d.name, d.price_yen, d.status, d.legal_json,
              (SELECT file FROM product_photos p WHERE p.draft_id = d.id ORDER BY sort LIMIT 1) AS main_photo
       FROM drafts d WHERE d.shop_id = ? ORDER BY d.id DESC`,
    )
    .all(shop.id) as { id: number; name: string; price_yen: number; status: string; legal_json: string | null; main_photo: string | null }[];
  const products = rows.map(({ legal_json, main_photo, ...r }) => ({
    ...r,
    verdict: legal_json ? (JSON.parse(legal_json) as { verdict: string }).verdict : null,
    photo: main_photo ? `/api/photos/${main_photo}` : null,
  }));
  return Response.json({
    shop: {
      id: shop.id,
      name: shop.name,
      category: shop.category,
      area: shop.area,
      philosophy_text: shop.philosophy_text,
      philosophy_status: shop.philosophy_status,
    },
    products,
  });
}
