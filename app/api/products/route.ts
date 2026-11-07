import { connection } from "next/server";
import { getDb, type Draft, type Shop } from "@/lib/db";
import { shippingInfo } from "@/lib/shipquote";

// 公開中の商品一覧（お客さま向け）
export async function GET() {
  await connection();
  const products = getDb()
    .prepare(
      `SELECT d.id, d.name, d.description, d.price_yen, d.target_customer, d.size_class, d.weight_g, d.per_box, d.kind, s.name AS shop_name,
              s.prefecture, s.shipping_yen, s.pickup_ok, s.online_label,
              (SELECT '/api/photos/' || file FROM product_photos p WHERE p.draft_id = d.id ORDER BY sort LIMIT 1) AS photo
       FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.status = 'published' ORDER BY d.updated_at DESC`,
    )
    .all() as (Draft & Shop)[];
  // 箱入りの売り値（2026-11-07 きよさん：150円の商品を1個で送ると送料で750円に見える。箱に入れる数をひとまとめにして「20個入り 送料込み 3,600円」と出す）
  const list = products.map(({ size_class, weight_g, per_box, prefecture, shipping_yen, pickup_ok, online_label, ...p }) => {
    const info = shippingInfo({ size_class, weight_g, per_box, kind: p.kind }, { prefecture, shipping_yen, pickup_ok, online_label });
    const pieces = info.mode === "none" ? 1 : info.perBox;
    // 送料込みの最安（全国一律なら一律の送料。送料が未定なら null＝商品代だけ出す）
    const incl_min = info.mode === "included" ? p.price_yen * pieces + info.min : info.mode === "flat" && info.yen != null ? p.price_yen * pieces + info.yen : null;
    return { ...p, pieces, incl_min, unit_total: p.price_yen * pieces };
  });
  return Response.json({ products: list });
}
