"use client";

// 画面1：ヒアリング（パートナー用）
// いまは「文字で入れる」まで。録音ボタン・カメラは次の段階で同じ欄に流し込む。
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Shop = { id: number; name: string; category: string; area: string };
type Question = { question: string; why: string };

export default function HearingPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newShop, setNewShop] = useState({ name: "", category: "", area: "" });
  const [questions, setQuestions] = useState<Question[]>([]);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState<"" | "questions" | "drafts">("");
  const [error, setError] = useState("");

  async function loadShops(selectId?: number) {
    const r = await fetch("/api/shops");
    const j = (await r.json()) as { shops: Shop[] };
    setShops(j.shops);
    if (selectId) setShopId(selectId);
  }

  useEffect(() => {
    fetch("/api/shops")
      .then((r) => r.json())
      .then((j: { shops: Shop[] }) => {
        setShops(j.shops);
        if (j.shops.length) setShopId(j.shops[0].id);
      });
  }, []);

  const shop = shops.find((s) => s.id === shopId);

  async function addShop() {
    setError("");
    const r = await fetch("/api/shops", { method: "POST", body: JSON.stringify(newShop) });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setAdding(false);
    setNewShop({ name: "", category: "", area: "" });
    setQuestions([]);
    await loadShops(j.id);
  }

  async function makeQuestions() {
    if (!shopId) return;
    setError("");
    setBusy("questions");
    const r = await fetch("/api/questions", { method: "POST", body: JSON.stringify({ shopId }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    setQuestions(j.questions);
  }

  async function send() {
    if (!shopId) return;
    setError("");
    setBusy("drafts");
    const r = await fetch("/api/hearings", { method: "POST", body: JSON.stringify({ shopId, transcript }) });
    const j = await r.json();
    setBusy("");
    if (!r.ok) return setError(j.error);
    router.push("/drafts");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">ヒアリング</h1>

      {/* 1) 訪問先の店 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">1) 訪問先のお店</div>
        {!adding ? (
          <>
            <select
              className="w-full rounded-xl border border-black/15 p-3 text-base bg-white"
              value={shopId ?? ""}
              onChange={(e) => {
                setShopId(Number(e.target.value));
                setQuestions([]);
              }}
            >
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {shop && <p className="text-sm text-black/60">{shop.category}</p>}
            <button className="text-sm text-leaf underline" onClick={() => setAdding(true)}>
              ＋ 新しいお店を登録する
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <input
              className="w-full rounded-xl border border-black/15 p-3 text-base"
              placeholder="店名"
              value={newShop.name}
              onChange={(e) => setNewShop({ ...newShop, name: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-black/15 p-3 text-base"
              placeholder="業種（例：手作り味噌と漬物の店）"
              value={newShop.category}
              onChange={(e) => setNewShop({ ...newShop, category: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-black/15 p-3 text-base"
              placeholder="地域（なくても可）"
              value={newShop.area}
              onChange={(e) => setNewShop({ ...newShop, area: e.target.value })}
            />
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl bg-leaf text-white py-3 font-bold" onClick={addShop}>
                登録する
              </button>
              <button className="rounded-xl border border-black/15 px-4" onClick={() => setAdding(false)}>
                やめる
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 2) 質問リスト */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">2) 聞くことリスト</div>
        {questions.length === 0 ? (
          <button
            className="w-full rounded-xl border-2 border-leaf text-leaf py-3 font-bold disabled:opacity-50"
            onClick={makeQuestions}
            disabled={!shopId || busy !== ""}
          >
            {busy === "questions" ? "Claude が質問を考えています…" : "このお店向けの質問を Claude に作ってもらう"}
          </button>
        ) : (
          <ol className="space-y-3">
            {questions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-leaf/10 text-leaf text-sm font-bold grid place-items-center">
                  {i + 1}
                </span>
                <div>
                  <div className="font-medium">{q.question}</div>
                  <div className="text-xs text-black/50">{q.why}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 3) 聞いた内容 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3">
        <div className="text-sm font-bold text-leaf">3) 聞いた内容</div>
        <textarea
          className="w-full min-h-56 rounded-xl border border-black/15 p-3 text-base leading-relaxed"
          placeholder="店主さんのお話をここに入れます（録音ボタンは次の版で付きます）"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </section>

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}

      <button
        className="w-full rounded-2xl bg-carrot text-white py-4 text-lg font-bold disabled:opacity-50"
        onClick={send}
        disabled={!shopId || !transcript.trim() || busy !== ""}
      >
        {busy === "drafts" ? "Claude が商品ページを作っています…（30秒ほど）" : "送信して商品の下書きを作る"}
      </button>
    </div>
  );
}
