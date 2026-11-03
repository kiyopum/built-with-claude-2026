// 送料込みの値段（2026-11-04 物流の社長さんの助言から）
//   1) 大きさと重さで、いちばん安い送り方を自動で選ぶ
//   2) 届け先の地域（距離）で送料を変える（近いほど安い）
//   3) お客さまには「送料込み ○円」の1つの数字で見せる（消費者庁は「送料無料」より「送料込み」などの表示を促している
//      https://www.caa.go.jp/policies/policy/consumer_policy/other/free_shipping ）
// 料金は lib/shipping-data.ts（公式サイトから取った表）だけを使う。割引（持込割引など）は入れていない＝お店が損をしない側
// 画面（ブラウザ）とサーバーの両方で使う
import {
  COMPACT_BOX_YEN,
  COMPACT_MATRIX,
  COMPACT_REGION_OF,
  FLAT,
  PREFS,
  YUPACK_MATRIX,
  YUPACK_SIZES,
  YUPACK_ZONES,
} from "@/lib/shipping-data";

export { PREFS, RATES_AS_OF } from "@/lib/shipping-data";
export type Pref = (typeof PREFS)[number];

// 都道府県の正式な名前（住所の「東京都」「大阪府」などと見比べるため）
export function fullPref(p: string): string {
  if (p === "北海道") return p;
  if (p === "東京") return "東京都";
  if (p === "大阪" || p === "京都") return `${p}府`;
  return `${p}県`;
}
// 「東京都」「東京」どちらでも PREFS の名前にする。分からなければ null（推測しない）
export function prefOf(s: string | null | undefined): Pref | null {
  if (!s) return null;
  const t = s.trim();
  return (PREFS as readonly string[]).find((p) => t === p || t === fullPref(p)) as Pref | undefined ?? null;
}
// 住所の書き出しが都道府県名ならそれを返す（お店の都道府県の初期値にだけ使う。最後は人が選んで保存する）
export function prefFromAddress(addr: string | null | undefined): Pref | null {
  if (!addr) return null;
  const t = addr.replace(/^〒?\s*\d{3}-?\d{4}\s*/, "").trim();
  return (PREFS as readonly string[]).find((p) => t.startsWith(fullPref(p))) as Pref | undefined ?? null;
}

// 絵で選ぶ大きさの区分。寸法は打たせない（IT が苦手な人でも選べるように）
export type SizeClass = { key: string; emoji: string; label: string; hint: string };
export const SIZE_CLASSES: SizeClass[] = [
  { key: "post", emoji: "✉️", label: "ポストに入る", hint: "長さ34cm・3辺の合計60cm・厚さ3cmまで（はがき〜A4より少し小さい）" },
  { key: "compact", emoji: "🎁", label: "小さな箱", hint: "20×25×厚さ5cm の箱に入る" },
  { key: "a4thick", emoji: "📚", label: "A4で厚い", hint: "A4くらいで、厚さ3cmより厚い" },
  { key: "60", emoji: "📦", label: "箱 60", hint: "たて・よこ・高さの合計60cmまで" },
  { key: "80", emoji: "📦", label: "箱 80", hint: "合計80cmまで" },
  { key: "100", emoji: "📦", label: "箱 100", hint: "合計100cmまで" },
  { key: "120", emoji: "📦", label: "箱 120", hint: "合計120cmまで" },
  { key: "140", emoji: "📦", label: "箱 140", hint: "合計140cmまで" },
  { key: "160", emoji: "📦", label: "箱 160", hint: "合計160cmまで" },
  { key: "170", emoji: "📦", label: "箱 170", hint: "合計170cmまで" },
];
export function sizeClassOf(key: unknown): SizeClass | undefined {
  return SIZE_CLASSES.find((s) => s.key === key);
}

// method：お客さまにも見せる送り方の名前／note：お店向けの補足（お客さまには見せない）
export type Quote = { yen: number; method: string; note?: string };

function idx(p: Pref) {
  return (PREFS as readonly string[]).indexOf(p);
}
function yupack(size: number, from: Pref, to: Pref): Quote {
  const zone = YUPACK_MATRIX[idx(from)][idx(to)];
  const name = Object.keys(YUPACK_ZONES)[zone];
  return { yen: YUPACK_ZONES[name][YUPACK_SIZES.indexOf(size as (typeof YUPACK_SIZES)[number])], method: `ゆうパック ${size}サイズ` };
}
function compact(from: Pref, to: Pref): Quote {
  return { yen: COMPACT_MATRIX[COMPACT_REGION_OF[from]][COMPACT_REGION_OF[to]] + COMPACT_BOX_YEN, method: "宅急便コンパクト（専用BOX込み）" };
}

// この大きさ・重さで使える送り方の候補（重さの上限を超えるものは外す）
function candidates(sizeKey: string, weightG: number, from: Pref, to: Pref): Quote[] {
  const kg = weightG / 1000;
  const list: (Quote | false)[] = [];
  const box = (n: number) => kg <= 25 && yupack(n, from, to);
  if (sizeKey === "post") {
    list.push(kg <= 2 && { yen: FLAT.clickpost, method: "クリックポスト", note: "ネットで宛名ラベルを作って、ポストに入れます" });
    list.push(kg <= 1 && { yen: FLAT.yupacket, method: "ゆうパケット" });
    list.push(kg <= 4 && { yen: FLAT.letterpackLight, method: "レターパックライト" });
    list.push(box(60));
  } else if (sizeKey === "compact") {
    list.push(compact(from, to));
    list.push(kg <= 4 && { yen: FLAT.letterpackPlus, method: "レターパックプラス" });
    list.push(box(60));
  } else if (sizeKey === "a4thick") {
    list.push(kg <= 4 && { yen: FLAT.letterpackPlus, method: "レターパックプラス" });
    list.push(box(80));
  } else if ((YUPACK_SIZES as readonly number[]).includes(Number(sizeKey))) {
    list.push(box(Number(sizeKey)));
  }
  return list.filter((q): q is Quote => !!q);
}

// いちばん安い送り方。送れない（重すぎる・区分が不明）ときは null
export function cheapest(sizeKey: string, weightG: number, from: Pref, to: Pref): Quote | null {
  const list = candidates(sizeKey, weightG, from, to);
  if (list.length === 0) return null;
  return list.reduce((a, b) => (b.yen < a.yen ? b : a));
}

// 全国の届け先ごとの送料（商品ページで「○円〜○円」と、都道府県を選んだときの値段に使う）
export function quotesByPref(sizeKey: string, weightG: number, from: Pref): Record<string, Quote> | null {
  const out: Record<string, Quote> = {};
  for (const to of PREFS) {
    const q = cheapest(sizeKey, weightG, from, to);
    if (!q) return null;
    out[to] = q;
  }
  return out;
}

// 何個買うと何箱になるか（1箱に入る数はお店が決める。初めは1個＝まとめない）
export function boxesFor(quantity: number, perBox: number): number {
  return Math.ceil(quantity / Math.max(1, Math.floor(perBox || 1)));
}

// 送料込みで売る商品か（大きさと重さが入っていて、お店の都道府県が決まっている）
export function isIncluded(d: { size_class?: string | null; weight_g?: number | null }, shop: { prefecture?: string | null }): boolean {
  return !!sizeClassOf(d.size_class) && !!d.weight_g && d.weight_g > 0 && !!prefOf(shop.prefecture);
}
