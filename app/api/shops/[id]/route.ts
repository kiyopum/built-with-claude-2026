import { prefFromAddress } from "@/lib/shipping";
import { guardShop } from "@/lib/auth";
import { getDb, SELLER_KEYS, type Shop } from "@/lib/db";
import { thisMonth } from "@/lib/checkin";

// お店のページ用：お店の情報（理念）と商品の一覧
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  const rows = db
    .prepare(
      `SELECT d.id, d.name, d.price_yen, d.status, d.legal_json,
              (SELECT file FROM product_photos p WHERE p.draft_id = d.id ORDER BY sort LIMIT 1) AS main_photo
       FROM drafts d WHERE d.shop_id = ? ORDER BY d.id DESC`,
    )
    .all(shop.id) as { id: number; name: string; price_yen: number; status: string; legal_json: string | null; main_photo: string | null }[];
  const products = rows.map(({ legal_json, main_photo, ...r }) => ({
    ...r,
    verdict: legal_json ? (JSON.parse(legal_json) as { verdict: string }).verdict : null,
    photo: main_photo ? `/api/photos/${main_photo}` : null,
  }));
  return Response.json({
    shop: {
      id: shop.id,
      name: shop.name,
      category: shop.category,
      area: shop.area,
      philosophy_text: shop.philosophy_text,
      philosophy_status: shop.philosophy_status,
      website_url: shop.website_url,
      website_notes: shop.website_notes,
      shipping_yen: shop.shipping_yen,
      prefecture: shop.prefecture,
      pickup_ok: !!shop.pickup_ok,
      online_label: !!shop.online_label,
      // 都道府県の初期値の候補（住所の書き出しから。決めるのは人）
      prefecture_hint: prefFromAddress(shop.seller_address),
      has_pin: !!shop.release_pin_hash,
      // 担当がお休み中か（理由は持たない・出さない）
      partner_resting: shop.partner_id != null && (db.prepare("SELECT rest_month FROM users WHERE id = ?").get(shop.partner_id) as { rest_month: string | null } | undefined)?.rest_month === thisMonth(),
      seller: Object.fromEntries(SELLER_KEYS.map((k) => [k, shop[k] ?? ""])),
    },
    products,
  });
}
