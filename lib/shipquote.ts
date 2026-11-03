// 商品1件の送料の出し方（商品ページ・決済・注文の記録で同じものを使う）
import type { Draft, Shop } from "@/lib/db";
import { boxesFor, fullPref, isIncluded, prefOf, quotesByPref, type Quote } from "@/lib/shipping";

export type ShippingInfo =
  | { mode: "included"; from: string; quotes: Record<string, Quote>; min: number; max: number; perBox: number; pickup: boolean }
  | { mode: "flat"; yen: number | null; pickup: boolean };

export function shippingInfo(d: Pick<Draft, "size_class" | "weight_g" | "per_box">, shop: Pick<Shop, "prefecture" | "shipping_yen" | "pickup_ok" | "online_label">): ShippingInfo {
  const pickup = !!shop.pickup_ok;
  if (isIncluded(d, shop)) {
    const from = prefOf(shop.prefecture)!;
    const quotes = quotesByPref(d.size_class!, d.weight_g!, from, { onlineLabel: !!shop.online_label });
    if (quotes) {
      const v = Object.values(quotes).map((q) => q.yen);
      return { mode: "included", from, quotes, min: Math.min(...v), max: Math.max(...v), perBox: d.per_box ?? 1, pickup };
    }
  }
  return { mode: "flat", yen: shop.shipping_yen, pickup };
}

// 決済のときの送料。dest は届け先の都道府県か "pickup"（お店で受け取り）
export function shippingForOrder(info: ShippingInfo, dest: string, quantity: number): { yen: number; label: string; pickup: boolean; pref: string | null; method: string } | { error: string } {
  if (dest === "pickup") {
    if (!info.pickup) return { error: "このお店では受け取りができません" };
    return { yen: 0, label: "お店で受け取り（送料なし）", pickup: true, pref: null, method: "お店で受け取り" };
  }
  if (info.mode === "included") {
    const pref = prefOf(dest);
    if (!pref) return { error: "お届け先の都道府県を選んでください" };
    const q = info.quotes[pref];
    const boxes = boxesFor(quantity, info.perBox);
    return {
      yen: q.yen * boxes,
      label: `送料（${fullPref(pref)}あて・${q.method}${boxes > 1 ? `×${boxes}` : ""}）`,
      pickup: false,
      pref,
      method: q.method,
    };
  }
  if (info.yen == null) return { error: "送料がまだ決まっていないため、いまは購入できません" };
  return { yen: info.yen, label: info.yen ? "送料（全国一律）" : "送料（お店の負担）", pickup: false, pref: prefOf(dest), method: "全国一律" };
}
