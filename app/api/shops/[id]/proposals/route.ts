import { guardShop } from "@/lib/auth";
import { getDb, REVISE_LIMIT, type Shop } from "@/lib/db";
import { makeProposals } from "@/lib/claude";

// 次の商品の提案（2026-11-05 きよさん）
//   物販の1割は入り口。事業者の話の中にある「送らない商品」のたねを Claude が案にする。
//   パートナーが事業者さんに見せて相談する。出すかどうかを決めるのは事業者さん。
//   Claude の料金は YMM が持つので、出してもらえるのは事業者ごとに REVISE_LIMIT 回まで
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "事業者が見つかりません" }, { status: 404 });
  if ((shop.proposals_count ?? 0) >= REVISE_LIMIT) {
    return Response.json({ error: `案を出してもらえるのは、事業者ごとに${REVISE_LIMIT}回までです。今の案をもとに、事業者さんと話してみてください。` }, { status: 400 });
  }
  const products = db
    .prepare(
      `SELECT d.name, d.kind, d.description, h.transcript AS talk FROM drafts d JOIN hearings h ON h.id = d.hearing_id
       WHERE d.shop_id = ? AND d.status != 'rejected' ORDER BY d.id DESC LIMIT 8`,
    )
    .all(shop.id) as { name: string; kind: string; description: string; talk: string }[];
  // 材料がないうちは出さない（業種だけから考えると、どの事業者さんにも当てはまる案になる）
  if (!shop.philosophy_text && !shop.philosophy_transcript && products.length === 0) {
    return Response.json({ error: "事業者のヒアリングか、商品を1つ作ったあとで出せます（事業者の話が材料になります）。" }, { status: 400 });
  }
  try {
    const ideas = await makeProposals({
      name: shop.name,
      category: shop.category,
      about: shop.philosophy_text,
      talk: shop.philosophy_transcript,
      website: shop.website_notes,
      products,
    });
    db.prepare("UPDATE shops SET proposals_json = ?, proposals_at = datetime('now', 'localtime'), proposals_count = proposals_count + 1 WHERE id = ?").run(JSON.stringify(ideas), shop.id);
    return Response.json({ proposals: ideas, proposals_left: Math.max(0, REVISE_LIMIT - (shop.proposals_count ?? 0) - 1) });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "案を出せませんでした" }, { status: 500 });
  }
}
