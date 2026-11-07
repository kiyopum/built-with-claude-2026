import { getDb, type Draft, type Shop } from "@/lib/db";
import { ensureStripePrice, stripe } from "@/lib/stripe";
import { shippingForOrder, shippingInfo } from "@/lib/shipquote";

// 購入ボタン → Stripe の決済画面（テストモード）へ。
//   送料：送料込みの商品は届け先の都道府県といちばん安い送り方で、それ以外は事業者の全国一律で。届け先（住所）は決済画面で入れてもらう（デモ用。在庫は扱わない）
export async function POST(req: Request) {
  const { draftId, quantity, ref, dest } = (await req.json()) as { draftId: number; quantity?: number; ref?: string; dest?: string };
  // どのパートナーのシェアから来たか（英数字だけ・20字まで）
  const refCode = typeof ref === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(ref) ? ref : "";
  const d = getDb().prepare("SELECT * FROM drafts WHERE id = ? AND status = 'published'").get(draftId) as Draft | undefined;
  if (!d) return Response.json({ error: "この商品は公開されていません" }, { status: 404 });
  // 数量は個数。箱入りの商品は「1箱に入れる数 × 箱の数（10箱まで）」
  const qtyRaw = Math.min(Math.max(Math.floor(quantity ?? 1), 1), 10 * Math.max(1, d.per_box ?? 1));
  // 箱入りの商品は、個数を箱の倍数にそろえる（20個入りなら 20・40・…）
  const unit = d.kind === "service" ? 1 : Math.max(1, d.per_box ?? 1);
  const qty = Math.ceil(qtyRaw / unit) * unit;

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
    // 箱入りの商品（1箱に入れる数が2以上）は、決済画面にも「商品名（20個入り）× 箱の数」で出す（単価×個数だと、お客さまが単価で買うように見えるため）
    const perBox = service ? 1 : Math.max(1, d.per_box ?? 1);
    const boxes = Math.ceil(qty / perBox);
    const lineItems =
      perBox > 1
        ? [{ price_data: { currency: "jpy", unit_amount: d.price_yen * perBox, product_data: { name: `${d.name}（${perBox}個入り）` } }, quantity: boxes }]
        : [{ price: await ensureStripePrice(d), quantity: qty }];
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      // 事業者のところで受け取るときは住所を聞かない
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
