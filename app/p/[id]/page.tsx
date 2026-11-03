"use client";

// 公開ページ（お客さま向け）：商品1件。購入ボタンで Stripe の決済画面へ
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";

type Product = {
  id: number;
  name: string;
  description: string;
  price_yen: number;
  recommend_reason: string;
  target_customer: string;
  shop_name: string;
  shop_area: string;
  labels: { name: string; value: string }[];
  photos: string[];
  shop_intro: string | null;
};

function ProductPageInner() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { product: Product }) => setP(j.product))
      .catch(() => setNotFound(true));
  }, [id]);

  async function buy() {
    setError("");
    setBusy(true);
    const r = await apiFetch("/api/checkout", { method: "POST", body: JSON.stringify({ draftId: Number(id), quantity: qty, ref: new URLSearchParams(window.location.search).get("ref") ?? "" }) });
    const j = await r.json();
    if (!r.ok || !j.url) {
      setBusy(false);
      return setError(j.error ?? "決済画面を開けませんでした");
    }
    window.location.href = j.url;
  }

  if (notFound) return <p className="text-black/60">この商品は公開されていません。</p>;
  if (!p) return <p className="text-black/50">読み込み中…</p>;

  return (
    <article className="space-y-5">
      {p.photos.length > 0 && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.photos[0]} alt={p.name} className="w-full aspect-square object-cover rounded-2xl" />
          {p.photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {p.photos.slice(1).map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt="" className="w-20 h-20 object-cover rounded-xl" />
              ))}
            </div>
          )}
        </div>
      )}
      <div className="text-sm text-black/50">
        {p.shop_name}
        {p.shop_area && `（${p.shop_area}）`}
      </div>
      <h1 className="text-2xl font-bold leading-snug">{p.name}</h1>
      <div className="text-3xl font-bold text-carrot">
        {p.price_yen.toLocaleString()}
        <span className="text-base text-black/60 font-normal"> 円（税込）</span>
      </div>
      <p className="leading-relaxed whitespace-pre-wrap">{p.description}</p>
      <div className="rounded-xl bg-carrot/5 p-4 text-sm">
        <div className="font-bold text-carrot">こんな方に</div>
        <div>{p.target_customer}</div>
      </div>

      {p.labels.length > 0 && (
        <table className="w-full text-sm bg-white rounded-xl border border-black/5 overflow-hidden">
          <caption className="text-left font-bold pb-1">商品情報</caption>
          <tbody>
            {p.labels.map((l, i) => (
              <tr key={i} className="border-t border-black/5">
                <th className="text-left font-normal text-black/60 p-2 w-28 align-top">{l.name}</th>
                <td className="p-2">{l.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-bold">数量</span>
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 rounded-full border border-black/20 text-xl" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              −
            </button>
            <span className="w-6 text-center text-lg font-bold">{qty}</span>
            <button className="w-10 h-10 rounded-full border border-black/20 text-xl" onClick={() => setQty((q) => Math.min(10, q + 1))}>
              ＋
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-lg">
          <span>合計</span>
          <span className="font-bold">{(p.price_yen * qty).toLocaleString()}円</span>
        </div>
        <button className="w-full rounded-2xl bg-leaf text-white py-4 text-lg font-bold disabled:opacity-50" onClick={buy} disabled={busy}>
          {busy ? <Working text="決済画面を開いています" /> : "購入する"}
        </button>
        <p className="text-xs text-black/50">デモのため、テスト用の決済画面です。実際のお金は動きません。</p>
        {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      </div>

      {p.shop_intro && (
        <section className="rounded-2xl bg-leaf/5 p-4 space-y-2">
          <h2 className="font-bold text-leaf">このお店について（{p.shop_name}）</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.shop_intro}</p>
        </section>
      )}
    </article>
  );
}

// アドレスの番号を読むので、読み込み中の表示（Suspense）で包む
export default function ProductPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <ProductPageInner />
    </Suspense>
  );
}
