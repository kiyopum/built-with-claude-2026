import { getDb } from "@/lib/db";
import { guardShop } from "@/lib/auth";

// 送料（全国一律・商品代とは別）。0 円なら送料無料
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const { yen } = (await req.json()) as { yen?: unknown };
  const n = Number(yen);
  if (!Number.isInteger(n) || n < 0 || n > 10000) return Response.json({ error: "送料は 0〜10,000 円で入れてください" }, { status: 400 });
  getDb().prepare("UPDATE shops SET shipping_yen = ? WHERE id = ?").run(n, g.shop.id);
  return Response.json({ ok: true });
}
