// 月1のふり返り：毎月同じ「気持ちのたしかめ」の問い（月ごとに比べられるように、文は変えない）
//   事業や理念についての問い（3問）は、月ごとに Claude が作る（lib/claude.ts の makeMonthQuestions）
export type CareQuestion =
  | { id: string; type: "scale"; text: string; labels: string[] }
  | { id: string; type: "text"; text: string; hint?: string };

export const CARE_QUESTIONS: CareQuestion[] = [
  { id: "mood", type: "scale", text: "今月、この仕事をしていて、気持ちはどうでしたか？", labels: ["しんどい", "少しつらい", "ふつう", "まあまあ楽しい", "楽しい"] },
  { id: "load", type: "scale", text: "体や時間に、無理はありませんでしたか？", labels: ["かなり無理", "少し無理", "ふつう", "だいたい大丈夫", "大丈夫"] },
  { id: "worry", type: "text", text: "いま困っていること・悩んでいることはありますか？", hint: "仕事でも、それ以外でも。なければ「なし」で大丈夫です" },
  { id: "talk", type: "text", text: "山﨑さんに話してみたいこと・聞いてみたいことはありますか？", hint: "面談のときに話します。なければ空のままで大丈夫です" },
];

// 日本時間の「今月」（2026-11）
export function thisMonth(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 7);
}
