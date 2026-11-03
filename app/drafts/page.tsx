"use client";

// 画面2：店主の確認
//   ・「このお店について」（お店のヒアリングから）：公開OK／手で直す／AIに直してもらう
//   ・商品ページの下書き（1商品＝1件）：このまま公開／手で直す／AIに直してもらう／却下
//     手で直したときは、文はそのままにして法律チェックだけやり直す
import { useEffect, useState } from "react";
import { LegalPanel, type Legal } from "@/components/LegalPanel";
import { DraftFieldsForm, TodoNoteButton } from "@/components/DraftFieldsForm";

type ShopIntro = { id: number; name: string; philosophy_text: string; philosophy_status: "draft" | "approved" };

type Draft = {
  id: number;
  shop_name: string;
  name: string;
  description: string;
  price_yen: number;
  recommend_reason: string;
  target_customer: string;
  status: "draft" | "published" | "rejected";
  revision_note: string;
  legal_json: string | null;
  photos: string[];
};

const STATUS_LABEL = {
  draft: { text: "確認待ち", cls: "bg-carrot/15 text-carrot" },
  published: { text: "公開中", cls: "bg-leaf/15 text-leaf" },
  rejected: { text: "却下", cls: "bg-black/10 text-black/50" },
};
async function post(url: string, body: unknown): Promise<string> {
  const r = await fetch(url, { method: "POST", body: JSON.stringify(body) });
  const j = await r.json();
  return r.ok ? "" : (j.error ?? "うまくいきませんでした");
}

export default function DraftsPage() {
  const [data, setData] = useState<{ shops: ShopIntro[]; drafts: Draft[] } | null>(null);

  async function load() {
    const r = await fetch("/api/drafts");
    setData(await r.json());
  }

  useEffect(() => {
    fetch("/api/drafts")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (data === null) return <p className="text-black/50">読み込み中…</p>;
  const pendingShops = data.shops.filter((s) => s.philosophy_status === "draft");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">店主さんの確認</h1>
      {pendingShops.map((s) => (
        <ShopIntroCard key={`${s.id}-${s.philosophy_text.length}`} s={s} onChanged={load} />
      ))}
      {data.drafts.length === 0 && pendingShops.length === 0 && (
        <p className="text-black/60">まだ確認するものはありません。パートナーがヒアリングを送ると、ここに届きます。</p>
      )}
      {data.drafts.map((d) => (
        <DraftCard key={`${d.id}-${d.revision_note}-${d.name}-${d.price_yen}`} d={d} onChanged={load} />
      ))}
    </div>
  );
}

// ---------- このお店について ----------

function ShopIntroCard({ s, onChanged }: { s: ShopIntro; onChanged: () => void }) {
  const [mode, setMode] = useState<"" | "edit" | "revise">("");
  const [text, setText] = useState(s.philosophy_text);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "approve" | "edit" | "revise") {
    setError("");
    setBusy(true);
    const err = await post(`/api/shops/${s.id}/about/review`, { action, text, note });
    setBusy(false);
    if (err) return setError(err);
    setMode("");
    setNote("");
    onChanged();
  }

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm border-2 border-leaf/30 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-leaf">このお店について（{s.name}）</span>
        <span className="rounded-full px-2 py-0.5 font-bold bg-carrot/15 text-carrot">確認待ち</span>
      </div>
      {mode === "edit" ? (
        <textarea className="w-full min-h-48 rounded-xl border border-black/15 p-3 text-base leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="leading-relaxed whitespace-pre-wrap">{s.philosophy_text}</p>
      )}
      <p className="text-xs text-black/50">公開OKにすると、このお店の商品ページの下に表示されます。</p>

      {mode === "" && (
        <div className="grid grid-cols-3 gap-2">
          <button className="rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-50" disabled={busy} onClick={() => act("approve")}>
            公開OK
          </button>
          <button className="rounded-xl border-2 border-leaf text-leaf py-3 font-bold" onClick={() => setMode("edit")}>
            手で直す
          </button>
          <button className="rounded-xl border-2 border-carrot text-carrot py-3 font-bold text-sm" onClick={() => setMode("revise")}>
            AIに直してもらう
          </button>
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
          <textarea className="w-full min-h-20 rounded-xl border border-black/15 p-3 text-base" placeholder="例：もっと素朴な感じに。祖母の代からの話を入れて。" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-carrot text-white py-3 font-bold disabled:opacity-50" disabled={busy || !note.trim()} onClick={() => act("revise")}>
              {busy ? "Claude が書き直しています…" : "この内容で書き直す"}
            </button>
            <button className="rounded-xl border border-black/15 px-4" disabled={busy} onClick={() => setMode("")}>
              やめる
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </article>
  );
}

// ---------- 商品の下書き ----------

function DraftCard({ d, onChanged }: { d: Draft; onChanged: () => void }) {
  const [mode, setMode] = useState<"" | "edit" | "revise">("");
  const [fields, setFields] = useState({
    name: d.name,
    description: d.description,
    price_yen: String(d.price_yen),
    recommend_reason: d.recommend_reason,
    target_customer: d.target_customer,
  });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const st = STATUS_LABEL[d.status];
  const legal = d.legal_json ? (JSON.parse(d.legal_json) as Legal) : null;
  const blocked = legal?.verdict === "このままでは販売できない";

  async function act(action: "publish" | "reject" | "revise" | "edit") {
    setError("");
    setBusy(true);
    const err = await post(`/api/drafts/${d.id}`, { action, note, fields: { ...fields, price_yen: Number(fields.price_yen) } });
    setBusy(false);
    if (err) return setError(err);
    setMode("");
    setNote("");
    onChanged();
  }

  return (
    <article className={`rounded-2xl bg-white p-5 shadow-sm border border-black/5 space-y-3 ${d.status === "rejected" ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-black/50">{d.shop_name}</span>
        <span className={`rounded-full px-2 py-0.5 font-bold ${st.cls}`}>{st.text}</span>
      </div>

      {d.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
          {d.photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={`商品の写真 ${i + 1}`} className={`h-28 rounded-xl object-cover ${i === 0 ? "w-28" : "w-20"}`} />
          ))}
        </div>
      )}

      {mode === "edit" ? (
        <div className="space-y-2">
          <DraftFieldsForm f={fields} setF={setFields} legal={legal} />
          <p className="text-xs text-black/50">保存すると、直した文のまま、法律チェックだけ Claude がやり直します。</p>
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-50" disabled={busy} onClick={() => act("edit")}>
              {busy ? "法律チェックをやり直しています…" : "保存して、法律チェック"}
            </button>
            <button className="rounded-xl border border-black/15 px-4" disabled={busy} onClick={() => setMode("")}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold leading-snug">{d.name}</h2>
          <div className="text-2xl font-bold text-carrot">
            {d.price_yen.toLocaleString()}
            <span className="text-sm text-black/60 font-normal"> 円（税込）</span>
          </div>
          <p className="leading-relaxed whitespace-pre-wrap">{d.description}</p>
          <dl className="grid gap-2 text-sm">
            <div className="rounded-xl bg-leaf/5 p-3">
              <dt className="font-bold text-leaf">おすすめ理由</dt>
              <dd>{d.recommend_reason}</dd>
            </div>
            <div className="rounded-xl bg-carrot/5 p-3">
              <dt className="font-bold text-carrot">こんな方に</dt>
              <dd>{d.target_customer}</dd>
            </div>
          </dl>
        </>
      )}

      {legal && mode !== "edit" && <LegalPanel legal={legal} />}

      {d.status === "published" && (
        <a href={`/p/${d.id}`} className="block rounded-xl border border-leaf/30 bg-leaf/5 p-3 text-sm text-leaf font-bold">
          公開ページを開く →
        </a>
      )}
      {d.revision_note && <p className="text-xs text-black/50">前回の修正：{d.revision_note}</p>}

      {d.status === "draft" && mode === "" && (
        <>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button className="rounded-xl bg-leaf text-white py-3 font-bold disabled:opacity-30" disabled={busy || blocked} onClick={() => act("publish")}>
              このまま公開
            </button>
            <button className="rounded-xl border-2 border-leaf text-leaf py-3 font-bold" onClick={() => setMode("edit")}>
              手で直す
            </button>
            <button className="rounded-xl border-2 border-carrot text-carrot py-3 font-bold" onClick={() => setMode("revise")}>
              AIに直してもらう
            </button>
            <button className="rounded-xl border border-black/20 text-black/60 py-3 disabled:opacity-50" disabled={busy} onClick={() => act("reject")}>
              却下
            </button>
          </div>
          {blocked && <p className="text-xs text-red-600">このままでは販売できないため、公開できません。直してから、もう一度確かめてください。</p>}
        </>
      )}

      {mode === "revise" && (
        <div className="space-y-2">
          <TodoNoteButton legal={legal} setNote={setNote} />
          <textarea
            className="w-full min-h-24 rounded-xl border border-black/15 p-3 text-base"
            placeholder="例：値段は1,200円にして。もっと素朴な感じに。"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="flex-1 rounded-xl bg-carrot text-white py-3 font-bold disabled:opacity-50" disabled={busy || !note.trim()} onClick={() => act("revise")}>
              {busy ? "Claude が作り直して、法律も確かめ直しています…" : "この内容で作り直す"}
            </button>
            <button className="rounded-xl border border-black/15 px-4" disabled={busy} onClick={() => setMode("")}>
              やめる
            </button>
          </div>
        </div>
      )}

      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
    </article>
  );
}
