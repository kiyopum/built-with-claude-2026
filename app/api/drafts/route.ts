import { connection } from "next/server";
import { getDb, type Draft } from "@/lib/db";
import { photoUrls } from "@/lib/files";

// 店主の画面用：確認待ちの「このお店について」と、商品の下書き（写真つき）
export async function GET() {
  await connection();
  const db = getDb();
  const shops = db
    .prepare("SELECT id, name, philosophy_text, philosophy_status FROM shops WHERE philosophy_status IN ('draft','approved') ORDER BY philosophy_status = 'approved', id DESC")
    .all();
  const drafts = (
    db
      .prepare(
        `SELECT d.*, s.name AS shop_name FROM drafts d JOIN shops s ON s.id = d.shop_id
         ORDER BY CASE d.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, d.id DESC`,
      )
      .all() as Draft[]
  ).map((d) => ({ ...d, photos: photoUrls(d.id) }));
  return Response.json({ shops, drafts });
}
