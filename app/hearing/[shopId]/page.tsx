"use client";

// パートナー：お店のページ
//   はじめに：店主さんの暗証番号（リリース用）を店主さんに決めてもらう
//   お店の理念（1回だけ聞く）→ 店主さんが読んで公開OK
//   販売者の情報・送料（全国一律）
//   商品の一覧と「＋商品を追加」。公開中の商品は Instagram で紹介
//   注文と届け先（店主さん用・暗証番号で開く）
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SellerSection, type Seller } from "@/components/SellerSection";
import { PinPad } from "@/components/PinPad";
import { OwnerApprove } from "@/components/OwnerApprove";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";

type Data = {
  shop: {
    id: number;
    name: string;
    category: string;
    philosophy_text: string | null;
    philosophy_status: "none" | "draft" | "approved";
    shipping_yen: number | null;
    has_pin: boolean;
    seller: Seller;
  };
  products: { id: number; name: string; price_yen: number; status: string; verdict: string | null; photo: string | null }[];
};

const STATUS = { draft: "店主さんの確認待ち", published: "公開中", rejected: "却下" } as Record<string, string>;
const VERDICT = {
  販売できる: "text-leaf",
  直せば販売できる: "text-amber-600",
  このままでは販売できない: "text-red-600",
} as Record<string, string>;

async function post(url: string, body: unknown): Promise<{ error: string; json: Record<string, unknown> }> {
  const r = await apiFetch(url, { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  return { error: r.ok ? "" : (j.error ?? "うまくいきませんでした"), json: j };
}

function ShopPageInner() {
  const { shopId } = useParams<{ shopId: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const r = await apiFetch(`/api/shops/${shopId}`);
    const j = await r.json();
    if (!r.ok) setError(j.error);
    else setData(j);
  }, [shopId]);

  useEffect(() => {
    fetch(`/api/shops/${shopId}`)
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => (ok ? setData(j) : setError(j.error)));
  }, [shopId]);

  if (error) return <p className="rounded-xl bg-red-50 text-red-700 p-3">{error}</p>;
  if (!data) return <p className="text-black/50">読み込み中…</p>;
  const { shop, products } = data;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/hearing" className="text-sm text-leaf">← お店の一覧</Link>
        <h1 className="text-xl font-bold mt-1">{shop.name}</h1>
        <p className="text-sm text-black/60">{shop.category}</p>
      </div>

      {!shop.has_pin && <SetShopPin shopId={shop.id} onDone={load} />}

      <PhilosophyCard shop={shop} onChanged={load} />

      <SellerSection shopId={shop.id} initial={shop.seller} />

      <ShippingCard shopId={shop.id} initial={shop.shipping_yen} onSaved={load} />

      {/* 商品（1つずつ、写真を撮って聞く）。タップで修正・リリースの画面 */}
      <section className="space-y-3">
        <div className="font-bold">商品 {products.length}件</div>
        <Link href={`/hearing/${shop.id}/new`} className="block text-center rounded-2xl bg-carrot text-white py-4 text-lg font-bold">
          ＋ 商品を追加
        </Link>
        {products.map((p) => (
          <div key={p.id}>
            <Link
              href={`/hearing/${shop.id}/p/${p.id}`}
              className={`flex gap-3 bg-white p-3 shadow-sm border border-black/5 active:opacity-70 ${p.status === "published" ? "rounded-t-2xl" : "rounded-2xl"}`}
            >
              <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-black/5 grid place-items-center text-black/30 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.photo ? <img src={p.photo} alt="" className="w-full h-full object-cover" /> : "写真なし"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold leading-snug line-clamp-2">{p.name}</div>
                <div className="text-sm">{p.price_yen.toLocaleString()}円</div>
                <div className="text-xs flex flex-wrap gap-x-2 mt-1">
                  <span className="text-black/50">{STATUS[p.status] ?? p.status}</span>
                  {p.verdict && <span className={`font-bold ${VERDICT[p.verdict] ?? ""}`}>{p.verdict}</span>}
                </div>
              </div>
              <span className="self-center shrink-0 rounded-lg border border-leaf/40 text-leaf text-xs font-bold px-2.5 py-1.5">
                {p.status === "draft" ? "修正・リリース" : "修正"}
              </span>
            </Link>
            {p.status === "published" && (
              <Link href={`/hearing/${shop.id}/p/${p.id}/share`} className="-mt-2 block rounded-b-2xl bg-carrot text-white text-center py-3 font-bold shadow-sm">
                📷 Instagram で紹介する
              </Link>
            )}
          </div>
        ))}
      </section>

      <OrdersCard shopId={shop.id} hasPin={shop.has_pin} />
    </div>
  );
}

// ---------- 店主さんの暗証番号（まだ決まっていないお店だけ） ----------

function SetShopPin({ shopId, onDone }: { shopId: number; onDone: () => void }) {
  const [first, setFirst] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function done(pin: string) {
    if (!first) {
      setFirst(pin);
      setError("");
      return false; // 確認のため、もう一度押してもらう
    }
    if (pin !== first) {
      setFirst("");
      setError("1回目と2回目がちがいました。最初からお願いします");
      return false;
    }
    setBusy(true);
    const { error } = await post(`/api/shops/${shopId}/pin`, { pin });
    setBusy(false);
    if (error) {
      setFirst("");
      setError(error);
      return false;
    }
    onDone();
  }

  return (
    <section className="rounded-2xl border-2 border-carrot bg-carrot/5 p-4 space-y-3">
      <div className="font-bold text-carrot">はじめに：店主さんの暗証番号を決める</div>
      <p className="text-sm">
        商品を公開（リリース）できるのは店主さんだけです。📱 スマホを店主さんに渡して、数字4けたを決めてもらってください。パートナーさんは見ないでください。
      </p>
      {busy ? (
        <div className="py-6 text-center text-leaf font-bold">
          <Working text="保存しています" />
        </div>
      ) : (
        <PinPad label={first ? "確認のため、もう一度" : "店主さん：数字4けたを決める"} onDone={done} />
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm text-center">{error}</p>}
    </section>
  );
}

// ---------- お店の理念・思い ----------

function PhilosophyCard({ shop, onChanged }: { shop: Data["shop"]; onChanged: () => void }) {
  const [mode, setMode] = useState<"" | "edit" | "revise">("");
  const [text, setText] = useState(shop.philosophy_text ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = { none: "まだ聞いていません", draft: "店主さんの確認待ち", approved: "公開OK" }[shop.philosophy_status];

  async function act(action: "edit" | "revise") {
    setError("");
    setBusy(true);
    const { error } = await post(`/api/shops/${shop.id}/about/review`, { action, text, note });
    setBusy(false);
    if (error) return setError(error);
    setMode("");
    setNote("");
    onChanged();
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-leaf">お店の理念・思い</div>
        <span className={`text-xs ${shop.philosophy_status === "draft" ? "text-carrot font-bold" : "text-black/50"}`}>{label}</span>
      </div>
      {!shop.philosophy_text ? (
        <p className="text-sm text-black/60">最初に一度だけ、お店を始めたきっかけや大事にしていることを聞きます。商品の紹介文にも生かされます。</p>
      ) : mode === "edit" ? (
        <textarea className="w-full min-h-48 rounded-xl border border-black/15 p-3 text-base leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${shop.philosophy_status === "approved" ? "line-clamp-4" : ""}`}>{shop.philosophy_text}</p>
      )}

      {shop.philosophy_status === "draft" && mode === "" && (
        <div className="space-y-2">
          <OwnerApprove
            button="店主さんに読んでもらって、公開OK"
            label="店主さん：お店の暗証番号"
            note="公開OKにすると、このお店の商品ページの下に表示されます。"
            onPin={async (pin) => {
              const { error } = await post(`/api/shops/${shop.id}/about/review`, { action: "approve", shopPin: pin });
              if (!error) onChanged();
              return error;
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-xl border-2 border-leaf text-leaf py-2.5 font-bold" onClick={() => setMode("edit")}>
              手で直す
            </button>
            <button className="rounded-xl border-2 border-carrot text-carrot py-2.5 font-bold text-sm" onClick={() => setMode("revise")}>
              AI に直してもらう
            </button>
          </div>
        </div>
      )}
      {mode === "edit" && (
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-50" disabled={busy} onClick={() => act("edit")}>
            保存する
          </button>
          <button className="rounded-xl border border-black/15 px-4" onClick={() => setMode("")}>
            やめる
          </button>
        </div>
      )}
      {mode === "revise" && (
        <div className="space-y-2">
          <textarea
            className="w-full min-h-20 rounded-xl border border-black/15 p-3 text-base"
            placeholder="例：もっと素朴な感じに。祖母の代からの話を入れて。"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-carrot text-white py-3 font-bold disabled:opacity-50" disabled={busy || !note.trim()} onClick={() => act("revise")}>
              {busy ? <Working text="Claude が書き直しています" est={10} /> : "この内容で書き直す"}
            </button>
            <button className="rounded-xl border border-black/15 px-4" disabled={busy} onClick={() => setMode("")}>
              やめる
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      {mode === "" && (
        <Link
          href={`/hearing/${shop.id}/about`}
          className={`block text-center rounded-xl py-3 font-bold ${shop.philosophy_text ? "border border-leaf/40 text-leaf" : "bg-leaf text-white"}`}
        >
          {shop.philosophy_text ? "聞き直す" : "お店のヒアリングを始める"}
        </Link>
      )}
    </section>
  );
}

// ---------- 送料（全国一律・商品代とは別） ----------

function ShippingCard({ shopId, initial, onSaved }: { shopId: number; initial: number | null; onSaved: () => void }) {
  const [yen, setYen] = useState(initial == null ? "" : String(initial));
  const [editing, setEditing] = useState(initial == null);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    const { error } = await post(`/api/shops/${shopId}/shipping`, { yen: Number(yen) });
    if (error) return setError(error);
    setEditing(false);
    onSaved();
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-leaf">送料（全国一律）</div>
        {!editing && (
          <button className="text-xs text-leaf underline" onClick={() => setEditing(true)}>
            変える
          </button>
        )}
      </div>
      {editing ? (
        <>
          <div className="flex items-center gap-2">
            <input
              className="w-32 rounded-xl border border-black/15 p-3 text-base text-right"
              inputMode="numeric"
              placeholder="例：800"
              value={yen}
              onChange={(e) => setYen(e.target.value.replace(/[^\d]/g, ""))}
            />
            <span>円</span>
            <button className="ml-auto rounded-xl bg-leaf text-white px-5 py-3 font-bold disabled:opacity-40" disabled={yen === ""} onClick={save}>
              保存
            </button>
          </div>
          <p className="text-xs text-black/50">商品代とは別に、お客さまが払います。送料はそのまま店主さんに渡ります。送料なしなら 0。</p>
        </>
      ) : (
        <p className="text-lg font-bold">{initial === 0 ? "送料無料" : `${initial?.toLocaleString()}円`}</p>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </section>
  );
}

// ---------- 注文と届け先（店主さん用） ----------

type Order = {
  id: number;
  created_at: string;
  quantity: number;
  amount_yen: number;
  shipping_yen: number;
  owner_yen: number;
  ship_name: string | null;
  ship_address: string | null;
  product_name: string;
};

function OrdersCard({ shopId, hasPin }: { shopId: number; hasPin: boolean }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  if (!hasPin) return null;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
      <div className="text-sm font-bold text-leaf">注文と届け先（店主さん用）</div>
      {orders === null ? (
        <OwnerApprove
          button="店主さん：注文を見る"
          label="店主さん：お店の暗証番号"
          note="お客さまの住所が入っているので、店主さんの暗証番号で開きます。"
          onPin={async (pin) => {
            const { error, json } = await post(`/api/shops/${shopId}/orders`, { shopPin: pin });
            if (!error) setOrders(json.orders as Order[]);
            return error;
          }}
        />
      ) : orders.length === 0 ? (
        <p className="text-sm text-black/60">まだ注文はありません。</p>
      ) : (
        <>
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl bg-black/[0.03] p-3 text-sm space-y-1">
                <div className="flex justify-between gap-2">
                  <b className="line-clamp-1">{o.product_name}</b>
                  <span className="shrink-0">×{o.quantity}</span>
                </div>
                <div className="text-xs text-black/50">{o.created_at}</div>
                <div>
                  <b>届け先：</b>
                  {o.ship_name ?? "（なし）"}
                  <div className="whitespace-pre-wrap">{o.ship_address ?? ""}</div>
                </div>
                <div className="text-xs">
                  お支払い {o.amount_yen.toLocaleString()}円（うち送料 {o.shipping_yen.toLocaleString()}円）／ 店主さんの受け取り <b>{o.owner_yen.toLocaleString()}円</b>
                </div>
              </li>
            ))}
          </ul>
          <button className="w-full text-sm text-black/50" onClick={() => setOrders(null)}>
            閉じる（届け先を隠す）
          </button>
        </>
      )}
    </section>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <ShopPageInner />
    </Suspense>
  );
}
