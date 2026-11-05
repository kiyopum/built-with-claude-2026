import { connection } from "next/server";
import { getDb, type Shop } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { thisMonth } from "@/lib/checkin";

// パートナーが担当するお店の一覧（管理者は全部）
export async function GET() {
  await connection();
  const u = await requireUser();
  if (u instanceof Response) return u;
  const db = getDb();
  const shops = (
    u.role === "admin"
      ? db.prepare("SELECT id, name, category, area FROM shops ORDER BY id DESC").all()
      : db
          .prepare(
            `SELECT s.id, s.name, s.category, s.area, COALESCE(s.partner_id, 0) != ? AS covering FROM shops s LEFT JOIN users p ON p.id = s.partner_id
             WHERE s.partner_id = ? OR (s.cover_partner_id = ? AND p.rest_month = ?) ORDER BY s.id DESC`,
          )
          .all(u.id, u.id, u.id, thisMonth())
  ) as Shop[];
  return Response.json({ shops });
}

// お店を登録する。担当は登録したパートナー。リリース用の暗証番号は、あとでお店のページで店主さんに決めてもらう
export async function POST(req: Request) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { name, category, area } = (await req.json()) as Partial<Shop>;
  if (!name?.trim() || !category?.trim()) {
    return Response.json({ error: "店名と業種を入れてください" }, { status: 400 });
  }
  const r = getDb()
    .prepare("INSERT INTO shops (name, category, area, partner_id) VALUES (?, ?, ?, ?)")
    .run(name.trim(), category.trim(), (area ?? "").trim(), u.role === "partner" ? u.id : null);
  return Response.json({ id: Number(r.lastInsertRowid) });
}
