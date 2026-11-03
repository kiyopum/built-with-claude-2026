import { getDb, type Draft, type Shop } from "@/lib/db";
import { reviseDraft } from "@/lib/claude";
import { ensureStripePrice } from "@/lib/stripe";

// 店主の三択：publish（このまま公開）/ revise（修正を頼む）/ reject（却下）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action, note } = (await req.json()) as { action: string; note?: string };
  const db = getDb();
  const d = db.prepare("SELECT * FROM drafts WHERE id = ?").get(Number(id)) as Draft | undefined;
  if (!d) return Response.json({ error: "ドラフトが見つかりません" }, { status: 404 });

  if (action === "publish") {
    // 公開するときに Stripe の商品と価格を作る（購入ボタンで使う）
    try {
      await ensureStripePrice(d);
    } catch (e) {
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Stripe に商品を登録できませんでした" }, { status: 500 });
    }
  }

  if (action === "publish" || action === "reject") {
    const status = action === "publish" ? "published" : "rejected";
    db.prepare("UPDATE drafts SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(status, d.id);
    return Response.json({ ok: true, status });
  }

  if (action === "revise") {
    if (!note?.trim()) return Response.json({ error: "直してほしいことを一言入れてください" }, { status: 400 });
    const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(d.shop_id) as Shop;
    const { transcript } = db.prepare("SELECT transcript FROM hearings WHERE id = ?").get(d.hearing_id) as { transcript: string };
    try {
      const p = await reviseDraft(
        shop,
        transcript,
        {
          name: d.name,
          description: d.description,
          price_yen: d.price_yen,
          recommend_reason: d.recommend_reason,
          target_customer: d.target_customer,
        },
        note.trim(),
      );
      db.prepare(
        `UPDATE drafts SET name = ?, description = ?, price_yen = ?, recommend_reason = ?, target_customer = ?,
         status = 'draft', revision_note = ?, stripe_product_id = NULL, stripe_price_id = NULL, updated_at = datetime('now','localtime') WHERE id = ?`,
      ).run(p.name, p.description, p.price_yen, p.recommend_reason, p.target_customer, note.trim(), d.id);
      return Response.json({ ok: true });
    } catch (e) {
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "作り直せませんでした" }, { status: 500 });
    }
  }

  return Response.json({ error: "不明な操作です" }, { status: 400 });
}
