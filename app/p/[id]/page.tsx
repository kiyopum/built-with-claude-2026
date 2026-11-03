"use client";

import Link from "next/link";
// 公開ページ（お客さま向け）：商品1件。購入ボタンで Stripe の決済画面へ
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";
import { shippingForOrder, type ShippingInfo } from "@/lib/shipquote";
import { PREFS, fullPref } from "@/lib/shipping";

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
  shipping: ShippingInfo;
};

function ProductPageInner() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qty, setQty] = useState(1);
  // お届け先：都道府県の名前か "pickup"（お店で受け取り）。送料込みの商品は、選ぶと送料込みの値段が決まる
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { product: Product }) => setP(j.product))
      .catch(() => setNotFound(true));
  }, [id]);

  const [shared, setShared] = useState(false);
  async function shareLink() {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: p?.name, text: `${p?.shop_name}の「${p?.name}」`, url }).catch(() => {
        /* 閉じただけ */
      });
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setShared(true);
      } catch {
        /* コピーできない端末 */
      }
    }
  }

  async function buy() {
    setError("");
    setBusy(true);
    const r = await apiFetch("/api/checkout", { method: "POST", body: JSON.stringify({ draftId: Number(id), quantity: qty, dest, ref: new URLSearchParams(window.location.search).get("ref") ?? "" }) });
    const j = await r.json();
    if (!r.ok || !j.url) {
      setBusy(false);
      return setError(j.error ?? "決済画面を開けませんでした");
    }
    window.location.href = j.url;
  }

  if (notFound) return <p className="text-black/60">この商品は公開されていません。</p>;
  if (!p) return <p className="text-black/50">読み込み中…</p>;
  const info = p.shipping;
  const inc = info.mode === "included";
  const ship = shippingForOrder(info, dest, qty);
  const ok = !("error" in ship);
  // 届け先を選ぶ欄を出すか（送料込みの商品か、お店で受け取りができるとき）
  const askDest = inc || info.pickup;

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
      {inc ? (
        <div>
          <div className="text-3xl font-bold text-carrot">
            <span className="text-base font-bold">送料込み </span>
            {(p.price_yen + info.min).toLocaleString()}
            <span className="text-base text-black/60 font-normal"> 円{info.min !== info.max && "〜"}（税込）</span>
          </div>
          <p className="text-xs text-black/60">
            {info.min === info.max
              ? "全国どこへでも、この値段です。"
              : `お届け先によって変わります（近いほどお安く：${(p.price_yen + info.min).toLocaleString()}〜${(p.price_yen + info.max).toLocaleString()}円）。下で選ぶと決まります。`}
          </p>
        </div>
      ) : (
        <div className="text-3xl font-bold text-carrot">
          {p.price_yen.toLocaleString()}
          <span className="text-base text-black/60 font-normal"> 円（税込）</span>
        </div>
      )}
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
        {askDest && (
          <label className="flex items-center justify-between gap-3">
            <span className="font-bold shrink-0">お届け先</span>
            <select className="flex-1 min-w-0 rounded-xl border border-black/20 bg-white p-3 text-base" value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">{inc ? "都道府県を選んでください" : "配送する"}</option>
              {info.pickup && <option value="pickup">お店で受け取る（送料なし）</option>}
              {inc &&
                PREFS.map((pr) => (
                  <option key={pr} value={pr}>
                    {fullPref(pr)}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="flex items-center justify-between text-lg">
          <span>合計{inc && ok && !ship.pickup && "（送料込み）"}</span>
          <span className="font-bold">{ok ? `${(p.price_yen * qty + ship.yen).toLocaleString()}円` : inc ? "お届け先を選ぶと決まります" : "送料未定"}</span>
        </div>
        <p className="text-xs text-black/60 text-right">
          {ok
            ? ship.pickup
              ? `商品 ${(p.price_yen * qty).toLocaleString()}円（お店で受け取るので送料はかかりません）`
              : `うち商品 ${(p.price_yen * qty).toLocaleString()}円・送料 ${ship.yen.toLocaleString()}円（${ship.method}）`
            : inc
              ? ""
              : "送料（お店が準備中のため、まだ購入できません）"}
        </p>
        {inc && info.perBox > 1 && (
          <p className="text-xs text-leaf text-right">{info.perBox}個までは1つの箱で送るので、送料は1回分です。</p>
        )}
        <button className="w-full rounded-2xl bg-leaf text-white py-4 text-lg font-bold disabled:opacity-50" onClick={buy} disabled={busy || !ok}>
          {busy ? <Working text="決済画面を開いています" /> : "購入する"}
        </button>
        <p className="text-xs text-black/50">デモのため、テスト用の決済画面です。実際のお金は動きません。</p>
        {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      </div>

      {/* だれでも押せるシェア。LINE・メールなど、スマホの共有画面から選ぶだけ（紹介したパートナーの番号はそのまま引き継ぐ） */}
      <button className="w-full rounded-2xl border-2 border-leaf text-leaf py-3 font-bold" onClick={shareLink}>
        {shared ? "リンクをコピーしました ✓" : "📤 この商品を友だちに教える"}
      </button>

      {/* 店主さん用の入口（お店の暗証番号で開く） */}
      <Link href={`/owner/p/${id}`} className="block text-center text-sm text-black/50 underline">
        お店の方へ：この商品をお店の Instagram で紹介する
      </Link>

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
