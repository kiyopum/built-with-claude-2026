import { getDb, type Draft } from "@/lib/db";
import { ensureStripePrice, stripe } from "@/lib/stripe";

// 購入ボタン → Stripe の決済画面（テストモード）へ。配送先・在庫は扱わない
export async function POST(req: Request) {
  const { draftId, quantity, ref } = (await req.json()) as { draftId: number; quantity?: number; ref?: string };
  // どのパートナーのシェアから来たか（英数字だけ・20字まで）
  const refCode = typeof ref === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(ref) ? ref : "";
  const qty = Math.min(Math.max(Math.floor(quantity ?? 1), 1), 10);
  const d = getDb().prepare("SELECT * FROM drafts WHERE id = ? AND status = 'published'").get(draftId) as Draft | undefined;
  if (!d) return Response.json({ error: "この商品は公開されていません" }, { status: 404 });

  // 戻り先は、いま開いているページのアドレスから作る（Mac でも iPhone でも同じように戻れる）
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  try {
    const price = await ensureStripePrice(d);
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: qty }],
      success_url: `${origin}/p/${d.id}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/p/${d.id}`,
      metadata: { draft_id: String(d.id), quantity: String(qty), ref: refCode },
    });
    return Response.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "決済画面を開けませんでした" }, { status: 500 });
  }
}
