"use client";

// 商品ページの文を手で直すフォーム（事業者さんの画面とパートナーの修正画面で共通）
// 法律チェックで「直すところ」を上にまとめ、問題の言葉が入っている欄の真下にも出す。
// 問題の言葉を消すと、その場で「文から消えました」に変わる（保存すると Claude が確かめ直す）。
import type { Legal } from "@/components/LegalPanel";

export type FieldValues = {
  name: string;
  price_yen: string;
  description: string;
  recommend_reason: string;
  target_customer: string;
};

type TextKey = "name" | "description" | "recommend_reason" | "target_customer";
const FIELD_LABEL: Record<TextKey, string> = {
  name: "商品名",
  description: "紹介文",
  recommend_reason: "おすすめ理由",
  target_customer: "こんな方に",
};
const TEXT_KEYS = Object.keys(FIELD_LABEL) as TextKey[];

type Item = Legal["items"][number];
const MARK = {
  ng: { text: "× NG", cls: "text-red-600", box: "bg-red-50 border-red-200" },
  fix: { text: "△ 要修正", cls: "text-amber-700", box: "bg-amber-50 border-amber-200" },
  missing: { text: "？ 要確認", cls: "text-black/60", box: "bg-black/5 border-black/10" },
} as const;

function todoItems(legal: Legal | null): Item[] {
  if (!legal) return [];
  // 「直すところ」に出すのは NG・要修正・要確認だけ。参考（info）は出さない（全項目は下の詳細で見られる）
  const order = { ng: 0, fix: 1, missing: 2, ok: 3, info: 4 };
  return legal.items.filter((i) => i.status === "ng" || i.status === "fix" || i.status === "missing").sort((a, b) => order[a.status] - order[b.status]);
}

function whereIs(item: Item, f: FieldValues): TextKey | null {
  const q = item.quote?.trim();
  if (!q) return null;
  return TEXT_KEYS.find((k) => f[k].includes(q)) ?? null;
}

// 欄の真下に出す注意（その欄に問題の言葉が残っているものだけ）
function FieldWarnings({ items, field, f }: { items: Item[]; field: TextKey; f: FieldValues }) {
  const here = items.filter((i) => i.status !== "ok" && whereIs(i, f) === field);
  if (!here.length) return null;
  return (
    <div className="space-y-1">
      {here.map((i, n) => {
        const m = MARK[i.status as keyof typeof MARK];
        return (
          <div key={n} className={`rounded-lg border p-2 text-xs ${m.box}`}>
            <span className={`font-bold ${m.cls}`}>{m.text}</span> 「<span className="font-bold underline decoration-wavy decoration-red-400">{i.quote}</span>」
            <div className="text-black/70 mt-0.5">{i.detail}</div>
          </div>
        );
      })}
    </div>
  );
}

// 上にまとめる「直すところ」
export function LegalTodo({ legal, f }: { legal: Legal | null; f: FieldValues }) {
  const items = todoItems(legal);
  const missingLabels = legal?.label_items.filter((l) => !l.value) ?? [];
  if (!legal) return null;
  if (!items.length && !missingLabels.length) {
    return <p className="rounded-xl bg-leaf/10 text-leaf p-3 text-sm font-bold">法律チェックで直すところはありません。</p>;
  }
  return (
    <section className="rounded-xl border-2 border-red-200 bg-white p-3 space-y-2">
      <div className="text-sm font-bold">
        直すところ・確かめること（{items.length + (missingLabels.length ? 1 : 0)}件）
        <span className="ml-2 text-xs font-normal text-black/50">判定：{legal.verdict}</span>
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((i, n) => {
          const m = MARK[i.status as keyof typeof MARK];
          const at = whereIs(i, f);
          const gone = !!i.quote?.trim() && !at;
          return (
            <li key={n} className={gone ? "opacity-50" : ""}>
              <div>
                <span className={`font-bold ${m.cls}`}>{m.text}</span> <span className={`font-bold ${gone ? "line-through" : ""}`}>{i.topic}</span>
              </div>
              <div className="text-black/70">{i.detail}</div>
              {at && <div className="text-xs font-bold text-red-600">↓ {FIELD_LABEL[at]}の「{i.quote}」</div>}
              {gone && <div className="text-xs font-bold text-leaf">✓ 文から消えました（保存すると確かめ直します）</div>}
              {!i.quote?.trim() && i.status === "missing" && <div className="text-xs text-black/50">→ 事業者さんに確かめて、分かったことを文に入れるか、AI への一言で伝えてください</div>}
            </li>
          );
        })}
        {missingLabels.length > 0 && (
          <li>
            <span className="font-bold text-black/60">？ 要確認</span> <span className="font-bold">表示がそろっていない項目</span>
            <div className="text-black/70">{missingLabels.map((l) => l.name).join("、")} が分かっていません。ラベルを撮り直すか、事業者さんに確かめてください。</div>
          </li>
        )}
      </ul>
    </section>
  );
}

export function DraftFieldsForm({ f, setF, legal, perBox = 1 }: { f: FieldValues; setF: (f: FieldValues) => void; legal: Legal | null; perBox?: number }) {
  const items = todoItems(legal);
  const input = "w-full rounded-xl border border-black/15 p-3 text-base";
  const box = (k: TextKey, rows: string) => {
    const bad = items.some((i) => i.status !== "missing" && whereIs(i, f) === k);
    return `${input} ${rows} ${bad ? "border-red-400 border-2" : ""}`;
  };
  return (
    <div className="space-y-2">
      <LegalTodo legal={legal} f={f} />
      <label className="block text-xs font-bold text-black/60 pt-2">商品名</label>
      <input className={box("name", "")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <FieldWarnings items={items} field="name" f={f} />
      <label className="block text-xs font-bold text-black/60">1個の値段（税込・円）</label>
      <input className={input} inputMode="numeric" value={f.price_yen} onChange={(e) => setF({ ...f, price_yen: e.target.value.replace(/[^\d]/g, "") })} />
      {/* 2026-11-07 きよさん：ここは単価。お客さまに出る値段は、下の「送り方」で決める「1箱に入れる数」をまとめた送料込みの金額 */}
      <p className="text-xs text-black/50">
        {perBox > 1 && Number(f.price_yen) > 0
          ? `お客さまには「${perBox}個入り 送料込み ○円」のひとつの値段で出ます（商品代は ${(Number(f.price_yen) * perBox).toLocaleString()}円。送料込みの金額は下の「送り方」に出ます）。`
          : "お客さまには、下の「送り方」で決める「1箱に入れる数」をまとめた、送料込みのひとつの値段で出ます。"}
      </p>
      <label className="block text-xs font-bold text-black/60">紹介文</label>
      <textarea className={box("description", "min-h-48 leading-relaxed")} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <FieldWarnings items={items} field="description" f={f} />
      <label className="block text-xs font-bold text-black/60">おすすめ理由</label>
      <textarea className={box("recommend_reason", "min-h-20")} value={f.recommend_reason} onChange={(e) => setF({ ...f, recommend_reason: e.target.value })} />
      <FieldWarnings items={items} field="recommend_reason" f={f} />
      <label className="block text-xs font-bold text-black/60">こんな方に</label>
      <textarea className={box("target_customer", "min-h-20")} value={f.target_customer} onChange={(e) => setF({ ...f, target_customer: e.target.value })} />
      <FieldWarnings items={items} field="target_customer" f={f} />
    </div>
  );
}

// 「AI に直してもらう」の一言に、法律チェックの指摘（NG・要修正）をそのまま入れる
export function todoNote(legal: Legal | null): string {
  const items = todoItems(legal).filter((i) => i.status === "ng" || i.status === "fix");
  if (!items.length) return "";
  return "法律チェックの指摘に沿って直してください。\n" + items.map((i) => `・${i.topic}${i.quote ? `（「${i.quote}」）` : ""}：${i.detail}`).join("\n");
}

export function TodoNoteButton({ legal, setNote }: { legal: Legal | null; setNote: (s: string) => void }) {
  const text = todoNote(legal);
  if (!text) return null;
  return (
    <button type="button" className="w-full rounded-xl border border-red-300 text-red-700 py-2 text-sm font-bold" onClick={() => setNote(text)}>
      法律チェックの指摘をここに入れる
    </button>
  );
}
