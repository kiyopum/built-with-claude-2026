import { getDb, type Draft } from "@/lib/db";
import { guardDraft } from "@/lib/auth";
import { makeNudge } from "@/lib/claude";

// 売れなくても責めない伴走：次の小さな一歩を Claude が1つ考える（考えたものは商品に残す）
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardDraft(id);
  if (g instanceof Response) return g;
  const db = getDb();
  const d = db
    .prepare(
      `SELECT d.*, (SELECT COUNT(*) FROM product_photos p WHERE p.draft_id = d.id) AS photos,
              CAST(julianday('now','localtime') - julianday(COALESCE(d.published_at, d.updated_at)) AS INTEGER) AS days
       FROM drafts d WHERE d.id = ?`,
    )
    .get(Number(id)) as Draft & { photos: number; days: number };
  if (d.status !== "published") return Response.json({ error: "公開している商品だけです" }, { status: 400 });
  try {
    const n = await makeNudge({
      name: d.name,
      kind: d.kind ?? "goods",
      description: d.description,
      reason: d.recommend_reason,
      target: d.target_customer,
      photos: d.photos,
      hasSns: !!d.sns_json,
      shippingIncluded: !!(d.size_class && d.weight_g),
      days: d.days,
    });
    db.prepare("UPDATE drafts SET nudge_json = ?, nudge_at = datetime('now','localtime') WHERE id = ?").run(JSON.stringify(n), d.id);
    return Response.json({ ok: true, nudge: n });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "考えられませんでした" }, { status: 500 });
  }
}
