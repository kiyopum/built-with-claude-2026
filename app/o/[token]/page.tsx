"use client";
// 事業者さん専用ページ（2026-11-07 きよさん：売れたことや知らせを、事業者さんが自分で見られる場所）
//   メールのリンク（長い合言葉）から開き、事業者さんの暗証番号を入れると、注文と届け先が見える。ログインも登録もいらない。
//   暗証番号はこのページを開いている間だけ覚える（閉じたら消える）。

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PinPad } from "@/components/PinPad";
import { WEEKDAYS, nextShipDate } from "@/lib/shipping";

type Order = {
  id: number;
  created_at: string;
  quantity: number;
  amount_yen: number;
  shipping_yen: number;
  owner_yen: number;
  ship_name: string | null;
  ship_address: string | null;
  ship_method: string | null;
  ship_warning: string | null;
  customer_email: string | null;
  is_new: boolean;
  kind: "goods" | "service";
  product_name: string;
  letters: { id: number; original: string; owner_reply: string | null; replied_at: string | null; created_at: string }[];
};

function OwnerPageInner() {
  const { token } = useParams<{ token: string }>();
  const [shop, setShop] = useState<{ name: string; has_pin: boolean } | null>(null);
  const [bad, setBad] = useState("");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [shipDays, setShipDays] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/o/${token}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setShop(j.shop) : setBad(j.error)))
      .catch(() => setBad("開けませんでした"));
  }, [token]);

  async function open(pin: string) {
    setError("");
    setBusy(true);
    const r = await fetch(`/api/o/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(j.error);
      return false;
    }
    setOrders(j.orders);
    setShipDays(j.ship_days ?? []);
    return true;
  }

  if (bad) return <p className="rounded-xl bg-red-50 text-red-700 p-3">{bad}</p>;
  if (!shop) return <p className="text-black/50">読み込み中…</p>;
  const newCount = orders?.filter((o) => o.is_new).length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-black/50">事業者さん専用ページ</div>
        <h1 className="text-xl font-bold mt-1">{shop.name}</h1>
      </div>

      {orders === null ? (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
          {shop.has_pin ? (
            <>
              <p className="text-sm">注文と届け先を見るには、事業者さんの暗証番号（公開のときと同じ4けた）を入れてください。</p>
              <PinPad label="事業者さんの暗証番号" onDone={open} busy={busy} />
              {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
            </>
          ) : (
            <p className="text-sm">まだ事業者さんの暗証番号が決まっていません。担当のパートナーと一緒に、事業者のページで決めてください。</p>
          )}
          <p className="text-xs text-black/50">このページのリンクは、ほかの人に知らせないでください。お客さまの住所が入っています。</p>
        </section>
      ) : (
        <>
          {newCount > 0 && <div className="rounded-2xl bg-biz/10 border-2 border-biz p-3 font-bold text-biz">🛒 新しい注文が {newCount} 件あります</div>}
          <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
            <div className="text-sm font-bold text-biz">注文と届け先</div>
            {orders.length === 0 ? (
              <p className="text-sm text-black/60">まだ注文はありません。</p>
            ) : (
              <ul className="space-y-2">
                {orders.map((o) => (
                  <li key={o.id} className={`rounded-xl p-3 text-sm space-y-1 ${o.is_new ? "bg-biz/10" : "bg-black/[0.03]"}`}>
                    <div className="flex justify-between gap-2">
                      <b className="line-clamp-1">
                        {o.is_new && <span className="mr-1 rounded-full bg-biz text-white text-xs px-2 py-0.5">新しい</span>}
                        {o.product_name}
                      </b>
                      <span className="shrink-0">×{o.quantity}</span>
                    </div>
                    <div className="text-xs text-black/50">{o.created_at}</div>
                    {o.kind === "service" ? (
                      <div className="rounded-lg bg-biz/10 p-2">
                        <b>案内を送る先：</b>
                        {o.ship_name ?? ""} <span className="break-all">{o.customer_email ?? "（メールアドレスなし）"}</span>
                        <div className="text-xs text-black/60">配信の URL や日時を、このアドレスにメールで送ってください。</div>
                      </div>
                    ) : (
                      <div>
                        <b>届け先：</b>
                        {o.ship_name ?? "（なし）"}
                        <div className="whitespace-pre-wrap">{o.ship_address ?? ""}</div>
                      </div>
                    )}
                    {o.ship_method && <div className="text-xs">送り方：{o.ship_method}</div>}
                    {o.kind !== "service" && !o.ship_method?.includes("受け取り") && shipDays.length > 0 && (() => {
                      const d = nextShipDate(new Date(o.created_at.replace(" ", "T")), shipDays);
                      return d && <div className="text-xs">📅 次の発送日：{d.getMonth() + 1}/{d.getDate()}（{WEEKDAYS[d.getDay()]}）</div>;
                    })()}
                    {o.ship_warning && <div className="rounded-lg bg-amber-50 text-amber-800 p-2 text-xs">⚠️ {o.ship_warning}</div>}
                    <div className="text-xs">
                      お支払い {o.amount_yen.toLocaleString()}円{o.kind !== "service" && `（うち送料 ${o.shipping_yen.toLocaleString()}円）`}／ 事業者さんの受け取り <b>{o.owner_yen.toLocaleString()}円</b>
                    </div>
                    {o.letters.length > 0 && (
                      <div className="rounded-lg bg-white p-2 text-xs space-y-1">
                        <div className="font-bold">📮 お客さまからの一言</div>
                        {o.letters.map((l) => (
                          <div key={l.id}>
                            <div className="whitespace-pre-wrap">{l.original}</div>
                            {l.owner_reply && <div className="text-biz whitespace-pre-wrap">↩ {l.owner_reply}</div>}
                          </div>
                        ))}
                        <div className="text-black/50">お返事は、担当のパートナーのスマホから書けます。</div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <button className="w-full text-sm text-black/50" onClick={() => setOrders(null)}>
              閉じる（届け先を隠す）
            </button>
          </section>
          <p className="text-xs text-black/50">このページは、担当のパートナーと YMM（株式会社山崎メディアミックス）も見られる注文の記録と同じものです。</p>
        </>
      )}
    </div>
  );
}

export default function OwnerPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <OwnerPageInner />
    </Suspense>
  );
}
