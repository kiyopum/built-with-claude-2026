import { connection } from "next/server";
import { getDb, getSetting, getText } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// 画面3：成果明細
//   パートナー：自分が担当した事業者の注文と、自分が紹介して売れた注文。自分の取り分だけ
//   YMM 管理：全部の注文と、事業者さん・パートナー・YMM・手数料の取り分、分け方の設定
export async function GET() {
  await connection();
  const u = await requireUser();
  if (u instanceof Response) return u;
  const db = getDb();
  const settings = {
    ymm_rate: getSetting("ymm_rate"),
    ymm_rate_service: getSetting("ymm_rate_service"),
    partner_share: getSetting("partner_share"),
    stripe_fee_rate: getSetting("stripe_fee_rate"),
    payment_terms: getText("payment_terms"),
  };

  if (u.role === "partner") {
    const orders = db
      .prepare(
        `SELECT o.id, o.created_at, o.draft_id, o.quantity, o.amount_yen, o.shipping_yen, o.partner_yen,
                o.owner_partner_id, o.owner_partner_yen, o.referrer_id, o.referrer_yen,
                d.name AS product_name, s.name AS shop_name,
                (CASE WHEN o.owner_partner_id = ? THEN o.owner_partner_yen ELSE 0 END) +
                (CASE WHEN o.referrer_id = ? AND o.referrer_id IS NOT o.owner_partner_id THEN o.referrer_yen ELSE 0 END) AS my_yen
         FROM orders o JOIN drafts d ON d.id = o.draft_id JOIN shops s ON s.id = o.shop_id
         WHERE o.owner_partner_id = ? OR o.referrer_id = ?
         ORDER BY o.id DESC`,
      )
      .all(u.id, u.id, u.id, u.id) as { my_yen: number; owner_partner_id: number | null; referrer_id: number | null; amount_yen: number; shipping_yen: number }[];
    const mine = orders.map((o) => ({
      ...o,
      role: o.owner_partner_id === u.id && o.referrer_id === u.id ? "担当・自分で紹介" : o.owner_partner_id === u.id ? (o.referrer_id ? "担当（ほかの人が紹介）" : "担当") : "紹介",
    }));
    const total = mine.reduce((a, o) => a + o.my_yen, 0);
    const sales = mine.reduce((a, o) => a + o.amount_yen - o.shipping_yen, 0);
    return Response.json({ view: "partner", me: u, orders: mine, totals: { count: mine.length, sales, mine: total }, settings });
  }

  const orders = db
    .prepare(
      `SELECT o.id, o.created_at, o.draft_id, o.quantity, o.amount_yen, o.shipping_yen, o.owner_yen, o.partner_yen, o.ymm_yen, o.fee_yen,
              o.ymm_rate, o.partner_share, o.ref, o.owner_partner_yen, o.referrer_yen,
              op.name AS owner_partner_name, rp.name AS referrer_name,
              d.name AS product_name, s.name AS shop_name
       FROM orders o JOIN drafts d ON d.id = o.draft_id JOIN shops s ON s.id = o.shop_id
       LEFT JOIN users op ON op.id = o.owner_partner_id LEFT JOIN users rp ON rp.id = o.referrer_id
       ORDER BY o.id DESC`,
    )
    .all();
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount_yen),0) AS amount, COALESCE(SUM(owner_yen),0) AS owner,
              COALESCE(SUM(partner_yen),0) AS partner, COALESCE(SUM(ymm_yen),0) AS ymm, COALESCE(SUM(fee_yen),0) AS fee,
              COALESCE(SUM(shipping_yen),0) AS shipping
       FROM orders`,
    )
    .get();
  const byShop = db
    .prepare(
      `SELECT s.name AS shop_name, COUNT(*) AS count, SUM(o.amount_yen) AS amount, SUM(o.owner_yen) AS owner
       FROM orders o JOIN shops s ON s.id = o.shop_id GROUP BY s.id ORDER BY s.id`,
    )
    .all();
  // パートナーごとの取り分（担当分＋紹介分）
  const byPartner = db
    .prepare(
      `SELECT u.id, u.name,
              COALESCE((SELECT SUM(owner_partner_yen) FROM orders WHERE owner_partner_id = u.id), 0) AS owner_yen,
              COALESCE((SELECT SUM(referrer_yen) FROM orders WHERE referrer_id = u.id AND referrer_id IS NOT owner_partner_id), 0) AS referrer_yen
       FROM users u WHERE u.role = 'partner' ORDER BY u.id`,
    )
    .all();
  return Response.json({ view: "admin", me: u, orders, totals, byShop, byPartner, settings });
}
