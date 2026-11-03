// 法律チェックの結果（判定・項目・表示が必要な項目）。店主の画面とパートナーの修正画面で使う

export type Legal = {
  verdict: "販売できる" | "直せば販売できる" | "このままでは販売できない";
  summary: string;
  items: { status: "ok" | "fix" | "ng" | "missing"; topic: string; detail: string; law: string; source_url: string }[];
  label_items: { name: string; value: string | null }[];
};

const VERDICT_STYLE = {
  販売できる: "bg-leaf text-white",
  直せば販売できる: "bg-amber-500 text-white",
  このままでは販売できない: "bg-red-600 text-white",
};
const ITEM_STYLE = {
  ok: { mark: "○", label: "OK", cls: "text-leaf" },
  fix: { mark: "△", label: "要修正", cls: "text-amber-600" },
  ng: { mark: "×", label: "NG", cls: "text-red-600" },
  missing: { mark: "？", label: "情報不足", cls: "text-black/50" },
};
const ITEM_ORDER = { ng: 0, missing: 1, fix: 2, ok: 3 };

export function LegalPanel({ legal }: { legal: Legal }) {
  const items = [...legal.items].sort((a, b) => ITEM_ORDER[a.status] - ITEM_ORDER[b.status]);
  return (
    <section className="rounded-xl border border-black/10 overflow-hidden">
      <div className={`px-3 py-2 font-bold ${VERDICT_STYLE[legal.verdict]}`}>法律チェック：{legal.verdict}</div>
      <div className="p-3 space-y-3 text-sm">
        <p>{legal.summary}</p>
        <ul className="space-y-2">
          {items.map((it, i) => {
            const st = ITEM_STYLE[it.status];
            return (
              <li key={i} className="flex gap-2">
                <span className={`shrink-0 w-14 font-bold ${st.cls}`}>
                  {st.mark} {st.label}
                </span>
                <div className="min-w-0">
                  <div className="font-bold">{it.topic}</div>
                  <div className="text-black/70">{it.detail}</div>
                  <div className="text-xs text-black/50">
                    根拠：{it.law}
                    {it.source_url && (
                      <>
                        {" "}
                        <a href={it.source_url} target="_blank" rel="noreferrer" className="underline">
                          出典
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {legal.label_items.length > 0 && (
          <div>
            <div className="font-bold mb-1">表示が必要な項目</div>
            <table className="w-full text-xs">
              <tbody>
                {legal.label_items.map((l, i) => (
                  <tr key={i} className="border-t border-black/5">
                    <th className="text-left font-normal text-black/60 py-1 pr-2 w-24 align-top">{l.name}</th>
                    <td className={`py-1 ${l.value ? "" : "text-red-600 font-bold"}`}>{l.value ?? "未確認 → 店主さんに確認"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-black/40">国の公式サイトを調べた結果にもとづく目安です。最終的な判断は店主さん（必要なら専門家）が行ってください。</p>
      </div>
    </section>
  );
}

