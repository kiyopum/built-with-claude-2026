"use client";

// お店の言葉の本：印刷して（PDF に保存して）店主さんに渡す。A4 たて
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";
import type { ShopBook } from "@/lib/claude";

function BookInner() {
  const { shopId } = useParams<{ shopId: string }>();
  const [data, setData] = useState<{ shop_name: string; book: ShopBook | null; book_at: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/shops/${shopId}/book`);
    const j = await r.json();
    if (!r.ok) setError(j.error);
    else setData(j);
  }, [shopId]);
  useEffect(() => {
    fetch(`/api/shops/${shopId}/book`)
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setData(j) : setError(j.error)));
  }, [shopId]);

  async function make() {
    setError("");
    setBusy(true);
    const r = await apiFetch(`/api/shops/${shopId}/book`, { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error);
    await load();
  }

  if (!data) return error ? <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p> : <p className="text-black/50">読み込み中…</p>;
  const b = data.book;
  return (
    <div className="space-y-5">
      <style>{`@media print { header, footer, .no-print { display: none !important; } main { padding: 0 !important; max-width: none !important; } body { background: #fff !important; } @page { size: A4; margin: 18mm; } .book section { break-inside: avoid; } }`}</style>
      <div className="no-print space-y-2">
        <h1 className="text-xl font-bold">📖 お店の言葉の本</h1>
        <p className="text-sm text-black/70">
          お店のヒアリング・ホームページ・商品・みんなの声・お客さまへのお返事から、Claude が「このお店が大事にしてきたこと」を1冊にまとめます。売るためではなく、後を継ぐ人や家族、新しく入る人に、お店の考えを渡すための本です。
        </p>
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-50" onClick={make} disabled={busy}>
            {busy ? <Working text="まとめています（1〜2分）" /> : b ? "今の記録で作り直す" : "本をまとめる"}
          </button>
          {b && (
            <button className="flex-1 rounded-xl border-2 border-leaf text-leaf py-3 font-bold" onClick={() => window.print()}>
              🖨 印刷・PDF
            </button>
          )}
        </div>
        {data.book_at && <p className="text-xs text-black/50">{data.book_at} にまとめました。店主さんに読んでもらい、直したいところは店主さんの言葉で聞いて、ヒアリングに足してから作り直してください。</p>}
        {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      </div>

      {b && (
        <article className="book rounded-2xl bg-white p-6 border border-black/5 space-y-6 leading-relaxed">
          <section className="text-center space-y-2 pb-4 border-b border-black/10">
            <div className="text-xs text-black/50">{data.shop_name}</div>
            <h2 className="text-2xl font-bold">{b.title}</h2>
          </section>
          <section className="space-y-1">
            <h3 className="font-bold text-leaf">はじめに</h3>
            <p className="whitespace-pre-wrap">{b.opening}</p>
          </section>
          <section className="space-y-3">
            <h3 className="font-bold text-leaf">大事にしてきたこと</h3>
            {b.values.map((v, i) => (
              <div key={i}>
                <div className="font-bold">
                  {i + 1}) {v.heading}
                </div>
                <p className="whitespace-pre-wrap">{v.body}</p>
              </div>
            ))}
          </section>
          {b.quotes.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-bold text-leaf">店主さんの言葉</h3>
              {b.quotes.map((q, i) => (
                <blockquote key={i} className="border-l-4 border-carrot/60 pl-3">
                  <p className="text-lg">「{q.quote}」</p>
                  <p className="text-xs text-black/50">{q.note}</p>
                </blockquote>
              ))}
            </section>
          )}
          {b.products.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-bold text-leaf">品物に込めてきたこと</h3>
              {b.products.map((p, i) => (
                <div key={i}>
                  <div className="font-bold">{p.name}</div>
                  <p className="whitespace-pre-wrap">{p.story}</p>
                </div>
              ))}
            </section>
          )}
          {b.voices.length > 0 && (
            <section className="space-y-1">
              <h3 className="font-bold text-leaf">届いた声</h3>
              <ul className="list-disc pl-5">{b.voices.map((v, i) => <li key={i}>{v}</li>)}</ul>
            </section>
          )}
          <section className="space-y-1">
            <h3 className="font-bold text-leaf">次にこのお店を担う人へ</h3>
            <p className="whitespace-pre-wrap">{b.to_next}</p>
          </section>
          <p className="text-xs text-black/40 text-right pt-4 border-t border-black/10">
            聞き書き：YaoBiz のパートナー ／ まとめの手伝い：Claude（AI）／ 株式会社山崎メディアミックス
          </p>
        </article>
      )}
    </div>
  );
}

export default function BookPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <BookInner />
    </Suspense>
  );
}
