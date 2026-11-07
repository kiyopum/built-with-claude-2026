"use client";

// 送り方：大きさを絵で選んで、重さを入れるだけ。いちばん安い送り方と「送料込みの値段」を自動で出す
//   （2026-11-04 物流の社長さんの助言：大きさと重さが大事・安い配達会社を自動で選ぶ・距離で料金を変える）
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { PER_BOX_MAX, RATES_AS_OF, SIZE_CLASSES, cheapest, prefOf, quotesByPref, fullPref } from "@/lib/shipping";

type Props = {
  draftId: number;
  price: number;
  initial: { size_class: string | null; weight_g: number | null; per_box: number };
  shopPrefecture: string | null;
  shopFlatYen: number | null;
  onlineLabel: boolean;
  onSaved: () => void;
};

export function PackageCard({ draftId, price, initial, shopPrefecture, shopFlatYen, onlineLabel, onSaved }: Props) {
  const [size, setSize] = useState(initial.size_class ?? "");
  const [weight, setWeight] = useState(initial.weight_g ? String(initial.weight_g) : "");
  const [perBox, setPerBox] = useState(initial.per_box || 1);
  const [custom, setCustom] = useState((initial.per_box || 1) > 5 ? String(initial.per_box) : ""); // 6個以上の欄の文字
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const from = prefOf(shopPrefecture);
  const w = Number(weight);
  const quotes = from && size && w > 0 ? quotesByPref(size, w, from, { onlineLabel }) : null;
  const near = from && size && w > 0 ? cheapest(size, w, from, from, { onlineLabel }) : null;
  const yens = quotes ? Object.values(quotes).map((q) => q.yen) : [];
  const changed = size !== (initial.size_class ?? "") || weight !== (initial.weight_g ? String(initial.weight_g) : "") || perBox !== (initial.per_box || 1);

  async function save() {
    setError("");
    setBusy(true);
    const r = await apiFetch(`/api/drafts/${draftId}/package`, { method: "POST", body: JSON.stringify({ size_class: size, weight_g: w, per_box: perBox }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error);
    setSaved(true);
    onSaved();
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
      <div className="text-sm font-bold text-leaf">送り方（大きさと重さ）</div>
      <p className="text-xs text-black/60">箱や袋に入れたときの大きさを選んでください。いちばん安い送り方を自動で選び、「送料込み」の値段にします。</p>
      <div className="grid grid-cols-3 gap-2">
        {SIZE_CLASSES.map((s) => (
          <button
            key={s.key}
            onClick={() => (setSize(s.key), setSaved(false))}
            className={`rounded-xl border-2 p-2 text-left active:scale-[0.98] ${size === s.key ? "border-carrot bg-carrot/5" : "border-black/10 bg-white"}`}
          >
            <div className="text-2xl">{s.emoji}</div>
            <div className="text-sm font-bold leading-tight">{s.label}</div>
            <div className="text-[10px] text-black/50 leading-tight mt-0.5">{s.hint}</div>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <span className="text-sm font-bold shrink-0">重さ</span>
        <input
          className="w-28 rounded-xl border border-black/15 p-3 text-base text-right"
          inputMode="numeric"
          placeholder="例：150"
          value={weight}
          onChange={(e) => (setWeight(e.target.value.replace(/[^\d]/g, "")), setSaved(false))}
        />
        <span className="text-sm">g（袋や箱ごと量る）</span>
      </label>
      <div className="space-y-1">
        <div className="text-sm font-bold">1つの箱（袋）に、いくつ入れて送りますか？</div>
        <div className="flex gap-2 items-center flex-wrap">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => {
                setPerBox(n);
                setCustom("");
                setSaved(false);
              }}
              className={`w-12 h-12 rounded-xl border-2 text-lg font-bold ${perBox === n && !custom ? "border-carrot bg-carrot/5 text-carrot" : "border-black/10"}`}
            >
              {n}
            </button>
          ))}
          {/* 6個以上（クッキー20枚など）は数字で入れる。2026-11-07 きよさん。
              入れている途中の文字（"2" など）はそのまま欄に残す（前は 5 以下だと欄が空に戻り、"20" が打てなかった） */}
          <label className="flex items-center gap-1 text-sm">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              placeholder="6〜"
              value={custom}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                setCustom(v);
                const n = Number(v);
                if (v && n >= 1 && n <= PER_BOX_MAX) {
                  setPerBox(n);
                  setSaved(false);
                }
              }}
              className={`w-20 h-12 rounded-xl border-2 text-lg font-bold text-center ${custom && perBox === Number(custom) ? "border-carrot bg-carrot/5 text-carrot" : "border-black/10"}`}
            />
            <span className="text-black/60">個</span>
          </label>
        </div>
        <p className="text-xs text-black/50">お客さまには、この数をひとまとめにした「送料込み」の値段で出ます。1個の値段が安い商品は、数を多くすると送料が目立ちません（150円 × 20個＋送料 600円 → 「20個入り 送料込み 3,600円」）。</p>
      </div>

      {!from ? (
        <p className="rounded-xl bg-amber-50 text-amber-800 p-3 text-sm">
          先に、事業者のページの「送料」で<b>送り出す都道府県</b>を選んでください。選ぶと、ここに送料込みの値段が出ます。
          {shopFlatYen != null && "（それまでは、事業者の全国一律の送料で売ります）"}
        </p>
      ) : size && w > 0 && !quotes ? (
        <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">この大きさ・重さで送れる方法が見つかりません（重すぎるかもしれません。箱は25kgまで）。</p>
      ) : quotes && near ? (
        <div className="rounded-xl bg-leaf/5 p-3 text-sm space-y-1">
          <div>
            いちばん安い送り方：<b>{near.method}</b>
            {near.note && <span className="block text-xs text-black/60">{near.note}</span>}
          </div>
          <div>
            お客さまには：{perBox > 1 && <b>{perBox}個入り </b>}{fullPref(from)}内なら <b className="text-carrot text-lg">送料込み {(price * perBox + near.yen).toLocaleString()}円</b>（商品 {price.toLocaleString()}円{perBox > 1 && ` × ${perBox}個 = ${(price * perBox).toLocaleString()}円`}＋送料 {near.yen.toLocaleString()}円）
          </div>

          {Math.min(...yens) !== Math.max(...yens) && (
            <div className="text-xs text-black/60">
              全国では {(price * perBox + Math.min(...yens)).toLocaleString()}〜{(price * perBox + Math.max(...yens)).toLocaleString()}円（遠いほど送料が高くなります）
            </div>
          )}
          <div className="text-xs text-black/50">送料の分は事業者さんに入ります（決済手数料だけ引かれます）。料金は割引なしの基本の運賃です（{RATES_AS_OF}）。</div>
        </div>
      ) : null}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      <button className="w-full rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-40" disabled={busy || !size || !(w > 0) || !changed} onClick={save}>
        {busy ? "保存しています" : saved && !changed ? "保存しました ✓" : "送り方を保存する"}
      </button>
      <p className="text-xs text-black/50">冷蔵・冷凍で送る商品には、まだ対応していません。</p>
    </section>
  );
}
