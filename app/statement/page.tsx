"use client";

// 画面3：成果明細（パートナー・YMM 用）
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
};
type Totals = { count: number; amount: number; owner: number; partner: number; ymm: number; fee: number };
type Settings = { ymm_rate: number; partner_share: number; stripe_fee_rate: number };
type Data = { orders: Order[]; totals: Totals; byShop: { shop_name: string; count: number; amount: number; owner: number }[]; settings: Settings };

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
                <span>{o.shop_name}</span>
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

      <Simulator settings={data.settings} onSaved={load} />
    </div>
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
