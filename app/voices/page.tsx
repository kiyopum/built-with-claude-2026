"use client";

// みんなの声：事業者さん・お客さまからのお褒めと要望を、スタッフみんなで分け合う（2026-11-05 きよさん）
//   きびしい言葉も、文句ではなく「もっと未来のために」の要望として Claude が整えてから載せる
import { Suspense, useCallback, useEffect, useState } from "react";
import { useVoiceInput } from "@/lib/useVoiceInput";
import { VoiceInput } from "@/components/VoiceInput";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";

type Item = {
  id: number;
  source: "owner" | "customer" | "other";
  kind: "praise" | "request";
  original?: string;
  title: string;
  message: string;
  step: string;
  created_at: string;
  shop_name: string | null;
  user_name: string;
  via: string | null;
  thanks: number;
  thanked: boolean;
  mine: boolean;
};
type Data = { voices: Item[]; shops: { id: number; name: string }[]; me: { id: number; role: string } };

const SOURCES = [
  { key: "owner", label: "事業者さん" },
  { key: "customer", label: "お客さま" },
  { key: "other", label: "そのほか" },
] as const;
const WHO = { owner: "事業者さん", customer: "お客さま", other: "そのほか" };

function VoicesInner() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"owner" | "customer" | "other">("customer");
  const [shopId, setShopId] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"" | "praise" | "request">("");
  const [open, setOpen] = useState<number | null>(null);
  const [del, setDel] = useState<number | null>(null); // 消す前にもう一度押してもらう
  const voice = useVoiceInput((t) => setText((x) => (x ? x.replace(/\s*$/, "\n") : "") + t));

  const load = useCallback(async () => {
    const r = await apiFetch("/api/voices");
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setData(j);
  }, []);
  useEffect(() => {
    fetch("/api/voices")
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setData(j) : setError(j.error)));
  }, []);

  async function post(body: Record<string, unknown>) {
    setError("");
    const r = await apiFetch("/api/voices", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return false;
    }
    await load();
    return true;
  }

  async function send() {
    if (voice.recording) voice.stop();
    setBusy(true);
    const ok = await post({ text, source, shop_id: shopId ? Number(shopId) : null });
    setBusy(false);
    if (ok) {
      setText("");
      voice.clearRecordings();
    }
  }

  if (error && !data) return <p className="rounded-xl bg-red-50 text-red-700 p-3">{error}</p>;
  if (!data) return <p className="text-black/50">読み込み中…</p>;
  const list = data.voices.filter((v) => !filter || v.kind === filter);
  const count = (k: string) => data.voices.filter((v) => v.kind === k).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">みんなの声</h1>
        <p className="text-sm text-black/60">事業者さんやお客さまから聞いた、うれしい言葉と「こうだったらいいのに」を、みんなで分け合う場所です。きびしい言葉も、Claude が「もっと未来のために」の形に整えてから載せます。</p>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-partner">聞いた声を伝える</div>
        <div className="flex gap-2">
          {SOURCES.map((s) => (
            <button key={s.key} className={`flex-1 rounded-xl py-2 text-sm font-bold border ${source === s.key ? "bg-partner text-white border-partner" : "border-black/15"}`} onClick={() => setSource(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        {data.shops.length > 0 && (
          <select className="w-full rounded-xl border border-black/15 bg-white p-3 text-base" value={shopId} onChange={(e) => setShopId(e.target.value)}>
            <option value="">どの事業者の話？（特になければこのまま）</option>
            {data.shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <VoiceInput voice={voice} value={text} onChange={setText} disabled={busy} placeholder="聞いたままの言葉で大丈夫です（例：箱を開けたら、瓶が少し動いていて心配だった）" />
        <p className="text-xs text-black/50">聞いたままの言葉は、あなたと YMM だけが見られます。みんなには、Claude が整えた文が載ります。名前や電話番号は書かれません。</p>
        {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
        <button className="w-full rounded-2xl bg-ai text-white py-3 font-bold disabled:opacity-50" onClick={send} disabled={!text.trim() || busy}>
          {busy ? <Working text="Claude が整えています" est={10} /> : "みんなに伝える"}
        </button>
      </section>

      <div className="flex gap-2 text-sm">
        {([["", `すべて ${data.voices.length}`], ["praise", `🌸 お褒め ${count("praise")}`], ["request", `🌱 もっと未来のために ${count("request")}`]] as const).map(([k, l]) => (
          <button key={k} className={`rounded-full px-3 py-1.5 border ${filter === k ? "bg-partner text-white border-partner font-bold" : "border-black/15"}`} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-black/60">まだありません。</p>
      ) : (
        <ul className="space-y-3">
          {list.map((v) => (
            <li key={v.id} className={`rounded-2xl p-4 space-y-2 border ${v.kind === "praise" ? "bg-pink-50 border-pink-100" : "bg-partner/5 border-partner/15"}`}>
              <div className="text-xs font-bold">{v.kind === "praise" ? <span className="text-pink-700">🌸 お褒め</span> : <span className="text-partner">🌱 もっと未来のために</span>}</div>
              <div className="font-bold">{v.title}</div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{v.message}</p>
              {v.step && (
                <p className="text-sm rounded-xl bg-white/70 p-2">
                  <b>{v.kind === "praise" ? "続けたいこと：" : "次の小さな一歩："}</b>
                  {v.step}
                </p>
              )}
              <div className="text-xs text-black/50">
                {WHO[v.source]}の声{v.shop_name && `・${v.shop_name}`}・{v.via === "letter" ? "📮 カードの QR から届きました" : `${v.user_name} さんが聞きました`}・{v.created_at.slice(0, 16)}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <button className={`rounded-full px-3 py-1 border ${v.thanked ? "bg-partner text-white border-partner" : "border-black/15 bg-white"}`} onClick={() => post({ action: "thanks", id: v.id })}>
                  👏 ありがとう {v.thanks > 0 && v.thanks}
                </button>
                {v.original !== undefined && (
                  <button className="text-xs text-black/50 underline" onClick={() => setOpen(open === v.id ? null : v.id)}>
                    {open === v.id ? "聞いたままの言葉を閉じる" : "聞いたままの言葉"}
                  </button>
                )}
                {(v.mine || data.me.role === "admin") && (
                  <button
                    className={`text-xs ml-auto underline ${del === v.id ? "text-red-600 font-bold" : "text-black/40"}`}
                    onClick={() => (del === v.id ? post({ action: "delete", id: v.id }).then(() => setDel(null)) : setDel(v.id))}
                  >
                    {del === v.id ? "本当に消す" : "消す"}
                  </button>
                )}
              </div>
              {open === v.id && v.original && <p className="text-xs whitespace-pre-wrap rounded-xl bg-white p-2 text-black/70">{v.original}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function VoicesPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <VoicesInner />
    </Suspense>
  );
}
