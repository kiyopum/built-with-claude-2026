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
import { PREFS, WEEKDAYS, fullPref, nextShipDate, shipDaysLabel } from "@/lib/shipping";

type Data = {
  shop: {
    id: number;
    name: string;
    category: string;
    philosophy_text: string | null;
    philosophy_status: "none" | "draft" | "approved";
    shipping_yen: number | null;
    prefecture: string | null;
    pickup_ok: boolean;
    online_label: boolean;
    ship_days: number[];
    neighbor_days: Record<string, number>;
    prefecture_hint: string | null;
    has_pin: boolean;
    partner_resting?: boolean;
    seller: Seller;
  };
  products: {
    id: number;
    name: string;
    price_yen: number;
    status: string;
    verdict: string | null;
    photo: string | null;
    quiet: boolean;
    nudge: { step: string; why: string; how: string[] } | null;
    nudge_at: string | null;
  }[];
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
        {shop.partner_resting && <p className="mt-1 rounded-lg bg-leaf/10 p-2 text-xs">🌿 担当の方は今月お休み中です。そのあいだ、みんなで見守っています。</p>}
        <p className="text-sm text-black/60">{shop.category}</p>
      </div>

      {!shop.has_pin && <SetShopPin shopId={shop.id} onDone={load} />}

      <PhilosophyCard shop={shop} onChanged={load} />

      <SellerSection shopId={shop.id} initial={shop.seller} />

      <ShippingCard shopId={shop.id} initial={shop.shipping_yen} prefecture={shop.prefecture} hint={shop.prefecture_hint} pickupOk={shop.pickup_ok} onlineLabel={shop.online_label} onSaved={load} />
      <ShipDaysCard shopId={shop.id} days={shop.ship_days} neighbors={shop.neighbor_days} prefecture={shop.prefecture} onSaved={load} />

      {/* 商品（1つずつ、写真を撮って聞く）。タップで修正・リリースの画面 */}
      <section className="space-y-3">
        <div className="font-bold">商品 {products.length}件</div>
        <Link href={`/hearing/${shop.id}/new`} className="block text-center rounded-2xl bg-carrot text-white py-4 text-lg font-bold">
          ＋ 商品を追加
        </Link>
        <Link href={`/hearing/${shop.id}/new?kind=service`} className="block text-center rounded-2xl border-2 border-carrot text-carrot py-3 font-bold">
          ＋ サービスを追加（ライブ配信・講座・体験など）
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
            {p.status === "published" && (p.quiet || p.nudge) && <NudgeCard draftId={p.id} initial={p.nudge} at={p.nudge_at} />}
          </div>
        ))}
      </section>

      <OrdersCard shopId={shop.id} hasPin={shop.has_pin} shipDays={shop.ship_days} />

      <Link href={`/hearing/${shop.id}/book`} className="block rounded-2xl bg-white p-4 shadow-sm border border-black/5">
        <div className="font-bold">📖 お店の言葉の本</div>
        <div className="text-sm text-black/60">店主さんが大事にしてきたことを1冊にまとめて、印刷して渡します（後を継ぐ人・家族へ）</div>
      </Link>
    </div>
  );
}

// ---------- 売れなくても責めない伴走：次の小さな一歩（2026-11-05 きよさん） ----------

function NudgeCard({ draftId, initial, at }: { draftId: number; initial: { step: string; why: string; how: string[] } | null; at: string | null }) {
  const [n, setN] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function think() {
    setError("");
    setBusy(true);
    const { error, json } = await post(`/api/drafts/${draftId}/nudge`, {});
    setBusy(false);
    if (error) return setError(error);
    setN(json.nudge as typeof n);
  }
  return (
    <div className="rounded-2xl bg-leaf/5 border border-leaf/20 p-3 text-sm space-y-2">
      <div className="font-bold text-leaf">🌱 もっと届くように、次の小さな一歩</div>
      {n ? (
        <>
          <p className="font-bold">{n.step}</p>
          <p className="text-black/70">{n.why}</p>
          <ol className="list-decimal pl-5 text-black/70">{n.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
          {at && <p className="text-xs text-black/40">{at} に Claude が考えました</p>}
        </>
      ) : (
        <p className="text-black/70">公開してしばらくたちました。届く人を少し広げる工夫を、Claude と1つだけ考えてみませんか。</p>
      )}
      <button className="w-full rounded-xl border border-leaf text-leaf py-2 font-bold disabled:opacity-50" onClick={think} disabled={busy}>
        {busy ? <Working text="考えています" /> : n ? "別の一歩を考える" : "一歩を考える"}
      </button>
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-2 text-xs">{error}</p>}
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

// ---------- 発送する曜日（2026-11-05 きよさん：近所のお店で出す日をそろえると、集荷が1回で済む） ----------

function ShipDaysCard({ shopId, days, neighbors, prefecture, onSaved }: { shopId: number; days: number[]; neighbors: Record<string, number>; prefecture: string | null; onSaved: () => void }) {
  const [error, setError] = useState("");
  async function toggle(d: number) {
    setError("");
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    const { error } = await post(`/api/shops/${shopId}/shipping`, { ship_days: next });
    if (error) return setError(error);
    onSaved();
  }
  const best = Object.entries(neighbors).sort((a, b) => b[1] - a[1])[0];
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
      <div className="text-sm font-bold text-leaf">📅 発送する曜日</div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <button
            key={w}
            className={`rounded-lg py-2 text-sm font-bold relative ${days.includes(i) ? "bg-leaf text-white" : "bg-black/5 text-black/60"}`}
            onClick={() => toggle(i)}
          >
            {w}
            {neighbors[i] ? <span className="absolute -top-1.5 -right-1 rounded-full bg-carrot text-white text-[10px] leading-4 px-1">{neighbors[i]}</span> : null}
          </button>
        ))}
      </div>
      <p className="text-xs text-black/60">
        決めると、商品ページに「発送は毎週{days.length ? shipDaysLabel(days) : "○曜"}」と出て、注文には次の発送日が出ます。
        {prefecture
          ? best
            ? ` オレンジの数字は、${fullPref(prefecture)}で同じ曜日に出しているほかのお店の数です。近所で出す日をそろえると、運ぶ人の集荷が1回で済むかもしれません（まとめて集荷できるかは、運送会社の営業所に相談してください）。`
            : ` ${fullPref(prefecture)}で、ほかに発送する曜日を決めたお店はまだありません。`
          : " 送り出す都道府県を決めると、同じ県で同じ曜日に出しているお店の数が出ます。"}
      </p>
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-2 text-xs">{error}</p>}
    </section>
  );
}

// ---------- 送料 ----------
//   送り出す都道府県：商品ごとに大きさ・重さを選ぶと、届け先との距離でいちばん安い「送料込み」の値段になる
//   お店で受け取り：近所の人は送料なしで買える
//   全国一律：大きさ・重さをまだ選んでいない商品で使う（今までの形）

function OriginCard({ shopId, prefecture, hint, pickupOk, onlineLabel, onSaved }: { shopId: number; prefecture: string | null; hint: string | null; pickupOk: boolean; onlineLabel: boolean; onSaved: () => void }) {
  const [pref, setPref] = useState(prefecture ?? hint ?? "");
  const [error, setError] = useState("");
  async function send(body: Record<string, unknown>) {
    setError("");
    const { error } = await post(`/api/shops/${shopId}/shipping`, body);
    if (error) return setError(error);
    onSaved();
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-sm font-bold">お店から送り出す都道府県</div>
        <div className="flex gap-2">
          <select className="flex-1 rounded-xl border border-black/15 bg-white p-3 text-base" value={pref} onChange={(e) => setPref(e.target.value)}>
            <option value="">選んでください</option>
            {PREFS.map((p) => (
              <option key={p} value={p}>
                {fullPref(p)}
              </option>
            ))}
          </select>
          <button className="rounded-xl bg-leaf text-white px-5 font-bold disabled:opacity-40" disabled={!pref || pref === prefecture} onClick={() => send({ prefecture: pref })}>
            保存
          </button>
        </div>
        <p className="text-xs text-black/50">
          {prefecture
            ? `保存済み：${fullPref(prefecture)}。商品ごとに大きさと重さを選ぶと、届け先までの距離で「送料込み」の値段になります。`
            : hint
              ? "販売者の住所から選んであります。合っていれば「保存」を押してください。"
              : "商品ごとに大きさと重さを選ぶと、届け先までの距離で「送料込み」の値段になります。"}
        </p>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] p-3">
        <span className="text-sm">
          <b>お店で受け取り</b>もできる
          <span className="block text-xs text-black/50">近所の方は送料なしで買えます</span>
        </span>
        <button
          className={`shrink-0 w-16 h-9 rounded-full font-bold text-sm ${pickupOk ? "bg-leaf text-white" : "bg-black/10 text-black/50"}`}
          onClick={() => send({ pickup_ok: !pickupOk })}
        >
          {pickupOk ? "できる" : "しない"}
        </button>
      </label>
      <label className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] p-3">
        <span className="text-sm">
          <b>ネットで宛名ラベルを作る</b>送り方も使う
          <span className="block text-xs text-black/50">
            クリックポスト（小さな物が240円）。Yahoo! か Amazon のアカウント・ネットでのカード払い・ラベルの印刷が要ります。使わないときは、郵便局で出せる送り方だけで計算します。
          </span>
        </span>
        <button
          className={`shrink-0 w-16 h-9 rounded-full font-bold text-sm ${onlineLabel ? "bg-leaf text-white" : "bg-black/10 text-black/50"}`}
          onClick={() => send({ online_label: !onlineLabel })}
        >
          {onlineLabel ? "使う" : "使わない"}
        </button>
      </label>
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </div>
  );
}

function ShippingCard({
  shopId,
  initial,
  prefecture,
  hint,
  pickupOk,
  onlineLabel,
  onSaved,
}: {
  shopId: number;
  initial: number | null;
  prefecture: string | null;
  hint: string | null;
  pickupOk: boolean;
  onlineLabel: boolean;
  onSaved: () => void;
}) {
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
        <div className="text-sm font-bold text-leaf">送料</div>
        {!editing && (
          <button className="text-xs text-leaf underline" onClick={() => setEditing(true)}>
            変える
          </button>
        )}
      </div>
      <OriginCard shopId={shopId} prefecture={prefecture} hint={hint} pickupOk={pickupOk} onlineLabel={onlineLabel} onSaved={onSaved} />
      <div className="text-sm font-bold pt-2 border-t border-black/5">全国一律の送料（大きさと重さをまだ選んでいない商品）</div>
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
          <p className="text-xs text-black/50">商品代とは別に、お客さまが払います。送料はそのまま店主さんに渡ります。お店が送料を持つなら 0。</p>
        </>
      ) : (
        <p className="text-lg font-bold">{initial === 0 ? "0円（お店が負担）" : `${initial?.toLocaleString()}円`}</p>
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
  ship_method: string | null;
  ship_warning: string | null;
  customer_email: string | null;
  kind: "goods" | "service";
  product_name: string;
  letter_token: string;
  letters: { id: number; original: string; owner_reply: string | null; replied_at: string | null; created_at: string; title: string | null; kind: string | null }[];
};

// ありがとうの往復便：お客さまからのお便りと、店主さんのお返事
function LetterThread({ o, onReply }: { o: Order; onReply: (letterId: number, text: string) => Promise<string> }) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  if (!o.letters.length) return null;
  return (
    <div className="space-y-2 pt-1">
      {o.letters.map((l) => (
        <div key={l.id} className="rounded-lg bg-white p-2 space-y-2 border border-black/5">
          <div className="text-xs text-black/50">📮 お客さまからのお便り・{l.created_at.slice(0, 10)}</div>
          <p className="whitespace-pre-wrap">{l.original}</p>
          {l.title && (
            <div className="text-xs text-black/60">
              みんなの声には「{l.kind === "request" ? "🌱" : "🌸"} {l.title}」として、名前を消して載りました。
            </div>
          )}
          {l.owner_reply ? (
            <div className="rounded-lg bg-leaf/10 p-2">
              <div className="text-xs text-leaf font-bold">お返事（{l.replied_at?.slice(0, 10)}）</div>
              <p className="whitespace-pre-wrap">{l.owner_reply}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                className="w-full min-h-20 rounded-lg border border-black/20 p-2 text-base"
                placeholder="店主さんのお返事（お客さまが同じ QR を開くと読めます）"
                value={drafts[l.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
              />
              <button
                className="w-full rounded-xl bg-leaf text-white py-2 font-bold disabled:opacity-50"
                disabled={busy !== null || !(drafts[l.id] ?? "").trim()}
                onClick={async () => {
                  setError("");
                  setBusy(l.id);
                  const err = await onReply(l.id, drafts[l.id] ?? "");
                  setBusy(null);
                  if (err) setError(err);
                }}
              >
                {busy === l.id ? <Working text="お返事を届けています" /> : "お返事を届ける"}
              </button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-2 text-xs">{error}</p>}
    </div>
  );
}

function OrdersCard({ shopId, hasPin, shipDays }: { shopId: number; hasPin: boolean; shipDays: number[] }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  // 開いている間だけ、お返事に使う暗証番号を覚えておく（閉じたら消える）
  const [pin, setPin] = useState("");
  if (!hasPin) return null;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
      <div className="text-sm font-bold text-leaf">注文と届け先（店主さん用）</div>
      {orders === null ? (
        <OwnerApprove
          button="店主さん：注文を見る"
          label="店主さん：お店の暗証番号"
          note="お客さまの住所が入っているので、店主さんの暗証番号で開きます。"
          onPin={async (p) => {
            const { error, json } = await post(`/api/shops/${shopId}/orders`, { shopPin: p });
            if (!error) {
              setOrders(json.orders as Order[]);
              setPin(p);
            }
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
                {o.kind === "service" ? (
                  <div className="rounded-lg bg-leaf/10 p-2">
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
                {o.kind !== "service" && o.ship_method !== "お店で受け取り" && shipDays.length > 0 && (() => {
                  const d = nextShipDate(new Date(o.created_at.replace(" ", "T")), shipDays);
                  return d && <div className="text-xs">📅 次の発送日：{d.getMonth() + 1}/{d.getDate()}（{WEEKDAYS[d.getDay()]}）</div>;
                })()}
                {o.ship_warning && <div className="rounded-lg bg-amber-50 text-amber-800 p-2 text-xs">⚠️ {o.ship_warning}</div>}
                <div className="text-xs">
                  お支払い {o.amount_yen.toLocaleString()}円{o.kind !== "service" && `（うち送料 ${o.shipping_yen.toLocaleString()}円）`}／ 店主さんの受け取り <b>{o.owner_yen.toLocaleString()}円</b>
                </div>
                {o.kind !== "service" && (
                  <Link href={`/hearing/${shopId}/card?t=${o.letter_token}`} className="inline-block text-xs text-leaf underline">
                    📮 箱に入れるお手紙カードを印刷する
                  </Link>
                )}
                <LetterThread
                  o={o}
                  onReply={async (letterId, text) => {
                    const { error, json } = await post(`/api/shops/${shopId}/orders`, { shopPin: pin, reply: { letterId, text } });
                    if (!error) setOrders(json.orders as Order[]);
                    return error;
                  }}
                />
              </li>
            ))}
          </ul>
          <button
            className="w-full text-sm text-black/50"
            onClick={() => {
              setOrders(null);
              setPin("");
            }}
          >
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
