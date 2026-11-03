import { getDb, type Draft, type Shop } from "@/lib/db";
import { reviseDraft, type LegalResearch, type Legal } from "@/lib/claude";
import { ensureStripePrice } from "@/lib/stripe";

// 店主の三択：publish（このまま公開）/ revise（修正を頼む）/ reject（却下）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { action, note } = (await req.json()) as { action: string; note?: string };
  const db = getDb();
  const d = db.prepare("SELECT * FROM drafts WHERE id = ?").get(Number(id)) as Draft | undefined;
  if (!d) return Response.json({ error: "ドラフトが見つかりません" }, { status: 404 });

  if (action === "publish") {
    // 法律の判定で「このままでは販売できない」ものは公開させない
    const legal = d.legal_json ? (JSON.parse(d.legal_json) as Legal) : null;
    if (legal?.verdict === "このままでは販売できない") {
      return Response.json(
        { error: "法律の判定が「このままでは販売できない」のため公開できません。「修正を頼む」で直すか、却下してください。" },
        { status: 400 },
      );
    }
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
    const h = db.prepare("SELECT transcript, legal_research FROM hearings WHERE id = ?").get(d.hearing_id) as {
      transcript: string;
      legal_research: string | null;
    };
    const research: LegalResearch = h.legal_research ? JSON.parse(h.legal_research) : { notes: "（法律の調査なし）", sources: [] };
    try {
      const p = await reviseDraft(
        shop,
        h.transcript,
        research,
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
        `UPDATE drafts SET name = ?, description = ?, price_yen = ?, recommend_reason = ?, target_customer = ?, legal_json = ?,
         status = 'draft', revision_note = ?, stripe_product_id = NULL, stripe_price_id = NULL, updated_at = datetime('now','localtime') WHERE id = ?`,
      ).run(p.name, p.description, p.price_yen, p.recommend_reason, p.target_customer, JSON.stringify(p.legal), note.trim(), d.id);
      return Response.json({ ok: true });
    } catch (e) {
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "作り直せませんでした" }, { status: 500 });
    }
  }

  return Response.json({ error: "不明な操作です" }, { status: 400 });
}
