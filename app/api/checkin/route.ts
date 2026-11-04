import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { makeMonthQuestions, readCheckin } from "@/lib/claude";
import { CARE_QUESTIONS, thisMonth } from "@/lib/checkin";

type MonthQ = { text: string; hint: string };

declare global {
  var __yaobizMonthQ: Map<string, Promise<MonthQ[]>> | undefined;
}
const making = (globalThis.__yaobizMonthQ ??= new Map());

// その月の事業の問い（3問）。なければ Claude に作ってもらう（同時に開いても1回だけ作る）
function monthQuestions(month: string): Promise<MonthQ[]> {
  const db = getDb();
  const row = db.prepare("SELECT questions_json FROM checkin_months WHERE month = ?").get(month) as { questions_json: string } | undefined;
  if (row) return Promise.resolve(JSON.parse(row.questions_json));
  const inFlight = making.get(month);
  if (inFlight) return inFlight;
  const previous = (db.prepare("SELECT questions_json FROM checkin_months ORDER BY month DESC LIMIT 3").all() as { questions_json: string }[]).flatMap(
    (r) => (JSON.parse(r.questions_json) as MonthQ[]).map((q) => q.text),
  );
  const voices = (db.prepare("SELECT title FROM voices WHERE substr(created_at, 1, 7) = ? ORDER BY id DESC LIMIT 10").all(month) as { title: string }[]).map((v) => v.title);
  const p = makeMonthQuestions(month, previous, voices)
    .then((r) => {
      const qs = r.questions.slice(0, 3);
      db.prepare("INSERT OR IGNORE INTO checkin_months (month, questions_json) VALUES (?, ?)").run(month, JSON.stringify(qs));
      return qs;
    })
    .finally(() => making.delete(month));
  making.set(month, p);
  return p;
}

// 月1のふり返り
//   パートナー：今月の問いと、自分の答え・返事
//   YMM 管理（山﨑さん）：みんなの今月の様子（気にかけたい人が上）。答えは本人と山﨑さんだけが読む
export async function GET(req: Request) {
  await connection();
  const u = await requireUser();
  if (u instanceof Response) return u;
  const db = getDb();
  const month = new URL(req.url).searchParams.get("month")?.match(/^\d{4}-\d{2}$/)?.[0] ?? thisMonth();
  let questions: MonthQ[];
  try {
    questions = await monthQuestions(month);
  } catch (e) {
    console.error(e);
    return Response.json({ error: "今月の問いを作れませんでした。少しして開き直してください。" }, { status: 500 });
  }
  const mine = db.prepare("SELECT answers_json, reply, created_at FROM checkins WHERE user_id = ? AND month = ?").get(u.id, month) as
    | { answers_json: string; reply: string; created_at: string }
    | undefined;
  const base = { month, questions, care: CARE_QUESTIONS, mine: mine ? { answers: JSON.parse(mine.answers_json), reply: mine.reply, created_at: mine.created_at } : null, role: u.role };
  if (u.role !== "admin") return Response.json(base);

  const ORDER = { 早めに話す: 0, 気にかける: 1, 元気: 2 } as Record<string, number>;
  const people = (
    db
      .prepare(
        `SELECT us.id, us.name, c.answers_json, c.care_level, c.care_summary, c.talk_points, c.created_at
         FROM users us LEFT JOIN checkins c ON c.user_id = us.id AND c.month = ?
         WHERE us.role = 'partner' AND us.active = 1 ORDER BY us.id`,
      )
      .all(month) as { id: number; name: string; answers_json: string | null; care_level: string | null; care_summary: string | null; talk_points: string | null; created_at: string | null }[]
  )
    .map((p) => ({ ...p, answers: p.answers_json ? JSON.parse(p.answers_json) : null, talk_points: p.talk_points ? JSON.parse(p.talk_points) : [], answers_json: undefined }))
    .sort((a, b) => (a.care_level ? ORDER[a.care_level] : 3) - (b.care_level ? ORDER[b.care_level] : 3));
  // 先月からの気持ちの点数の動き（下がっている人に気づけるように）
  const prev = new Date(`${month}-15T00:00:00Z`);
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const pm = prev.toISOString().slice(0, 7);
  const before = Object.fromEntries(
    (db.prepare("SELECT user_id, answers_json FROM checkins WHERE month = ?").all(pm) as { user_id: number; answers_json: string }[]).map((r) => [r.user_id, JSON.parse(r.answers_json).mood ?? null]),
  );
  return Response.json({ ...base, people: people.map((p) => ({ ...p, mood_before: before[p.id] ?? null })) });
}

export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const month = thisMonth();
  const b = (await req.json().catch(() => ({}))) as { answers?: Record<string, unknown> };
  const a = b.answers ?? {};
  const questions = await monthQuestions(month).catch(() => null);
  if (!questions) return Response.json({ error: "今月の問いを読めませんでした" }, { status: 500 });

  // 答えをそろえる（q1〜q3 は事業の問い、そのほかは気持ちのたしかめ）
  const answers: Record<string, string | number> = {};
  const qa: { q: string; a: string }[] = [];
  questions.forEach((q, i) => {
    const v = String(a[`q${i + 1}`] ?? "").trim().slice(0, 1500);
    answers[`q${i + 1}`] = v;
    qa.push({ q: q.text, a: v });
  });
  for (const c of CARE_QUESTIONS) {
    if (c.type === "scale") {
      const n = Math.floor(Number(a[c.id]));
      if (!(n >= 1 && n <= c.labels.length)) return Response.json({ error: `「${c.text}」を選んでください` }, { status: 400 });
      answers[c.id] = n;
      qa.push({ q: c.text, a: `${n}（${c.labels.length}段階：${c.labels[n - 1]}）` });
    } else {
      const v = String(a[c.id] ?? "").trim().slice(0, 1500);
      answers[c.id] = v;
      qa.push({ q: c.text, a: v });
    }
  }
  if (!questions.some((_, i) => answers[`q${i + 1}`])) return Response.json({ error: "事業についての問いに、1つは答えてください" }, { status: 400 });
  try {
    const r = await readCheckin(u.name, qa);
    getDb()
      .prepare(
        `INSERT INTO checkins (user_id, month, answers_json, reply, care_level, care_summary, talk_points) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, month) DO UPDATE SET answers_json = excluded.answers_json, reply = excluded.reply, care_level = excluded.care_level,
           care_summary = excluded.care_summary, talk_points = excluded.talk_points, created_at = datetime('now', 'localtime')`,
      )
      .run(u.id, month, JSON.stringify(answers), r.reply, r.care_level, r.care_summary, JSON.stringify(r.talk_points));
    return Response.json({ ok: true, reply: r.reply });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "送れませんでした" }, { status: 500 });
  }
}
