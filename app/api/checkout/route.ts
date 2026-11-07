import { getDb, type Draft, type Shop } from "@/lib/db";
import { ensureStripePrice, stripe } from "@/lib/stripe";
import { shippingForOrder, shippingInfo } from "@/lib/shipquote";
import { parseBundles } from "@/lib/bundles";

// 購入ボタン → Stripe の決済画面（テストモード）へ。
//   送料：送料込みの商品は届け先の都道府県といちばん安い送り方で、それ以外は事業者の全国一律で。届け先（住所）は決済画面で入れてもらう（デモ用。在庫は扱わない）
export async function POST(req: Request) {
  const { draftId, quantity, ref, dest, bundle } = (await req.json()) as { draftId: number; quantity?: number; ref?: string; dest?: string; bundle?: number };
  // どのパートナーのシェアから来たか（英数字だけ・20字まで）
  const refCode = typeof ref === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(ref) ? ref : "";
  const d = getDb().prepare("SELECT * FROM drafts WHERE id = ? AND status = 'published'").get(draftId) as Draft | undefined;
  if (!d) return Response.json({ error: "この商品は公開されていません" }, { status: 404 });
  // まとめ買い（○個セット）：事業者さんが決めたセットだけ。個数はセットの個数で、送料の箱の数もそれで出す
  const set = bundle ? parseBundles(d.bundles_json).find((b) => b.qty === Number(bundle)) : undefined;
  if (bundle && !set) return Response.json({ error: "そのまとめ買いは今はありません" }, { status: 400 });
  const qty = set ? set.qty : Math.min(Math.max(Math.floor(quantity ?? 1), 1), Math.max(10, d.per_box ?? 1));

  // 戻り先は、いま開いているページのアドレスから作る（Mac でも iPhone でも同じように戻れる）
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const shop = getDb().prepare("SELECT shipping_yen, prefecture, pickup_ok, online_label FROM shops WHERE id = ?").get(d.shop_id) as Pick<Shop, "shipping_yen" | "prefecture" | "pickup_ok" | "online_label">;
  // 送料：送料込みの商品は届け先の都道府県で、そうでない商品は事業者の全国一律で。決まっていなければ買えない
  //   商品の値段（Stripe の価格）はそのまま。送料は注文ごとに1回（1箱に入る数で箱の数を出す）＝2個目からは送料分が安くなる
  const info = shippingInfo(d, shop);
  const ship = shippingForOrder(info, typeof dest === "string" ? dest : "", qty);
  // サービスは送らないので、住所も送料も聞かない（メールアドレスは決済画面がいつも聞く＝事業者さんからの案内に使う）
  const service = info.mode === "none";
  if ("error" in ship) return Response.json({ error: ship.error }, { status: 400 });
  try {
    const price = set ? null : await ensureStripePrice(d);
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: set
        ? [{ price_data: { currency: "jpy", unit_amount: set.price_yen, product_data: { name: `${d.name}（${set.qty}個セット）` } }, quantity: 1 }]
        : [{ price: price!, quantity: qty }],
      // 事業者のところで受け取るときは住所を聞かない
      ...(ship.pickup || service ? {} : { shipping_address_collection: { allowed_countries: ["JP" as const] } }),
      ...(service ? {} : { shipping_options: [{ shipping_rate_data: { type: "fixed_amount" as const, display_name: ship.label, fixed_amount: { amount: ship.yen, currency: "jpy" } } }] }),
      success_url: `${origin}/p/${d.id}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/p/${d.id}`,
      metadata: { draft_id: String(d.id), quantity: String(qty), bundle: set ? String(set.qty) : "", ref: refCode, dest: service ? "service" : ship.pickup ? "pickup" : ship.pref ?? "", ship_method: ship.method },
    });
    return Response.json({ url: session.url });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "決済画面を開けませんでした" }, { status: 500 });
  }
}
