import { parseShipDays, prefFromAddress } from "@/lib/shipping";
import { guardShop } from "@/lib/auth";
import { getDb, getSetting, SELLER_KEYS, type Shop, REVISE_LIMIT } from "@/lib/db";
import { thisMonth } from "@/lib/checkin";
import { proposalsOf } from "@/lib/proposals";
import type { Notice } from "@/lib/notify";

// 事業者のページ用：事業者の情報（理念）と商品の一覧
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "事業者が見つかりません" }, { status: 404 });
  const rows = db
    .prepare(
      `SELECT d.id, d.name, d.price_yen, d.status, d.legal_json, d.nudge_json, d.nudge_at,
              -- 公開から nudge_days 日たって、その間に注文のない商品（責めずに次の一歩を出す）
              (d.status = 'published'
                AND julianday('now','localtime') - julianday(COALESCE(d.published_at, d.updated_at)) >= ?
                AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.draft_id = d.id AND julianday('now','localtime') - julianday(o.created_at) < ?)) AS quiet,
              (SELECT file FROM product_photos p WHERE p.draft_id = d.id ORDER BY sort LIMIT 1) AS main_photo
       FROM drafts d WHERE d.shop_id = ? ORDER BY d.id DESC`,
    )
    .all(getSetting("nudge_days"), getSetting("nudge_days"), shop.id) as { id: number; name: string; price_yen: number; status: string; legal_json: string | null; main_photo: string | null; nudge_json: string | null; quiet: number }[];
  const products = rows.map(({ legal_json, main_photo, nudge_json, ...r }) => ({
    ...r,
    quiet: !!r.quiet,
    nudge: nudge_json ? JSON.parse(nudge_json) : null,
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
      intro_revise_left: Math.max(0, REVISE_LIMIT - (shop.intro_revise_count ?? 0)),
      prepared: !!shop.prep_questions, // 事務局が先に調べてある（質問・ホームページ・法律）
      visit_on: shop.visit_on,
      shipping_yen: shop.shipping_yen,
      prefecture: shop.prefecture,
      pickup_ok: !!shop.pickup_ok,
      ship_days: parseShipDays(shop.ship_days),
      // 同じ都道府県で、発送する曜日を決めているほかの事業者の数（曜日ごと）。名前は出さない
      neighbor_days: shop.prefecture
        ? (db.prepare("SELECT ship_days FROM shops WHERE prefecture = ? AND id != ? AND ship_days IS NOT NULL").all(shop.prefecture, shop.id) as { ship_days: string }[])
            .flatMap((r) => parseShipDays(r.ship_days))
            .reduce((a, d) => ((a[d] = (a[d] ?? 0) + 1), a), {} as Record<number, number>)
        : {},
      online_label: !!shop.online_label,
      // 都道府県の初期値の候補（住所の書き出しから。決めるのは人）
      prefecture_hint: prefFromAddress(shop.seller_address),
      has_pin: !!shop.release_pin_hash,
      // 次の商品の提案（Claude が出した案）。材料（事業者の話か商品）ができてから出せる
      proposals: proposalsOf(shop),
      proposals_left: Math.max(0, REVISE_LIMIT - (shop.proposals_count ?? 0)),
      can_propose: !!(shop.philosophy_text || shop.philosophy_transcript || rows.some((r) => r.status !== "rejected")),
      // 取り分の今の決まり（提案の画面で「1つ売れると、あなたにいくら」を出すため。明細の画面と同じ数字）
      split: { goods: getSetting("ymm_rate"), service: getSetting("ymm_rate_service"), share: getSetting("partner_share"), fee: getSetting("stripe_fee_rate") },
      // 担当がお休み中か（理由は持たない・出さない）
      partner_resting: shop.partner_id != null && (db.prepare("SELECT rest_month FROM users WHERE id = ?").get(shop.partner_id) as { rest_month: string | null } | undefined)?.rest_month === thisMonth(),
      seller: Object.fromEntries(SELLER_KEYS.map((k) => [k, shop[k] ?? ""])),
      // 新しい注文（パートナーがまだ「確認した」を押していないもの）。届け先は出さない（暗証番号で開く「注文と届け先」で見る）
      new_orders: db
        .prepare(
          `SELECT o.id, o.quantity, o.amount_yen, o.created_at, o.notice_json, d.name AS product_name, d.kind
           FROM orders o JOIN drafts d ON d.id = o.draft_id WHERE o.shop_id = ? AND o.partner_seen_at IS NULL ORDER BY o.id DESC`,
        )
        .all(shop.id)
        .map((r) => {
          const { notice_json, ...o } = r as { notice_json: string | null; id: number; quantity: number; amount_yen: number; created_at: string; product_name: string; kind: string };
          return { ...o, notice: notice_json ? (JSON.parse(notice_json) as Notice) : null };
        }),
    },
    products,
  });
}
