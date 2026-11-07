// 事前調査（2026-11-05 きよさん）
//   パートナーが訪問の予定日を入れて登録した事業者を、事務局（YMM 管理）がローカルの Claude Code で先に調べる。
//   GET  … 調べてほしい事業者の一覧（依頼のファイル）
//   POST … 調べた結果（ファイル）を取り込む。取り込んだ事業者は、当日 Claude（API）を呼ばずに始められる
//   手順書：docs/事務局_事前調査.md
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { OFFICIAL_DOMAINS, ShopQuestionsSchema } from "@/lib/claude";
import { nextCheckOf } from "@/lib/research";

export async function GET() {
  await connection();
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  const requests = getDb()
    .prepare(
      `SELECT s.id, s.name, s.category, s.area, s.prefecture, s.visit_on, s.website_url, u.name AS partner_name
       FROM shops s LEFT JOIN users u ON u.id = s.partner_id
       WHERE s.visit_on IS NOT NULL AND s.prep_at IS NULL ORDER BY s.visit_on, s.id`,
    )
    .all();
  return Response.json({ kind: "yaobiz-prep-request", made_at: new Date().toISOString(), requests });
}

const ResultSchema = z.object({
  kind: z.literal("yaobiz-prep-result"),
  results: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      website_url: z.string().nullable().optional(),
      website_notes: z.string().nullable().optional(),
      legal_research: z.object({ notes: z.string().min(1), sources: z.array(z.object({ url: z.string(), title: z.string() })) }),
      questions: ShopQuestionsSchema.shape.questions.min(1),
    }),
  ),
});

// 国の公式サイトだけを根拠に残す（事業者さんに見せる出典なので、ほかのサイトが紛れ込まないように）
function official(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return OFFICIAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (a instanceof Response) return a;
  const parsed = ResultSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: `ファイルの形が違います（${parsed.error.issues[0]?.path.join(".") || ""} ${parsed.error.issues[0]?.message ?? ""}）。手順書のとおりに作り直してください。` }, { status: 400 });
  }
  const db = getDb();
  const done: string[] = [];
  const skipped: string[] = [];
  for (const r of parsed.data.results) {
    const shop = db.prepare("SELECT id, name FROM shops WHERE id = ?").get(r.id) as { id: number; name: string } | undefined;
    // 番号と事業者名の両方が合うときだけ取り込む（別の事業者さんに入れてしまわないように）
    if (!shop || shop.name !== r.name) {
      skipped.push(`${r.id} ${r.name}（番号と事業者名が合いません）`);
      continue;
    }
    const sources = r.legal_research.sources.filter((s) => official(s.url));
    if (sources.length === 0) {
      skipped.push(`${r.name}（法律の調査に国の公式サイトの出典がありません）`);
      continue;
    }
    let site = r.website_url?.trim() || null;
    if (site) {
      try {
        site = new URL(site).toString();
      } catch {
        site = null;
      }
    }
    const notes = site ? r.website_notes?.trim() || null : null;
    db.prepare(
      `UPDATE shops SET website_url = COALESCE(?, website_url), website_notes = COALESCE(?, website_notes),
         legal_research = ?, legal_researched_at = datetime('now', 'localtime'), law_next_check = ?, law_from_shop = NULL,
         prep_questions = ?, prep_at = datetime('now', 'localtime') WHERE id = ?`,
    ).run(site, notes, JSON.stringify({ notes: r.legal_research.notes, sources }), nextCheckOf(r.legal_research.notes), JSON.stringify(r.questions), shop.id);
    done.push(shop.name);
  }
  return Response.json({ ok: true, done, skipped });
}
