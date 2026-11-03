// 「どんな場面に贈る？」——投稿を、買う人の「コト」（晴れの日・贈り物）に合わせて書き分ける
// 画面（ボタン）とサーバー（Claude への指示）の両方で使う
export type Scene = { key: string; emoji: string; label: string; hint: string };

export const SCENES: Scene[] = [
  { key: "everyday", emoji: "☕", label: "ふだんのおやつ・自分に", hint: "自分へのごほうびや、ふだんの暮らしで楽しむ場面" },
  { key: "birthday", emoji: "🎂", label: "誕生日", hint: "家族や友だちの誕生日に贈る場面" },
  { key: "parents", emoji: "💐", label: "母の日・父の日・敬老の日", hint: "親や祖父母へ、日ごろの感謝を伝えて贈る場面" },
  { key: "school", emoji: "🎓", label: "卒業・入学・就職", hint: "新しい門出を迎える人へのお祝いとして贈る場面" },
  { key: "celebrate", emoji: "💍", label: "お祝い・内祝い", hint: "結婚・出産・新築などのお祝いや、そのお返しとして贈る場面" },
  { key: "thanks", emoji: "🎁", label: "ちょっとしたお礼", hint: "お世話になった人へ、気軽なお礼として渡す場面" },
  { key: "souvenir", emoji: "🏮", label: "地元のおみやげ", hint: "この地域を知ってもらうおみやげや、帰省・訪問の手みやげにする場面" },
];

export function sceneOf(key: unknown): Scene | undefined {
  return SCENES.find((s) => s.key === key);
}
