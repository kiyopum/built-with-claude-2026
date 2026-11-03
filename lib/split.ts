// 取り分の計算（C案・2026-11-03 きよさん決定）。サーバー（注文の記録）と明細画面のシミュレーションで同じものを使う。
//   売上の ymmRate（1割）が YMM の取り分。そこから決済手数料を先に払い、残りをパートナーと YMM で分ける。残りが店主。
//   手数料を先に引くので、いくら売れても YMM が手数料で赤字にならない。1円未満は切り捨て（手数料は四捨五入）。
export function splitAmount(amount: number, ymmRate: number, feeRate: number, partnerShare: number) {
  const ymmGross = Math.floor(amount * ymmRate);
  const fee = Math.round(amount * feeRate);
  const rest = Math.max(ymmGross - fee, 0);
  const partner = Math.floor(rest * partnerShare);
  return { owner: amount - ymmGross, fee, partner, ymm: rest - partner };
}

// 設定できる範囲（画面とサーバーで同じ）
export const RATE_LIMITS = {
  ymm_rate: { min: 0.05, max: 0.3 },
  partner_share: { min: 0, max: 1 },
  stripe_fee_rate: { min: 0, max: 0.1 },
} as const;
