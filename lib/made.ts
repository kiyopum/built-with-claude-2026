// この商品ができるまで（人がしたこと・AI がしたこと）。文ではなく、記録があるかどうかだけで決める。
// 2026-11-07 きよさん：お客さまに見せる情報ではない（理念はこちら側で確かめること）。
//   お客さまの商品ページには出さず、パートナー・YMM 管理が開く商品の管理ページに出す。
import { getDb } from "@/lib/db";

export type Made = { heard: boolean; photos: boolean; legal: boolean; sns: boolean; pin: boolean };

export function madeOf(draftId: number): Made {
  const r = getDb()
    .prepare(
      `SELECT (SELECT COUNT(*) FROM product_photos ph WHERE ph.draft_id = d.id) AS photo_count,
              (SELECT length(h.transcript) FROM hearings h WHERE h.id = d.hearing_id) AS hearing_len,
              d.legal_json IS NOT NULL AS legal, d.sns_json IS NOT NULL AS sns, s.release_pin_hash IS NOT NULL AS has_pin
       FROM drafts d JOIN shops s ON s.id = d.shop_id WHERE d.id = ?`,
    )
    .get(draftId) as { photo_count: number; hearing_len: number | null; legal: number; sns: number; has_pin: number } | undefined;
  return { heard: (r?.hearing_len ?? 0) > 0, photos: (r?.photo_count ?? 0) > 0, legal: !!r?.legal, sns: !!r?.sns, pin: !!r?.has_pin };
}
