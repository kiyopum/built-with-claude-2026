import { getDb, type Draft, type Shop } from "@/lib/db";
import { photoUrls } from "@/lib/files";
import { shippingInfo } from "@/lib/shipquote";

// 公開中の商品1件（お客さま向け）。公開していないものは見せない
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = getDb()
    .prepare(
      `SELECT d.id, d.name, d.description, d.price_yen, d.recommend_reason, d.target_customer, d.legal_json,
              d.size_class, d.weight_g, d.per_box, s.name AS shop_name, s.area AS shop_area, s.shipping_yen, s.prefecture, s.pickup_ok,
              CASE WHEN s.philosophy_status = 'approved' THEN s.philosophy_text END AS shop_intro
       FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.id = ? AND d.status = 'published'`,
    )
    .get(Number(id)) as Partial<Draft> | undefined;
  if (!p) return Response.json({ error: "この商品は公開されていません" }, { status: 404 });
  // お客さまには、法律の判定ではなく「商品の表示（分かっているものだけ）」を見せる
  const legal = p.legal_json ? (JSON.parse(p.legal_json) as { label_items?: { name: string; value: string | null }[] }) : null;
  const labels = (legal?.label_items ?? []).filter((l) => l.value);
  delete p.legal_json;
  const shipping = shippingInfo(p as Draft, p as unknown as Shop);
  return Response.json({ product: { ...p, labels, photos: photoUrls(Number(id)), shipping } });
}
