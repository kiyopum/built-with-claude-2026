import { connection } from "next/server";
import { getDb, type Shop } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { thisMonth } from "@/lib/checkin";

// パートナーが担当する事業者の一覧（管理者は全部）
export async function GET() {
  await connection();
  const u = await requireUser();
  if (u instanceof Response) return u;
  const db = getDb();
  const shops = (
    u.role === "admin"
      ? db.prepare("SELECT id, name, category, area, visit_on, prep_at IS NOT NULL AS prepared FROM shops ORDER BY id DESC").all()
      : db
          .prepare(
            `SELECT s.id, s.name, s.category, s.area, s.visit_on, s.prep_at IS NOT NULL AS prepared, COALESCE(s.partner_id, 0) != ? AS covering FROM shops s LEFT JOIN users p ON p.id = s.partner_id
             WHERE s.partner_id = ? OR (s.cover_partner_id = ? AND p.rest_month = ?) ORDER BY s.id DESC`,
          )
          .all(u.id, u.id, u.id, thisMonth())
  ) as Shop[];
  return Response.json({ shops });
}

// 事業者を登録する。担当は登録したパートナー。リリース用の暗証番号は、あとで事業者のページで事業者さんに決めてもらう
export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { name, category, area, visit_on, website_url } = (await req.json()) as Partial<Shop>;
  if (!name?.trim() || !category?.trim()) {
    return Response.json({ error: "事業者名と業種を入れてください" }, { status: 400 });
  }
  // 訪問の予定日とホームページ（どちらもなくてよい）。予定日があると、事務局が先に調べる（事前調査）
  const visit = visit_on && /^\d{4}-\d{2}-\d{2}$/.test(visit_on) ? visit_on : null;
  let site: string | null = (website_url ?? "").trim() || null;
  if (site && !/^https?:\/\//i.test(site)) site = `https://${site}`;
  if (site) {
    try {
      new URL(site);
    } catch {
      return Response.json({ error: "ホームページのアドレス（https://〜）を確かめてください" }, { status: 400 });
    }
  }
  const r = getDb()
    .prepare("INSERT INTO shops (name, category, area, partner_id, visit_on, website_url) VALUES (?, ?, ?, ?, ?, ?)")
    .run(name.trim(), category.trim(), (area ?? "").trim(), u.role === "partner" ? u.id : null, visit, site);
  return Response.json({ id: Number(r.lastInsertRowid) });
}
