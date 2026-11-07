"use client";

// ありがとうの往復便（お客さま向け）：箱に入っていたカードの QR から開く。
//   事業者さんに一言送る → 事業者さんがお返事する → 同じ QR を開くとお返事が読める
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";

type Letter = { id: number; original: string; owner_reply: string | null; replied_at: string | null; created_at: string };
type Data = { shop_name: string; product_name: string; kind: string; letters: Letter[]; can_write: boolean };

function LetterInner() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`/api/letters/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setMissing(true));
  }, [token]);

  async function send() {
    setError("");
    setBusy(true);
    const r = await apiFetch(`/api/letters/${token}`, { method: "POST", body: JSON.stringify({ text }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "送れませんでした");
    setText("");
    setSent(true);
    setData((d) => (d ? { ...d, letters: j.letters, can_write: j.letters.length < 3 } : d));
  }

  if (missing) return <p className="text-black/60">このカードは見つかりませんでした。QR をもう一度読みこんでください。</p>;
  if (!data) return <p className="text-black/50">読み込み中…</p>;

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <div className="text-sm text-black/50">{data.product_name}</div>
        <h1 className="text-2xl font-bold">📮 {data.shop_name}への、ひとこと</h1>
        <p className="text-sm text-black/70">
          {data.kind === "service" ? "受けてみて" : "届いて、使ってみて"}、感じたことをそのまま書いてください。うれしかったことも、「こうだったらもっといい」も、どちらも大歓迎です。事業者の人が読んで、お返事します。
        </p>
      </section>

      {data.letters.length > 0 && (
        <ul className="space-y-3">
          {data.letters.map((l) => (
            <li key={l.id} className="space-y-2">
              <div className="rounded-2xl bg-white border border-black/5 p-3">
                <div className="text-xs text-black/50">あなた・{l.created_at.slice(0, 10)}</div>
                <p className="whitespace-pre-wrap">{l.original}</p>
              </div>
              {l.owner_reply ? (
                <div className="rounded-2xl bg-leaf/10 p-3 ml-6">
                  <div className="text-xs text-leaf font-bold">{data.shop_name}より・{l.replied_at?.slice(0, 10)}</div>
                  <p className="whitespace-pre-wrap">{l.owner_reply}</p>
                </div>
              ) : (
                <p className="text-xs text-black/50 ml-6">事業者さんに届きました。お返事は、このページで読めます（あとで同じ QR を開いてください）。</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.can_write ? (
        <section className="space-y-3">
          <textarea
            className="w-full min-h-36 rounded-2xl border border-black/20 bg-white p-3 text-base"
            placeholder="例）ていねいに包んであって、開けたときにうれしくなりました"
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="w-full rounded-2xl bg-leaf text-white py-4 text-lg font-bold disabled:opacity-50" onClick={send} disabled={busy || !text.trim()}>
            {busy ? <Working text="事業者さんに届けています" /> : sent ? "もう一言とどける" : "事業者さんにとどける"}
          </button>
          <p className="text-xs text-black/50">
            お名前や連絡先は書かなくて大丈夫です。事業者の人は、書いたままの言葉を読みます。YaoBiz のスタッフにも、名前や連絡先を消して、やさしい形に整えた文で分け合います。
          </p>
          {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
        </section>
      ) : (
        <p className="text-sm text-black/60">この注文からは、もう3通とどいています。ありがとうございました。</p>
      )}
    </div>
  );
}

// アドレスの合言葉を読むので、読み込み中の表示（Suspense）で包む
export default function LetterPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <LetterInner />
    </Suspense>
  );
}
