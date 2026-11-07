"use client";

// 月1のふり返り（2026-11-05 きよさん）
//   パートナー：事業や理念についての問い3つ＋気持ちのたしかめ。答えは本人と山﨑さんだけが読む
//   YMM 管理（山﨑さん）：みんなの今月の様子と、面談で聞くとよいこと。気にかけたい人が上に出る
import { Suspense, useEffect, useState } from "react";
import { Working } from "@/components/Working";
import { apiFetch } from "@/lib/api";
import type { CareQuestion } from "@/lib/checkin";

type MonthQ = { text: string; hint: string };
type Person = {
  id: number;
  name: string;
  answers: Record<string, string | number> | null;
  care_level: "元気" | "気にかける" | "早めに話す" | null;
  resting?: number;
  care_summary: string | null;
  talk_points: string[];
  created_at: string | null;
  mood_before: number | null;
};
type Data = {
  month: string;
  questions: MonthQ[];
  care: CareQuestion[];
  mine: { answers: Record<string, string | number>; reply: string; created_at: string } | null;
  role: "partner" | "admin";
  people?: Person[];
};

const card = "rounded-2xl bg-white p-4 shadow-sm border border-black/5 space-y-3";
const LEVEL = {
  早めに話す: "bg-red-50 text-red-700 border-red-200",
  気にかける: "bg-amber-50 text-amber-800 border-amber-200",
  元気: "bg-partner/10 text-partner border-partner/20",
};

function CheckinInner() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [a, setA] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const [tab, setTab] = useState<"people" | "me">("people");

  useEffect(() => {
    apiFetch("/api/checkin")
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ ok, j }) => {
        if (!ok) return setError(j.error);
        setData(j);
        if (j.mine) setA(j.mine.answers);
      });
  }, []);

  async function send() {
    setError("");
    setBusy(true);
    const r = await apiFetch("/api/checkin", { method: "POST", body: JSON.stringify({ answers: a }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setError(j.error);
    setData((d) => (d ? { ...d, mine: { answers: a, reply: j.reply, created_at: "" } } : d));
    setEdit(false);
    window.scrollTo({ top: 0 });
  }

  if (error && !data) return <p className="rounded-xl bg-red-50 text-red-700 p-3">{error}</p>;
  if (!data) return <p className="text-black/50"><Working text="今月の問いを用意しています" est={15} /></p>;
  const [y, m] = data.month.split("-");
  const allQ = [...data.questions.map((q, i) => ({ id: `q${i + 1}`, text: q.text })), ...data.care.map((c) => ({ id: c.id, text: c.text }))];

  const form = (
    <div className="space-y-4">
      <section className={card}>
        <div className="text-sm font-bold text-partner">事業について（正解はありません。思ったままで大丈夫です）</div>
        {data.questions.map((q, i) => (
          <label key={i} className="block space-y-1">
            <span className="block font-bold">
              {i + 1}) {q.text}
            </span>
            <span className="block text-xs text-black/50">{q.hint}</span>
            <textarea className="w-full rounded-xl border border-black/15 p-3 text-base min-h-24" value={String(a[`q${i + 1}`] ?? "")} onChange={(e) => setA({ ...a, [`q${i + 1}`]: e.target.value })} />
          </label>
        ))}
      </section>
      <section className={card}>
        <div className="text-sm font-bold text-partner">あなたのこと</div>
        {data.care.map((c) => (
          <div key={c.id} className="space-y-1">
            <div className="font-bold">{c.text}</div>
            {c.type === "scale" ? (
              <div className="grid grid-cols-5 gap-1">
                {c.labels.map((l, i) => (
                  <button key={l} className={`rounded-xl py-2 px-1 text-xs border leading-tight ${a[c.id] === i + 1 ? "bg-partner text-white border-partner font-bold" : "border-black/15"}`} onClick={() => setA({ ...a, [c.id]: i + 1 })}>
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <>
                {c.hint && <div className="text-xs text-black/50">{c.hint}</div>}
                <textarea className="w-full rounded-xl border border-black/15 p-3 text-base min-h-20" value={String(a[c.id] ?? "")} onChange={(e) => setA({ ...a, [c.id]: e.target.value })} />
              </>
            )}
          </div>
        ))}
      </section>
      {error && <p className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
      <button className="w-full rounded-2xl bg-ai text-white py-4 text-lg font-bold disabled:opacity-50" onClick={send} disabled={busy}>
        {busy ? <Working text="Claude が読んでいます" est={15} /> : "送る"}
      </button>
    </div>
  );

  const me = (
    <div className="space-y-4">
      <p className="rounded-xl bg-partner-50 border border-partner-100 p-3 text-sm">🔒 答えは、<b>あなたと山﨑さんだけ</b>が読みます。ほかのパートナーには見えません。月に1回の面談で、ここに書いたことを手がかりにお話しします。</p>
      {data.mine && !edit ? (
        <section className={card}>
          <div className="text-sm font-bold text-partner">今月はもう答えてくれました。ありがとうございます</div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{data.mine.reply}</p>
          <button className="text-sm text-partner underline" onClick={() => setEdit(true)}>
            答え直す（今月のうちなら何度でも）
          </button>
        </section>
      ) : (
        form
      )}
      <p className="text-xs text-black/50">
        つらい気持ちが続くときは、ひとりで抱えずに、山﨑さんや身近な人に話してください。相談できるところは{" "}
        <a className="underline" href="https://www.mhlw.go.jp/mamorouyokokoro/" target="_blank" rel="noreferrer">
          厚生労働省「まもろうよ こころ」
        </a>{" "}
        にもまとまっています。
      </p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">
          月1のふり返り（{y}年{Number(m)}月）
        </h1>
        <p className="text-sm text-black/60">月に1回、事業のことと自分のことを、少しだけ立ち止まって考える時間です。働き方を少しでも良くするために使います。</p>
      </div>
      {data.role === "admin" && (
        <div className="flex gap-2 text-sm">
          <button className={`rounded-full px-3 py-1.5 border ${tab === "people" ? "bg-partner text-white border-partner font-bold" : "border-black/15"}`} onClick={() => setTab("people")}>
            みんなの様子
          </button>
          <button className={`rounded-full px-3 py-1.5 border ${tab === "me" ? "bg-partner text-white border-partner font-bold" : "border-black/15"}`} onClick={() => setTab("me")}>
            自分も答える
          </button>
        </div>
      )}
      {data.role === "admin" && tab === "people" ? <People data={data} allQ={allQ} /> : me}
    </div>
  );
}

// ---------- 山﨑さん向け：みんなの今月の様子 ----------

function People({ data, allQ }: { data: Data; allQ: { id: string; text: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const people = data.people ?? [];
  const done = people.filter((p) => p.care_level).length;
  const moodLabels = (data.care.find((c) => c.id === "mood") as Extract<CareQuestion, { type: "scale" }> | undefined)?.labels ?? [];
  const show = (id: string, v: string | number | undefined) => {
    const c = data.care.find((x) => x.id === id);
    if (c?.type === "scale" && typeof v === "number") return `${v}（${c.labels[v - 1]}）`;
    return v ? String(v) : "（空欄）";
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-black/60">
        今月答えた人 {done} / {people.length}人。気にかけたい人が上に出ます。Claude のまとめは手がかりで、決めつけではありません。最後は、本人と話して確かめてください。
      </p>
      <section className={card}>
        <div className="text-sm font-bold text-partner">今月の問い</div>
        <ol className="text-sm space-y-1">
          {data.questions.map((q, i) => (
            <li key={i}>
              {i + 1}) {q.text}
            </li>
          ))}
        </ol>
      </section>
      {people.length === 0 && <p className="text-sm text-black/60">パートナーがまだいません。</p>}
      {people.map((p) => (
        <section key={p.id} className={`rounded-2xl p-4 border space-y-2 ${p.care_level ? LEVEL[p.care_level] : "bg-white border-black/5"}`}>
          <div className="flex justify-between items-center gap-2">
            <b className="text-black">
              {p.name} さん{p.resting ? <span className="text-xs font-normal">・🌿 今月お休み中</span> : null}
            </b>
            <span className="text-xs font-bold">{p.care_level ?? "まだ答えていません"}</span>
          </div>
          {p.care_level && (
            <>
              {typeof p.answers?.mood === "number" && (
                <div className="text-xs text-black/70">
                  気持ち：{moodLabels[(p.answers.mood as number) - 1]}
                  {p.mood_before != null && p.mood_before !== p.answers.mood && `（先月は「${moodLabels[p.mood_before - 1]}」${p.mood_before > (p.answers.mood as number) ? "→ 下がっています" : "→ 上がっています"}）`}
                </div>
              )}
              <p className="text-sm text-black">{p.care_summary}</p>
              {p.care_level === "早めに話す" && !p.resting && (
                <p className="text-xs text-black/70">面談で「今月はお休みしても大丈夫」と伝えることもできます（本人が「歩み」の画面で押すだけ。担当・取り分はそのまま）。</p>
              )}
              <div className="text-sm text-black">
                <div className="text-xs font-bold">面談で聞いてみるとよいこと</div>
                <ul className="list-disc pl-5">
                  {p.talk_points.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
              <button className="text-xs underline text-black/60" onClick={() => setOpen(open === p.id ? null : p.id)}>
                {open === p.id ? "答えを閉じる" : "本人の答えを読む"}
              </button>
              {open === p.id && (
                <dl className="space-y-2 rounded-xl bg-white p-3 text-sm text-black">
                  {allQ.map((q) => (
                    <div key={q.id}>
                      <dt className="text-xs text-black/50">{q.text}</dt>
                      <dd className="whitespace-pre-wrap">{show(q.id, p.answers?.[q.id])}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </section>
      ))}
    </div>
  );
}

export default function CheckinPage() {
  return (
    <Suspense fallback={<p className="text-black/50">読み込み中…</p>}>
      <CheckinInner />
    </Suspense>
  );
}
