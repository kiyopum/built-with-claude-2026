"use client";

// わたしの歩み：してきたことの数（順位は出さない）・できるようになったこと・今月のお休み
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";
import type { CareerNote } from "@/lib/claude";

type Facts = Record<"shops" | "heard_shops" | "hearings" | "drafts" | "published" | "legal" | "sns" | "voices" | "thanks" | "letters" | "referrals" | "checkins", number>;
type Data = { name: string; self: boolean; resting: boolean; month: string; facts: Facts; career: CareerNote | null; career_at: string | null };

const TILES: { key: keyof Facts; label: string; unit: string }[] = [
  { key: "heard_shops", label: "考えを聞いた事業者", unit: "店" },
  { key: "hearings", label: "お話を聞いた回数", unit: "回" },
  { key: "published", label: "事業者さんが公開した商品", unit: "件" },
  { key: "legal", label: "表示を確かめた商品", unit: "件" },
  { key: "voices", label: "チームに伝えた声", unit: "件" },
  { key: "thanks", label: "届いた「ありがとう」", unit: "" },
  { key: "letters", label: "お客さまからのお便り", unit: "通" },
  { key: "referrals", label: "紹介でつないだ注文", unit: "件" },
  { key: "checkins", label: "月1のふり返り", unit: "回" },
];

function MeInner() {
  const user = useSearchParams().get("user");
  const q = user ? `?user=${user}` : "";
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<"" | "rest" | "career">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/me${q}`);
    const j = await r.json();
    if (!r.ok) setError(j.error);
    else setData(j);
  }, [q]);
  useEffect(() => {
    fetch(`/api/me${q}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setData(j) : setError(j.error)));
  }, [q]);

  async function act(action: "rest" | "career", on?: boolean) {
    setError("");
    setBusy(action);
    const r = await apiFetch(`/api/me${q}`, { method: "POST", body: JSON.stringify({ action, on }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    await load();
  }

  if (!data) return error ? <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p> : <p className="text-black/50">読み込み中…</p>;
  const f = data.facts;
  return (
    <div className="space-y-5">
      <style>{`@media print { header, footer, .no-print { display: none !important; } main { padding: 0 !important; max-width: none !important; } body { background: #fff !important; } @page { size: A4; margin: 18mm; } }`}</style>
      <section className="space-y-1">
        <h1 className="text-xl font-bold">🌱 {data.self ? "わたしの歩み" : `${data.name} さんの歩み`}</h1>
        <p className="text-sm text-black/70 no-print">
          売上の順位は出しません。だれかと比べるためではなく、{data.self ? "あなた" : "その人"}がしてきたことを、そのまま残す場所です。
          {data.self && "見られるのは、あなたと YMM 管理だけです。"}
        </p>
      </section>

      <section className="grid grid-cols-3 gap-2">
        {TILES.map((t) => (
          <div key={t.key} className="rounded-xl bg-white border border-black/5 p-3 text-center">
            <div className="text-2xl font-bold text-partner">
              {f[t.key]}
              <span className="text-xs font-normal text-black/60">{t.unit}</span>
            </div>
            <div className="text-[11px] text-black/60 leading-tight">{t.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-4 border border-black/5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-bold">できるようになったこと</h2>
          {data.career && (
            <button className="no-print text-sm text-partner underline" onClick={() => window.print()}>
              🖨 印刷・PDF
            </button>
          )}
        </div>
        {data.career ? (
          <>
            <p className="leading-relaxed whitespace-pre-wrap">{data.career.summary}</p>
            <ul className="space-y-2">
              {data.career.skills.map((s, i) => (
                <li key={i} className="rounded-xl bg-partner/5 p-3">
                  <div className="font-bold">{s.name}</div>
                  <div className="text-sm text-black/60">{s.evidence}</div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-black/50">{data.career_at} に、上の記録だけをもとに Claude がまとめました。YaoBiz（株式会社山崎メディアミックス）での仕事として、次に働き口を探すときにもそのまま見せられます。</p>
          </>
        ) : (
          <p className="text-sm text-black/60">記録をもとに、履歴書や面接でも使える「してきた仕事」の文を Claude がまとめます。</p>
        )}
        <button className="no-print w-full rounded-xl border-2 border-partner text-partner py-3 font-bold disabled:opacity-50" onClick={() => act("career")} disabled={!!busy}>
          {busy === "career" ? <Working text="まとめています" /> : data.career ? "今の記録でまとめ直す" : "まとめる"}
        </button>
      </section>

      {data.self && (
        <section className="no-print rounded-2xl bg-white p-4 border border-black/5 space-y-3">
          <h2 className="font-bold">🌿 今月のお休み</h2>
          {data.resting ? (
            <>
              <p className="text-sm">
                今月（{data.month}）はお休み中です。担当の事業者は、YMM（または YMM が頼んだ人）が見守ります。来月になると、自然にもとに戻ります。
              </p>
              <button className="w-full rounded-xl border border-black/20 py-3 font-bold disabled:opacity-50" onClick={() => act("rest", false)} disabled={!!busy}>
                {busy === "rest" ? <Working text="もどしています" /> : "お休みをやめて、もどる"}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-black/70">
                子どものこと、体のこと、家のこと。休みたいときは、理由を書かずにここを押すだけで大丈夫です。担当の事業者・取り分・これまでの記録は、そのままです。ほかのパートナーには「お休み中」とだけ出ます。
              </p>
              <button className="w-full rounded-xl bg-partner text-white py-3 font-bold disabled:opacity-50" onClick={() => act("rest", true)} disabled={!!busy}>
                {busy === "rest" ? <Working text="お休みにしています" /> : "今月はお休みする"}
              </button>
            </>
          )}
        </section>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </div>
  );
}

export default function MePage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <MeInner />
    </Suspense>
  );
}
