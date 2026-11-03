// Stripe（テストモード専用）。本番キー（sk_live_）は受け付けない。
import Stripe from "stripe";
import { getDb, getSetting, type Draft } from "@/lib/db";

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) {
    throw new Error("Stripe はテスト用キー（sk_test_）だけ使えます。.env を確認してください。");
  }
  if (!client) client = new Stripe(key);
  return client;
}

// 商品を公開したときに、Stripe の商品と価格を作る（すでにあれば作らない）
export async function ensureStripePrice(d: Draft): Promise<string> {
  if (d.stripe_price_id) return d.stripe_price_id;
  const product = await stripe().products.create({
    name: d.name,
    description: d.description.slice(0, 500),
    metadata: { draft_id: String(d.id), shop_id: String(d.shop_id) },
  });
  const price = await stripe().prices.create({
    product: product.id,
    currency: "jpy",
    unit_amount: d.price_yen,
  });
  getDb()
    .prepare("UPDATE drafts SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?")
    .run(product.id, price.id, d.id);
  return price.id;
}

// 取り分の計算：売上の1割が YMM、そのうちの設定割合がパートナー、残りが店主。1円未満は切り捨て。
export function splitAmount(amount: number, ymmRate: number, partnerShare: number) {
  const ymmGross = Math.floor(amount * ymmRate);
  const partner = Math.floor(ymmGross * partnerShare);
  return { owner: amount - ymmGross, ymm: ymmGross - partner, partner };
}

// 支払いが終わった決済を、注文として1回だけ記録する（Webhook と完了ページの両方から呼ばれても二重にならない）
export function recordOrder(session: Stripe.Checkout.Session): { created: boolean } {
  if (session.payment_status !== "paid") return { created: false };
  const db = getDb();
  const exists = db.prepare("SELECT 1 FROM orders WHERE stripe_session_id = ?").get(session.id);
  if (exists) return { created: false };

  const draftId = Number(session.metadata?.draft_id);
  const quantity = Number(session.metadata?.quantity ?? 1);
  const d = db.prepare("SELECT * FROM drafts WHERE id = ?").get(draftId) as Draft | undefined;
  if (!d) throw new Error(`注文の商品が見つかりません（draft_id=${draftId}）`);

  const amount = session.amount_total ?? d.price_yen * quantity;
  const ymmRate = getSetting("ymm_rate");
  const partnerShare = getSetting("partner_share");
  const s = splitAmount(amount, ymmRate, partnerShare);
  db.prepare(
    `INSERT OR IGNORE INTO orders
     (stripe_session_id, draft_id, shop_id, quantity, amount_yen, owner_yen, ymm_yen, partner_yen, ymm_rate, partner_share)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(session.id, d.id, d.shop_id, quantity, amount, s.owner, s.ymm, s.partner, ymmRate, partnerShare);
  return { created: true };
}
