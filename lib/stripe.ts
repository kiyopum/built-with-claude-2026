// Stripe（テストモード専用）。本番キー（sk_live_）は受け付けない。
import { fullPref, prefOf } from "@/lib/shipping";
import Stripe from "stripe";
import { getDb, getSetting, letterTokenOf, ymmRateOf, type Draft } from "@/lib/db";
import { splitAmount, splitPartner } from "@/lib/split";
import { idOfCode } from "@/lib/auth";

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

  // 商品代と送料を分ける。取り分（YMM・パートナー）は商品代だけで計算する
  const total = session.amount_total ?? d.price_yen * quantity;
  const shipping = session.total_details?.amount_shipping ?? 0;
  const subtotal = total - shipping;
  const ymmRate = ymmRateOf(d); // 物販は1割、サービスは既定5割（商品ごとに YMM 管理が変えられる）
  const partnerShare = getSetting("partner_share");
  const feeRate = getSetting("stripe_fee_rate");
  const s = splitAmount(subtotal, ymmRate, feeRate, partnerShare);
  // 送料は事業者さんに渡る。送料にかかる決済手数料も送料から引く（事業者さんが持つ）
  const shippingFee = Math.round(shipping * feeRate);

  // パートナーの取り分：担当のパートナーと、紹介したパートナーで分ける
  const shop = db.prepare("SELECT partner_id FROM shops WHERE id = ?").get(d.shop_id) as { partner_id: number | null } | undefined;
  const ownerPartner = shop?.partner_id ?? null;
  const refCode = session.metadata?.ref || "";
  const refId = idOfCode(refCode);
  const referrer = refId && db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'partner'").get(refId) ? refId : null;
  const p = splitPartner(s.partner, ownerPartner, referrer);

  // 届け先（決済画面で入れてもらったもの）
  const ship = session.collected_information?.shipping_details ?? null;
  const a = ship?.address;
  const pickup = session.metadata?.dest === "pickup";
  const service = d.kind === "service";
  const address = service ? "オンライン（事業者さんからメールでご案内）" : pickup ? "事業者のところで受け取り" : a ? [a.postal_code ? `〒${a.postal_code}` : "", a.state, a.city, a.line1, a.line2].filter(Boolean).join(" ") : null;
  // 先に選んだ届け先の都道府県と、決済画面で入れた住所が違うとき（送料が変わるので、事業者さんと YMM が確かめる）
  const chosen = pickup || service ? null : prefOf(session.metadata?.dest);
  const actual = prefOf(a?.state);
  const warning = chosen && a?.state && actual !== chosen ? `届け先を「${fullPref(chosen)}」で選びましたが、住所は「${a.state}」です。送料が違う可能性があります` : null;

  db.prepare(
    `INSERT OR IGNORE INTO orders
     (stripe_session_id, draft_id, shop_id, quantity, amount_yen, owner_yen, ymm_yen, partner_yen, fee_yen, ymm_rate, partner_share, ref,
      shipping_yen, shipping_fee_yen, ship_name, ship_address, owner_partner_id, owner_partner_yen, referrer_id, referrer_yen,
      ship_pref, ship_method, pickup, ship_warning, customer_email)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id, d.id, d.shop_id, quantity, total, s.owner + shipping - shippingFee, s.ymm, s.partner, s.fee + shippingFee, ymmRate, partnerShare, refCode || null,
    // 事業者のところで受け取るときは住所を聞かないので、決済画面のお名前（なければメール）で、だれが来るか分かるようにする
    shipping, shippingFee, ship?.name ?? session.customer_details?.name ?? session.customer_details?.email ?? null, address, p.ownerPartnerId, p.ownerPartnerYen, p.referrerId, p.referrerYen,
    chosen, service ? "メールでご案内" : session.metadata?.ship_method || null, pickup ? 1 : 0, warning, session.customer_details?.email ?? null,
  );
  return { created: true };
}

// 決済の番号から、ありがとうの往復便の合言葉を出す（決済完了ページで「事業者さんに一言」に使う）
export function letterTokenForSession(sessionId: string): string | null {
  const o = getDb().prepare("SELECT id FROM orders WHERE stripe_session_id = ?").get(sessionId) as { id: number } | undefined;
  return o ? letterTokenOf(o.id) : null;
}
