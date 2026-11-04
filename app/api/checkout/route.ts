import { getDb, type Draft, type Shop } from "@/lib/db";
import { ensureStripePrice, stripe } from "@/lib/stripe";
import { shippingForOrder, shippingInfo } from "@/lib/shipquote";

// 購入ボタン → Stripe の決済画面（テストモード）へ。
//   送料：送料込みの商品は届け先の都道府県といちばん安い送り方で、それ以外はお店の全国一律で。届け先（住所）は決済画面で入れてもらう（デモ用。在庫は扱わない）
export async function POST(req: Request) {
  const { draftId, quantity, ref, dest } = (await req.json()) as { draftId: number; quantity?: number; ref?: string; dest?: string };
  // どのパートナーのシェアから来たか（英数字だけ・20字まで）
  const refCode = typeof ref === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(ref) ? ref : "";
  const qty = Math.min(Math.max(Math.floor(quantity ?? 1), 1), 10);
  const d = getDb().prepare("SELECT * FROM drafts WHERE id = ? AND status = 'published'").get(draftId) as Draft | undefined;
  if (!d) return Response.json({ error: "この商品は公開されていません" }, { status: 404 });

  // 戻り先は、いま開いているページのアドレスから作る（Mac でも iPhone でも同じように戻れる）
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const shop = getDb().prepare("SELECT shipping_yen, prefecture, pickup_ok, online_label FROM shops WHERE id = ?").get(d.shop_id) as Pick<Shop, "shipping_yen" | "prefecture" | "pickup_ok" | "online_label">;
  // 送料：送料込みの商品は届け先の都道府県で、そうでない商品はお店の全国一律で。決まっていなければ買えない
  //   商品の値段（Stripe の価格）はそのまま。送料は注文ごとに1回（1箱に入る数で箱の数を出す）＝2個目からは送料分が安くなる
  const info = shippingInfo(d, shop);
  const ship = shippingForOrder(info, typeof dest === "string" ? dest : "", qty);
  // サービスは送らないので、住所も送料も聞かない（メールアドレスは決済画面がいつも聞く＝お店からの案内に使う）
  const service = info.mode === "none";
  if ("error" in ship) return Response.json({ error: ship.error }, { status: 400 });
  try {
    const price = await ensureStripePrice(d);
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: qty }],
      // お店で受け取るときは住所を聞かない
      ...(ship.pickup || service ? {} : { shipping_address_collection: { allowed_countries: ["JP" as const] } }),
      ...(service ? {} : { shipping_options: [{ shipping_rate_data: { type: "fixed_amount" as const, display_name: ship.label, fixed_amount: { amount: ship.yen, currency: "jpy" } } }] }),
      success_url: `${origin}/p/${d.id}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/p/${d.id}`,
      metadata: { draft_id: String(d.id), quantity: String(qty), ref: refCode, dest: service ? "service" : ship.pickup ? "pickup" : ship.pref ?? "", ship_method: ship.method },
    });
    return Response.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "決済画面を開けませんでした" }, { status: 500 });
  }
}
