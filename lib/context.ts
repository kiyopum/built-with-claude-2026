// 商品1件について Claude に渡す材料（お店・ヒアリング・ラベル・法律の調査・いまの文）をそろえる
import { getDb, type Draft, type Shop } from "@/lib/db";
import type { DraftFields, LegalResearch, ProductContext } from "@/lib/claude";

export function loadProductContext(d: Draft): { c: ProductContext; current: DraftFields } {
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(d.shop_id) as Shop;
  const h = db.prepare("SELECT transcript, legal_research, label_read FROM hearings WHERE id = ?").get(d.hearing_id) as {
    transcript: string;
    legal_research: string | null;
    label_read: string | null;
  };
  const research: LegalResearch = h.legal_research ? JSON.parse(h.legal_research) : { notes: "（法律の調査なし）", sources: [] };
  return {
    c: { shop, transcript: h.transcript, labelRead: h.label_read ? JSON.parse(h.label_read) : [], research },
    current: {
      name: d.name,
      description: d.description,
      price_yen: d.price_yen,
      recommend_reason: d.recommend_reason,
      target_customer: d.target_customer,
    },
  };
}
