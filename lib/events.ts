// 一年の行事（2026-11-05 きよさん：売れ行きと行事をつなげて、売るのを手伝う）
//   日付は決まりがはっきりしているものだけ（母の日＝5月の第2日曜 など）。
//   お中元・お歳暮のように地域で時期が違うものは「ころ」と書き、始まりの日を目安にする。推測で日付を足さない
import type { Scene } from "@/lib/scenes";

type Rule = { month: number; day: number } | { month: number; nth: number; weekday: number };
export type Gyoji = { key: string; name: string; scene: Scene["key"]; rule: Rule; note?: string };

export const GYOJI: Gyoji[] = [
  { key: "valentine", name: "バレンタインデー", scene: "thanks", rule: { month: 2, day: 14 } },
  { key: "whiteday", name: "ホワイトデー", scene: "thanks", rule: { month: 3, day: 14 } },
  { key: "school", name: "卒業・入学のお祝い", scene: "school", rule: { month: 3, day: 1 }, note: "3月〜4月" },
  { key: "mothers", name: "母の日", scene: "parents", rule: { month: 5, nth: 2, weekday: 0 } },
  { key: "fathers", name: "父の日", scene: "parents", rule: { month: 6, nth: 3, weekday: 0 } },
  { key: "ochugen", name: "お中元", scene: "thanks", rule: { month: 7, day: 1 }, note: "7月〜8月中旬ころ（地域で違います）" },
  { key: "obon", name: "お盆の帰省（手みやげ）", scene: "souvenir", rule: { month: 8, day: 13 } },
  { key: "keiro", name: "敬老の日", scene: "parents", rule: { month: 9, nth: 3, weekday: 1 } },
  { key: "oseibo", name: "お歳暮", scene: "thanks", rule: { month: 12, day: 1 }, note: "12月上旬〜20日ころ（地域で違います）" },
  { key: "christmas", name: "クリスマス", scene: "thanks", rule: { month: 12, day: 25 } },
  { key: "nenmatsu", name: "年末年始の帰省（手みやげ）", scene: "souvenir", rule: { month: 12, day: 29 } },
];

function dateOf(rule: Rule, year: number): Date {
  if ("day" in rule) return new Date(year, rule.month - 1, rule.day);
  const first = new Date(year, rule.month - 1, 1);
  const offset = (rule.weekday - first.getDay() + 7) % 7;
  return new Date(year, rule.month - 1, 1 + offset + (rule.nth - 1) * 7);
}

export const gyojiOf = (key: unknown) => GYOJI.find((g) => g.key === key);

// これから先の行事（宣伝と配送に間に合うよう、7〜75日先のものだけ）。近い順
export function upcomingGyoji(now = new Date(), minDays = 7, maxDays = 75) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return GYOJI.flatMap((g) => [now.getFullYear(), now.getFullYear() + 1].map((y) => ({ g, date: dateOf(g.rule, y) })))
    .map(({ g, date }) => ({ ...g, date, days: Math.round((date.getTime() - today.getTime()) / 86400_000) }))
    .filter((e) => e.days >= minDays && e.days <= maxDays)
    .sort((a, b) => a.days - b.days);
}

export const gyojiWhen = (e: { date: Date; note?: string }) => e.note ?? `${e.date.getMonth() + 1}月${e.date.getDate()}日`;
