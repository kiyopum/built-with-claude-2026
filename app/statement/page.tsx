"use client";

// 画面3：成果明細
//   パートナー：自分の取り分（担当分・紹介分）と、契約条件（フリーランス新法で明示が必要な3点）
//   YMM 管理：
//   ・売れた合計と、店主・パートナー・YMM・決済手数料の取り分
//   ・注文ごとの明細（記録した時の料率で計算済み）
//   ・分け方のシミュレーション：料率・月の売上・作業時間・サーバー代を動かして、三方良しになる設定を探す
// 分配の送金はアプリの外（本番は Stripe Connect）。ここは記録と確認だけ。
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { splitAmount } from "@/lib/split";

type Order = {
  id: number;
  created_at: string;
  draft_id: number;
  quantity: number;
  amount_yen: number;
  owner_yen: number;
  partner_yen: number;
  ymm_yen: number;
  fee_yen: number;
  ymm_rate: number;
  partner_share: number;
  product_name: string;
  shop_name: string;
  ref: string | null;
  shipping_yen: number;
  owner_partner_name: string | null;
  owner_partner_yen: number;
  referrer_name: string | null;
  referrer_yen: number;
};
type Totals = { count: number; amount: number; owner: number; partner: number; ymm: number; fee: number; shipping: number };
type Settings = { ymm_rate: number; partner_share: number; stripe_fee_rate: number; payment_terms: string };
type AdminData = {
  view: "admin";
  orders: Order[];
  totals: Totals;
  byShop: { shop_name: string; count: number; amount: number; owner: number }[];
  byPartner: { id: number; name: string; owner_yen: number; referrer_yen: number }[];
  settings: Settings;
};
type PartnerOrder = {
  id: number;
  created_at: string;
  draft_id: number;
  quantity: number;
  amount_yen: number;
  shipping_yen: number;
  product_name: string;
  shop_name: string;
  my_yen: number;
  role: string;
};
type PartnerData = {
  view: "partner";
  me: { name: string; code: string };
  orders: PartnerOrder[];
  totals: { count: number; sales: number; mine: number };
  settings: Settings;
};
type Data = AdminData | PartnerData;

const PARTS = [
  { key: "owner", label: "店主", color: "bg-carrot", text: "text-carrot" },
  { key: "partner", label: "パートナー", color: "bg-leaf", text: "text-leaf" },
  { key: "ymm", label: "YMM", color: "bg-sky-600", text: "text-sky-700" },
  { key: "fee", label: "決済手数料", color: "bg-black/30", text: "text-black/50" },
] as const;

const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

function SplitBar({ v }: { v: { owner: number; partner: number; ymm: number; fee: number } }) {
  const total = v.owner + v.partner + v.ymm + v.fee;
  if (!total) return null;
  return (
    <div className="flex h-3 w-full rounded-full overflow-hidden bg-black/5" aria-hidden>
      {PARTS.map((p) => (
        <div key={p.key} className={p.color} style={{ width: `${(v[p.key] / total) * 100}%` }} />
      ))}
    </div>
  );
}

export default function StatementPage() {
  const [data, setData] = useState<Data | null>(null);

  async function load() {
    const r = await apiFetch("/api/statement");
    setData(await r.json());
  }
  useEffect(() => {
    apiFetch("/api/statement")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-black/50">読み込み中…</p>;
  if (data.view === "partner") return <PartnerStatement data={data} />;
  const t = data.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">成果明細</h1>
        <p className="text-xs text-black/50">売れたときの取り分の記録です。分配の送金はアプリの外で行います（本番は Stripe Connect）。</p>
      </div>

      {/* 合計 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold">売上の合計</div>
          <div className="text-xs text-black/50">{t.count}件</div>
        </div>
        <div className="text-3xl font-bold">{yen(t.amount)}</div>
        {t.shipping > 0 && <div className="text-xs text-black/50">うち送料 {yen(t.shipping)}（店主さんへ）</div>}
        <SplitBar v={t} />
        <dl className="grid grid-cols-2 gap-2">
          {PARTS.map((p) => (
            <div key={p.key} className="rounded-xl bg-black/[0.03] p-3">
              <dt className={`text-xs font-bold flex items-center gap-1 ${p.text}`}>
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${p.color}`} />
                {p.label}
              </dt>
              <dd className="text-lg font-bold">{yen(t[p.key])}</dd>
            </div>
          ))}
        </dl>
        {t.count === 0 && (
          <p className="text-sm text-black/60">
            まだ売れた記録はありません。お客さま画面から商品を買うと（テスト用カード 4242 4242 4242 4242）、ここに記録されます。
          </p>
        )}
      </section>

      {/* 注文ごと */}
      {data.orders.length > 0 && (
        <section className="space-y-2">
          <div className="font-bold">注文ごとの明細</div>
          {data.orders.map((o) => (
            <div key={o.id} className="rounded-2xl bg-white p-3 shadow-sm border border-black/5 space-y-2">
              <div className="flex justify-between gap-2 text-xs text-black/50">
                <span>{o.created_at}</span>
                <span>
                  {o.ref && <span className="mr-2 rounded-full bg-leaf/10 text-leaf px-2 py-0.5 font-bold">シェア経由：{o.ref}</span>}
                  {o.shop_name}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <Link href={`/p/${o.draft_id}`} className="font-bold leading-snug line-clamp-2 underline-offset-2 hover:underline">
                  {o.product_name}
                </Link>
                <div className="shrink-0 text-right">
                  <div className="font-bold">{yen(o.amount_yen)}</div>
                  <div className="text-xs text-black/50">{o.quantity}個</div>
                </div>
              </div>
              <SplitBar v={{ owner: o.owner_yen, partner: o.partner_yen, ymm: o.ymm_yen, fee: o.fee_yen }} />
              <div className="grid grid-cols-4 gap-1 text-[11px] text-center">
                {PARTS.map((p) => (
                  <div key={p.key}>
                    <div className={`font-bold ${p.text}`}>{p.label}</div>
                    <div>{yen({ owner: o.owner_yen, partner: o.partner_yen, ymm: o.ymm_yen, fee: o.fee_yen }[p.key])}</div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-black/50">
                パートナー：
                {o.owner_partner_name ? `担当 ${o.owner_partner_name} ${yen(o.owner_partner_yen)}` : "担当なし"}
                {o.referrer_name && o.referrer_yen > 0 && `／紹介 ${o.referrer_name} ${yen(o.referrer_yen)}`}
                {o.shipping_yen > 0 && `／送料 ${yen(o.shipping_yen)}（店主さんへ・手数料は送料から）`}
              </div>
              <div className="text-[11px] text-black/40">
                この注文の料率：YMM {pct(o.ymm_rate)}・パートナー（手数料を引いた残りの）{pct(o.partner_share)}
              </div>
            </div>
          ))}
        </section>
      )}

      {data.byShop.length > 1 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
          <div className="text-sm font-bold">お店ごと</div>
          {data.byShop.map((s) => (
            <div key={s.shop_name} className="flex justify-between text-sm border-t border-black/5 pt-1">
              <span>{s.shop_name}（{s.count}件）</span>
              <span className="font-bold">{yen(s.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {data.byPartner.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
          <div className="text-sm font-bold">パートナーごと（担当分＋紹介分）</div>
          {data.byPartner.map((p) => (
            <div key={p.id} className="flex justify-between text-sm border-t border-black/5 pt-1">
              <span>
                {p.name}
                <span className="text-xs text-black/50">（担当 {yen(p.owner_yen)}・紹介 {yen(p.referrer_yen)}）</span>
              </span>
              <span className="font-bold">{yen(p.owner_yen + p.referrer_yen)}</span>
            </div>
          ))}
        </section>
      )}

      <Contract settings={data.settings} />
      <Simulator settings={data.settings} onSaved={load} />
    </div>
  );
}

// ---------- パートナーの明細 ----------

function PartnerStatement({ data }: { data: PartnerData }) {
  const t = data.totals;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">わたしの報酬</h1>
        <p className="text-xs text-black/50">
          {data.me.name} さん（パートナー番号 {data.me.code}）。担当のお店で売れた分と、紹介して売れた分です。
        </p>
      </div>
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2">
        <div className="text-sm font-bold text-leaf">これまでの報酬の合計</div>
        <div className="text-4xl font-bold text-leaf">{yen(t.mine)}</div>
        <div className="text-xs text-black/50">
          {t.count}件・関わった商品の売上 {yen(t.sales)}（送料を除く）
        </div>
        {t.count === 0 && <p className="text-sm text-black/60">まだ売れた記録はありません。商品を Instagram で紹介してみましょう。</p>}
      </section>

      {data.orders.length > 0 && (
        <section className="space-y-2">
          <div className="font-bold">売れたもの</div>
          {data.orders.map((o) => (
            <div key={o.id} className="rounded-2xl bg-white p-3 shadow-sm border border-black/5">
              <div className="flex justify-between gap-2 text-xs text-black/50">
                <span>{o.created_at}</span>
                <span className="rounded-full bg-leaf/10 text-leaf px-2 py-0.5 font-bold">{o.role}</span>
              </div>
              <div className="flex justify-between gap-2 mt-1">
                <div className="min-w-0">
                  <div className="font-bold leading-snug line-clamp-2">{o.product_name}</div>
                  <div className="text-xs text-black/50">
                    {o.shop_name}・{o.quantity}個・{yen(o.amount_yen - o.shipping_yen)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-black/50">報酬</div>
                  <div className="text-lg font-bold text-leaf">{yen(o.my_yen)}</div>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <Contract settings={data.settings} />
    </div>
  );
}

// ---------- 契約条件（フリーランス新法：業務内容・報酬の計算方法・支払期日を明示する） ----------

function Contract({ settings }: { settings: Settings }) {
  const per1000 = splitAmount(1000, settings.ymm_rate, settings.stripe_fee_rate, settings.partner_share);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-2 text-sm">
      <div className="font-bold">契約の条件（いつでもここで確かめられます）</div>
      <dl className="space-y-2">
        <div>
          <dt className="text-xs font-bold text-black/60">業務の内容</dt>
          <dd>お店でのヒアリング、商品ページの作成と修正の手伝い、商品の紹介（SNS など）。</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-black/60">報酬の計算方法</dt>
          <dd>
            売上（商品代。送料は除く）の {pct(settings.ymm_rate)} から決済手数料 {pct(settings.stripe_fee_rate)} を引いた残りの {pct(settings.partner_share)}。
            1,000円売れると {yen(per1000.partner)}。
            <br />
            ほかのパートナーが紹介して売れたときは、お店の担当と紹介した人で半分ずつ。自分の担当の商品を自分で紹介したときは全部。
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-black/60">支払期日</dt>
          <dd>{settings.payment_terms || <span className="text-red-600">まだ決まっていません（YMM が管理画面で入れます）</span>}</dd>
        </div>
      </dl>
      <p className="text-xs text-black/50">商品を紹介するときは、報酬を受け取る立場なので、投稿に「#PR」を入れます（紹介画面では自動で入ります）。</p>
    </section>
  );
}

// ---------- 分け方のシミュレーション ----------

function Simulator({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  // 画面では % で入れてもらう（0.036×100 が 3.5999… にならないよう小数2桁で丸める）
  const toPct = (r: number) => String(Math.round(r * 10000) / 100);
  const [ymm, setYmm] = useState(toPct(settings.ymm_rate));
  const [share, setShare] = useState(toPct(settings.partner_share));
  const [fee, setFee] = useState(toPct(settings.stripe_fee_rate));
  const [sales, setSales] = useState("300000");
  const [hours, setHours] = useState("10");
  const [server, setServer] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const fromPct = (v: string) => Math.round(Number(v) * 100) / 10000;
  const r = { ymm: fromPct(ymm), share: fromPct(share), fee: fromPct(fee) };
  const valid = [r.ymm, r.share, r.fee].every((x) => Number.isFinite(x) && x >= 0) && r.ymm <= 0.3 && r.share <= 1 && r.fee <= 0.1;
  const monthly = valid ? splitAmount(Number(sales) || 0, r.ymm, r.fee, r.share) : null;
  const per1000 = valid ? splitAmount(1000, r.ymm, r.fee, r.share) : null;
  const h = Number(hours);
  const serverCost = Number(server) || 0;
  const changed = r.ymm !== settings.ymm_rate || r.share !== settings.partner_share || r.fee !== settings.stripe_fee_rate;

  async function save() {
    setMsg("");
    setBusy(true);
    const res = await apiFetch("/api/settings", {
      method: "POST",
      body: JSON.stringify({ ymm_rate: r.ymm, partner_share: r.share, stripe_fee_rate: r.fee }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(j.error);
    setMsg("保存しました。これからの注文から、この分け方で記録します（これまでの注文はそのままです）。");
    onSaved();
  }

  const input = "w-full rounded-xl border border-black/15 p-2.5 text-base text-right";
  const field = (label: string, value: string, set: (v: string) => void, unit: string, note?: string) => (
    <label className="block">
      <span className="block text-xs font-bold text-black/60 mb-1">{label}</span>
      <span className="flex items-center gap-1">
        <input className={input} inputMode="decimal" value={value} onChange={(e) => set(e.target.value.replace(/[^\d.]/g, ""))} />
        <span className="text-sm shrink-0 w-8">{unit}</span>
      </span>
      {note && <span className="block text-[11px] text-black/40 mt-0.5">{note}</span>}
    </label>
  );

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border-2 border-leaf/30 space-y-4">
      <div>
        <div className="font-bold">分け方のシミュレーション</div>
        <p className="text-xs text-black/50">数字を変えると、その場で計算し直します。三方良しになる設定を探すためのものです。</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {field("YMM の取り分", ymm, setYmm, "%", "売上に対して")}
        {field("パートナーへ", share, setShare, "%", "手数料を引いた残りのうち")}
        {field("決済手数料", fee, setFee, "%", "Stripe")}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {field("ひと月の売上", sales, setSales, "円")}
        {field("パートナーの作業", hours, setHours, "時間", "ひと月あたり")}
        {field("サーバー代など", server, setServer, "円", "YMM の月の費用")}
      </div>

      {!valid && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">YMM は30%まで、パートナーは100%まで、手数料は10%までで入れてください。</p>}

      {monthly && per1000 && (
        <>
          <div className="space-y-2">
            <div className="text-sm font-bold">ひと月に {yen(Number(sales) || 0)} 売れたら</div>
            <SplitBar v={monthly} />
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-t border-black/5">
                  <th className="text-left font-bold text-carrot py-1.5">店主</th>
                  <td className="text-right font-bold">{yen(monthly.owner)}</td>
                  <td className="text-right text-xs text-black/50 w-28">1,000円で {yen(per1000.owner)}</td>
                </tr>
                <tr className="border-t border-black/5">
                  <th className="text-left font-bold text-leaf py-1.5">
                    パートナー
                    {h > 0 && <div className="text-[11px] font-normal text-black/50">時給にすると {yen(monthly.partner / h)}</div>}
                  </th>
                  <td className="text-right font-bold">{yen(monthly.partner)}</td>
                  <td className="text-right text-xs text-black/50">1,000円で {yen(per1000.partner)}</td>
                </tr>
                <tr className="border-t border-black/5">
                  <th className="text-left font-bold text-sky-700 py-1.5">
                    YMM
                    {serverCost > 0 && <div className="text-[11px] font-normal text-black/50">サーバー代などを引くと {yen(monthly.ymm - serverCost)}</div>}
                  </th>
                  <td className={`text-right font-bold ${serverCost > 0 && monthly.ymm - serverCost < 0 ? "text-red-600" : ""}`}>{yen(monthly.ymm)}</td>
                  <td className="text-right text-xs text-black/50">1,000円で {yen(per1000.ymm)}</td>
                </tr>
                <tr className="border-t border-black/5">
                  <th className="text-left font-bold text-black/50 py-1.5">決済手数料</th>
                  <td className="text-right">{yen(monthly.fee)}</td>
                  <td className="text-right text-xs text-black/50">1,000円で {yen(per1000.fee)}</td>
                </tr>
              </tbody>
            </table>
            {r.fee >= r.ymm && <p className="text-xs text-red-600">手数料が YMM の取り分以上なので、パートナーと YMM には何も残りません。</p>}
          </div>

          <div className="space-y-2">
            <button
              className="w-full rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-40"
              onClick={save}
              disabled={busy || !changed}
            >
              {changed ? "この分け方を保存する（これからの注文に使う）" : "いま保存されている分け方です"}
            </button>
            {msg && <p className="rounded-xl bg-leaf/10 text-leaf p-3 text-sm">{msg}</p>}
          </div>
        </>
      )}
    </section>
  );
}
