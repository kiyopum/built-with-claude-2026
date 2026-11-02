import { connection } from "next/server";
import { getDb, type Draft } from "@/lib/db";

export async function GET() {
  await connection();
  const drafts = getDb()
    .prepare(
      `SELECT d.*, s.name AS shop_name FROM drafts d JOIN shops s ON s.id = d.shop_id
       ORDER BY CASE d.status WHEN 'draft' THEN 0 WHEN 'published' THEN 1 ELSE 2 END, d.id DESC`,
    )
    .all() as Draft[];
  return Response.json({ drafts });
}
