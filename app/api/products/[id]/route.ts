import { getDb, type Draft } from "@/lib/db";

// 公開中の商品1件（お客さま向け）。公開していないものは見せない
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = getDb()
    .prepare(
      `SELECT d.id, d.name, d.description, d.price_yen, d.recommend_reason, d.target_customer,
              s.name AS shop_name, s.area AS shop_area
       FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.id = ? AND d.status = 'published'`,
    )
    .get(Number(id)) as Partial<Draft> | undefined;
  if (!p) return Response.json({ error: "この商品は公開されていません" }, { status: 404 });
  return Response.json({ product: p });
}
