// まとめ買いの値段（2026-11-07 きよさん：150円のような商品は「何個でいくら」の需要が往々にしてある。送料1回分と合わせてお得になるように）
//   事業者さんが「○個で○円」を決める（最大3つ）。Claude は値段を決めない。
//   お客さまは「1個ずつ」か「○個セット」を選ぶ。セットの値段は事業者さんが入れた金額そのまま。

export type Bundle = { qty: number; price_yen: number };
export const BUNDLE_MAX = 3;
export const BUNDLE_QTY_MAX = 200;

export function parseBundles(json: string | null | undefined): Bundle[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    if (!Array.isArray(a)) return [];
    return a
      .map((b) => ({ qty: Number(b?.qty), price_yen: Number(b?.price_yen) }))
      .filter((b) => Number.isInteger(b.qty) && b.qty >= 2 && b.qty <= BUNDLE_QTY_MAX && Number.isInteger(b.price_yen) && b.price_yen >= 1)
      .sort((x, y) => x.qty - y.qty)
      .slice(0, BUNDLE_MAX);
  } catch {
    return [];
  }
}

// 画面から来たまとめ買いの入力を確かめる。空の行は飛ばす。おかしければ文で返す
export function validateBundles(input: unknown, unitPrice: number): { bundles: Bundle[] } | { error: string } {
  if (input == null) return { bundles: [] };
  if (!Array.isArray(input)) return { error: "まとめ買いの形がちがいます" };
  const out: Bundle[] = [];
  for (const row of input) {
    const qty = Number((row as { qty?: unknown })?.qty);
    const price = Number((row as { price_yen?: unknown })?.price_yen);
    if (!qty && !price) continue; // 空の行
    if (!Number.isInteger(qty) || qty < 2 || qty > BUNDLE_QTY_MAX) return { error: `まとめ買いの個数は 2〜${BUNDLE_QTY_MAX} で入れてください` };
    if (!Number.isInteger(price) || price < 1 || price > 10_000_000) return { error: "まとめ買いの値段を円で入れてください" };
    if (price > unitPrice * qty) return { error: `${qty}個で ${price.toLocaleString()}円は、1個ずつ買う（${(unitPrice * qty).toLocaleString()}円）より高くなっています` };
    if (out.some((b) => b.qty === qty)) return { error: `${qty}個のまとめ買いが2つあります` };
    out.push({ qty, price_yen: price });
  }
  if (out.length > BUNDLE_MAX) return { error: `まとめ買いは ${BUNDLE_MAX} つまでです` };
  return { bundles: out.sort((x, y) => x.qty - y.qty) };
}
