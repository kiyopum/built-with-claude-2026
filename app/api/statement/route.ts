import { connection } from "next/server";
import { getDb, getSetting } from "@/lib/db";

// 画面3：成果明細。注文ごとの取り分と合計、今の分け方の設定
export async function GET() {
  await connection();
  const db = getDb();
  const orders = db
    .prepare(
      `SELECT o.id, o.created_at, o.draft_id, o.quantity, o.amount_yen, o.owner_yen, o.partner_yen, o.ymm_yen, o.fee_yen,
              o.ymm_rate, o.partner_share, o.ref, d.name AS product_name, s.name AS shop_name
       FROM orders o JOIN drafts d ON d.id = o.draft_id JOIN shops s ON s.id = o.shop_id
       ORDER BY o.id DESC`,
    )
    .all();
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount_yen),0) AS amount, COALESCE(SUM(owner_yen),0) AS owner,
              COALESCE(SUM(partner_yen),0) AS partner, COALESCE(SUM(ymm_yen),0) AS ymm, COALESCE(SUM(fee_yen),0) AS fee
       FROM orders`,
    )
    .get();
  const byShop = db
    .prepare(
      `SELECT s.name AS shop_name, COUNT(*) AS count, SUM(o.amount_yen) AS amount, SUM(o.owner_yen) AS owner
       FROM orders o JOIN shops s ON s.id = o.shop_id GROUP BY s.id ORDER BY amount DESC`,
    )
    .all();
  const settings = {
    ymm_rate: getSetting("ymm_rate"),
    partner_share: getSetting("partner_share"),
    stripe_fee_rate: getSetting("stripe_fee_rate"),
  };
  return Response.json({ orders, totals, byShop, settings });
}
