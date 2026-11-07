"use client";

// 送り方：大きさを絵で選んで、重さを入れるだけ。いちばん安い送り方と「送料込みの値段」を自動で出す
//   （2026-11-04 物流の社長さんの助言：大きさと重さが大事・安い配達会社を自動で選ぶ・距離で料金を変える）
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { BUNDLE_MAX, parseBundles } from "@/lib/bundles";
import { PER_BOX_MAX, RATES_AS_OF, SIZE_CLASSES, cheapest, prefOf, quotesByPref, fullPref } from "@/lib/shipping";

type Props = {
  draftId: number;
  price: number;
  initial: { size_class: string | null; weight_g: number | null; per_box: number; bundles_json?: string | null };
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
  // まとめ買いの値段「○個で○円」（2026-11-07 きよさん）。文字のまま持ち、保存のときに数にする
  const initialRows = (() => {
    const b = parseBundles(initial.bundles_json).map((x) => ({ qty: String(x.qty), price: String(x.price_yen) }));
    while (b.length < BUNDLE_MAX) b.push({ qty: "", price: "" });
    return b;
  })();
  const [rows, setRows] = useState(initialRows);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const from = prefOf(shopPrefecture);
  const w = Number(weight);
  const quotes = from && size && w > 0 ? quotesByPref(size, w, from, { onlineLabel }) : null;
  const near = from && size && w > 0 ? cheapest(size, w, from, from, { onlineLabel }) : null;
  const yens = quotes ? Object.values(quotes).map((q) => q.yen) : [];
  const rowsChanged = JSON.stringify(rows) !== JSON.stringify(initialRows);
  const changed = size !== (initial.size_class ?? "") || weight !== (initial.weight_g ? String(initial.weight_g) : "") || perBox !== (initial.per_box || 1) || rowsChanged;

  async function save() {
    setError("");
    setBusy(true);
    const r = await apiFetch(`/api/drafts/${draftId}/package`, { method: "POST", body: JSON.stringify({ size_class: size, weight_g: w, per_box: perBox, bundles: rows.map((r) => ({ qty: Number(r.qty), price_yen: Number(r.price) })) }) });
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
        <div className="text-sm font-bold">1つの箱（袋）に、いくつまで入りますか？</div>
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
        <p className="text-xs text-black/50">2つ以上入るなら、まとめて買った人は、その数までは送料1回分で届きます。</p>
      </div>

      {/* まとめ買いの値段（2026-11-07 きよさん：150円のような商品は「何個でいくら」の需要がある。送料1回分と合わせてお得に） */}
      <div className="space-y-1">
        <div className="text-sm font-bold">まとめ買いの値段（決めるなら）</div>
        <p className="text-xs text-black/50">「○個で○円」を事業者さんが決めます。お客さまは「1個ずつ」か「○個セット」を選べます。送料は1回分なので、セットはお得に見えます。</p>
        {rows.map((r, i) => {
          const q = Number(r.qty);
          const pr = Number(r.price);
          const okRow = q >= 2 && pr >= 1;
          const boxes = Math.ceil(q / Math.max(1, perBox));
          return (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-1 text-sm">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="個数"
                  value={r.qty}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))}
                  className="w-16 h-11 rounded-xl border border-black/15 text-center text-base"
                />
                <span>個で</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="値段"
                  value={r.price}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/\D/g, "") } : x)))}
                  className="w-24 h-11 rounded-xl border border-black/15 text-center text-base"
                />
                <span>円</span>
                {okRow && <span className="text-xs text-black/50">（1個 {Math.round(pr / q).toLocaleString()}円）</span>}
              </div>
              {okRow && pr > price * q && <div className="text-xs text-red-600">1個ずつ買う（{(price * q).toLocaleString()}円）より高くなっています</div>}
              {okRow && near && (
                <div className="text-xs text-black/60">
                  {fullPref(from!)}内なら 送料込み <b>{(pr + near.yen * boxes).toLocaleString()}円</b>（1個あたり {Math.round((pr + near.yen * boxes) / q).toLocaleString()}円。1個ずつだと {(price + near.yen).toLocaleString()}円）
                  {boxes > 1 && <span className="text-amber-700">　箱が{boxes}つになり、送料も{boxes}回分です</span>}
                </div>
              )}
            </div>
          );
        })}
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
            {fullPref(from)}内なら <b className="text-carrot text-lg">送料込み {(price + near.yen).toLocaleString()}円</b>（商品 {price.toLocaleString()}円＋送料 {near.yen.toLocaleString()}円）
          </div>
          {perBox > 1 && (
            <div className="text-xs">
              {perBox}個まとめて買うと、{fullPref(from)}内なら <b>送料込み {(price * perBox + near.yen).toLocaleString()}円</b>（商品 {(price * perBox).toLocaleString()}円＋送料は1回分 {near.yen.toLocaleString()}円）。{perBox + 1}個からは箱が2つになり、送料も2回分です。
            </div>
          )}
          {Math.min(...yens) !== Math.max(...yens) && (
            <div className="text-xs text-black/60">
              全国では {(price + Math.min(...yens)).toLocaleString()}〜{(price + Math.max(...yens)).toLocaleString()}円（遠いほど送料が高くなります）
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
