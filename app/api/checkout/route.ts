import { getDb, type Draft, type Shop } from "@/lib/db";
import { ensureStripePrice, stripe } from "@/lib/stripe";

// 購入ボタン → Stripe の決済画面（テストモード）へ。
//   送料はお店ごとの全国一律で、商品代とは別に払ってもらう。届け先（住所）は決済画面で入れてもらう（デモ用。在庫は扱わない）
export async function POST(req: Request) {
  const { draftId, quantity, ref } = (await req.json()) as { draftId: number; quantity?: number; ref?: string };
  // どのパートナーのシェアから来たか（英数字だけ・20字まで）
  const refCode = typeof ref === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(ref) ? ref : "";
  const qty = Math.min(Math.max(Math.floor(quantity ?? 1), 1), 10);
  const d = getDb().prepare("SELECT * FROM drafts WHERE id = ? AND status = 'published'").get(draftId) as Draft | undefined;
  if (!d) return Response.json({ error: "この商品は公開されていません" }, { status: 404 });

  // 戻り先は、いま開いているページのアドレスから作る（Mac でも iPhone でも同じように戻れる）
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const shop = getDb().prepare("SELECT shipping_yen FROM shops WHERE id = ?").get(d.shop_id) as Pick<Shop, "shipping_yen">;
  const shipping = shop?.shipping_yen ?? 0;
  try {
    const price = await ensureStripePrice(d);
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: qty }],
      shipping_address_collection: { allowed_countries: ["JP"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: shipping ? "送料（全国一律）" : "送料無料",
            fixed_amount: { amount: shipping, currency: "jpy" },
          },
        },
      ],
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
