// 取り分の計算（C案・2026-11-03 きよさん決定）。サーバー（注文の記録）と明細画面のシミュレーションで同じものを使う。
//   売上の ymmRate（物販は1割、サービスは既定5割）が YMM の取り分。そこから決済手数料を先に払い、残りをパートナーと YMM で分ける。残りが店主。
//   手数料を先に引くので、いくら売れても YMM が手数料で赤字にならない。1円未満は切り捨て（手数料は四捨五入）。
export function splitAmount(amount: number, ymmRate: number, feeRate: number, partnerShare: number) {
  const ymmGross = Math.floor(amount * ymmRate);
  const fee = Math.round(amount * feeRate);
  const rest = Math.max(ymmGross - fee, 0);
  const partner = Math.floor(rest * partnerShare);
  return { owner: amount - ymmGross, fee, partner, ymm: rest - partner };
}

// パートナーの取り分を、お店の担当と紹介した人で分ける（2026-11-03 きよさん決定：半分ずつ）
//   自分の担当の商品を自分で紹介 → 全部担当に。紹介なし → 全部担当に。担当がいないお店 → 全部紹介者に
//   1円の端数は担当に（合計がずれないように）
export function splitPartner(partner: number, ownerPartnerId: number | null, referrerId: number | null) {
  if (referrerId && ownerPartnerId && referrerId !== ownerPartnerId) {
    const referrerYen = Math.floor(partner / 2);
    return { ownerPartnerId, ownerPartnerYen: partner - referrerYen, referrerId, referrerYen };
  }
  if (referrerId && !ownerPartnerId) return { ownerPartnerId: null, ownerPartnerYen: 0, referrerId, referrerYen: partner };
  return { ownerPartnerId, ownerPartnerYen: partner, referrerId: referrerId === ownerPartnerId ? referrerId : null, referrerYen: 0 };
}

// 設定できる範囲（画面とサーバーで同じ）
export const RATE_LIMITS = {
  ymm_rate: { min: 0.05, max: 0.3 },
  // サービス（ライブ配信・講座など）は講師の取り分が物販より小さい分、YMM とパートナーの責任も大きい（既定5割）
  ymm_rate_service: { min: 0.05, max: 0.7 },
  partner_share: { min: 0, max: 1 },
  stripe_fee_rate: { min: 0, max: 0.1 },
} as const;

// 商品ごとに YMM 管理が決める取り分の範囲
export const ITEM_RATE_LIMIT = { min: 0.05, max: 0.7 } as const;
