import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { makeCareerNote } from "@/lib/claude";
import { thisMonth } from "@/lib/checkin";

// わたしの歩み：順位や売上は出さず、してきたことの数だけを見せる（本人と YMM 管理だけ）
//   お休み：今月お休みにする／やめる（翌月には自然に戻る）
function factsOf(userId: number) {
  const db = getDb();
  const n = (sql: string, ...a: (number | string)[]) => (db.prepare(sql).get(...a) as { n: number }).n;
  const my = "(SELECT id FROM shops WHERE partner_id = ?)";
  return {
    shops: n(`SELECT COUNT(*) AS n FROM shops WHERE partner_id = ?`, userId),
    heard_shops: n(`SELECT COUNT(*) AS n FROM shops WHERE partner_id = ? AND (length(COALESCE(philosophy_transcript,'')) > 0 OR length(COALESCE(website_notes,'')) > 0)`, userId),
    hearings: n(`SELECT COUNT(*) AS n FROM hearings WHERE shop_id IN ${my} AND length(transcript) > 0`, userId),
    drafts: n(`SELECT COUNT(*) AS n FROM drafts WHERE shop_id IN ${my}`, userId),
    published: n(`SELECT COUNT(*) AS n FROM drafts WHERE shop_id IN ${my} AND status = 'published'`, userId),
    legal: n(`SELECT COUNT(*) AS n FROM drafts WHERE shop_id IN ${my} AND legal_json IS NOT NULL`, userId),
    sns: n(`SELECT COUNT(*) AS n FROM drafts WHERE shop_id IN ${my} AND sns_json IS NOT NULL`, userId),
    voices: n(`SELECT COUNT(*) AS n FROM voices WHERE user_id = ? AND via IS NULL`, userId),
    thanks: n(`SELECT COUNT(*) AS n FROM voice_thanks t JOIN voices v ON v.id = t.voice_id WHERE v.user_id = ? AND t.user_id != ?`, userId, userId),
    letters: n(`SELECT COUNT(*) AS n FROM letters WHERE shop_id IN ${my}`, userId),
    referrals: n(`SELECT COUNT(*) AS n FROM orders WHERE referrer_id = ? AND referrer_id IS NOT owner_partner_id`, userId),
    checkins: n(`SELECT COUNT(*) AS n FROM checkins WHERE user_id = ?`, userId),
  };
}
type Facts = ReturnType<typeof factsOf>;
const factText = (f: Facts) =>
  [
    `担当している事業者: ${f.shops}店（そのうち、事業者の考えを聞いたりホームページを読んだりした事業者: ${f.heard_shops}店）`,
    `商品やサービスのお話を聞いた回数: ${f.hearings}回`,
    `商品ページの下書き: ${f.drafts}件（そのうち事業者さんが公開したもの: ${f.published}件）`,
    `表示が法律に合っているかを確かめた商品: ${f.legal}件`,
    `紹介の投稿を作った商品: ${f.sns}件`,
    `事業者さん・お客さまの声をチームに伝えた数: ${f.voices}件（それにチームから届いた「ありがとう」: ${f.thanks}）`,
    `担当の事業者さんに、お客さまから届いたお便り: ${f.letters}通`,
    `ほかの人の事業者の商品を紹介して売れた数: ${f.referrals}件`,
    `月1のふり返りに答えた回数: ${f.checkins}回`,
  ].join("\n");

async function target(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams.get("user");
  if (q && u.role !== "admin" && Number(q) !== u.id) return Response.json({ error: "本人と YMM 管理だけが見られます" }, { status: 403 });
  const id = q ? Number(q) : u.id;
  const row = getDb().prepare("SELECT id, name, role, rest_month, career_json, career_at FROM users WHERE id = ?").get(id) as
    | { id: number; name: string; role: string; rest_month: string | null; career_json: string | null; career_at: string | null }
    | undefined;
  if (!row) return Response.json({ error: "見つかりません" }, { status: 404 });
  return { me: u, row };
}

export async function GET(req: Request) {
  await connection();
  const t = await target(req);
  if (t instanceof Response) return t;
  const { me, row } = t;
  return Response.json({
    name: row.name,
    self: me.id === row.id,
    resting: row.rest_month === thisMonth(),
    month: thisMonth(),
    facts: factsOf(row.id),
    career: row.career_json ? JSON.parse(row.career_json) : null,
    career_at: row.career_at,
  });
}

export async function POST(req: Request) {
  const t = await target(req);
  if (t instanceof Response) return t;
  const { me, row } = t;
  const db = getDb();
  const b = (await req.json().catch(() => ({}))) as { action?: string; on?: boolean };
  if (b.action === "rest") {
    // お休みは本人だけが決める（YMM が勝手に休ませない）
    if (me.id !== row.id) return Response.json({ error: "お休みは本人が決めます" }, { status: 403 });
    db.prepare("UPDATE users SET rest_month = ? WHERE id = ?").run(b.on ? thisMonth() : null, row.id);
    return Response.json({ ok: true });
  }
  if (b.action === "career") {
    try {
      const note = await makeCareerNote(row.name, factText(factsOf(row.id)));
      db.prepare("UPDATE users SET career_json = ?, career_at = datetime('now','localtime') WHERE id = ?").run(JSON.stringify(note), row.id);
      return Response.json({ ok: true });
    } catch (e) {
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "まとめられませんでした" }, { status: 500 });
    }
  }
  return Response.json({ error: "わからない操作です" }, { status: 400 });
}
