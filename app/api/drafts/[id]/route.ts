import { getDb, type Draft } from "@/lib/db";
import { reviseDraft, recheckLegal, type Legal, type DraftFields } from "@/lib/claude";
import { loadProductContext } from "@/lib/context";
import { ensureStripePrice } from "@/lib/stripe";
import { loadPhotos, photoUrls } from "@/lib/files";

// パートナーの修正画面用：商品1件（写真つき）
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = getDb()
    .prepare("SELECT d.*, s.name AS shop_name FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.id = ?")
    .get(Number(id)) as Draft | undefined;
  if (!d) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  return Response.json({ draft: { ...d, photos: photoUrls(d.id) } });
}

// 店主の確認：
//   publish（このまま公開）/ reject（却下）
//   edit（手で直す → 文はそのまま、法律チェックだけやり直す）
//   revise（AIに作り直してもらう → 文も法律チェックも作り直す）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { action: string; note?: string; fields?: Partial<DraftFields>; by?: string };
  const db = getDb();
  const d = db.prepare("SELECT * FROM drafts WHERE id = ?").get(Number(id)) as Draft | undefined;
  if (!d) return Response.json({ error: "下書きが見つかりません" }, { status: 404 });

  if (body.action === "publish") {
    // 法律の判定で「このままでは販売できない」ものは公開させない
    const legal = d.legal_json ? (JSON.parse(d.legal_json) as Legal) : null;
    if (legal?.verdict === "このままでは販売できない") {
      return Response.json(
        { error: "法律の判定が「このままでは販売できない」のため公開できません。直してから、もう一度確かめてください。" },
        { status: 400 },
      );
    }
    try {
      await ensureStripePrice(d); // 購入ボタンで使う Stripe の商品と価格
    } catch (e) {
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Stripe に商品を登録できませんでした" }, { status: 500 });
    }
    db.prepare("UPDATE drafts SET status = 'published', updated_at = datetime('now','localtime') WHERE id = ?").run(d.id);
    return Response.json({ ok: true });
  }

  if (body.action === "reject") {
    db.prepare("UPDATE drafts SET status = 'rejected', updated_at = datetime('now','localtime') WHERE id = ?").run(d.id);
    return Response.json({ ok: true });
  }

  // ここから先は Claude を使う：お店・ヒアリング・ラベル・法律の調査をそろえる
  const { c, current } = loadProductContext(d);

  try {
    if (body.action === "edit") {
      const f = body.fields ?? {};
      const next: DraftFields = {
        name: String(f.name ?? current.name).trim(),
        description: String(f.description ?? current.description).trim(),
        price_yen: Math.max(0, Math.floor(Number(f.price_yen ?? current.price_yen))),
        recommend_reason: String(f.recommend_reason ?? current.recommend_reason).trim(),
        target_customer: String(f.target_customer ?? current.target_customer).trim(),
      };
      if (!next.name || !next.description || !next.price_yen) {
        return Response.json({ error: "商品名・紹介文・価格は空にできません" }, { status: 400 });
      }
      const legal = await recheckLegal(c, next, loadPhotos(d.id));
      db.prepare(
        `UPDATE drafts SET name = ?, description = ?, price_yen = ?, recommend_reason = ?, target_customer = ?, legal_json = ?,
         status = 'draft', revision_note = ?, stripe_product_id = NULL, stripe_price_id = NULL,
         updated_at = datetime('now','localtime') WHERE id = ?`,
      ).run(next.name, next.description, next.price_yen, next.recommend_reason, next.target_customer, JSON.stringify(legal), body.by === "partner" ? "（パートナーが修正）" : "（店主が手で修正）", d.id);
      return Response.json({ ok: true });
    }

    if (body.action === "revise") {
      const note = body.note?.trim();
      if (!note) return Response.json({ error: "直してほしいことを一言入れてください" }, { status: 400 });
      const p = await reviseDraft(c, current, note, loadPhotos(d.id));
      db.prepare(
        `UPDATE drafts SET name = ?, description = ?, price_yen = ?, recommend_reason = ?, target_customer = ?, legal_json = ?,
         status = 'draft', revision_note = ?, stripe_product_id = NULL, stripe_price_id = NULL,
         updated_at = datetime('now','localtime') WHERE id = ?`,
      ).run(p.name, p.description, p.price_yen, p.recommend_reason, p.target_customer, JSON.stringify(p.legal), note, d.id);
      return Response.json({ ok: true });
    }
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "Claude で処理できませんでした" }, { status: 500 });
  }

  return Response.json({ error: "不明な操作です" }, { status: 400 });
}
