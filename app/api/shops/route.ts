import { connection } from "next/server";
import { getDb, type Shop } from "@/lib/db";

export async function GET() {
  await connection();
  const shops = getDb().prepare("SELECT id, name, category, area FROM shops ORDER BY id DESC").all() as Shop[];
  return Response.json({ shops });
}

export async function POST(req: Request) {
  const { name, category, area } = (await req.json()) as Partial<Shop>;
  if (!name?.trim() || !category?.trim()) {
    return Response.json({ error: "店名と業種を入れてください" }, { status: 400 });
  }
  const r = getDb()
    .prepare("INSERT INTO shops (name, category, area) VALUES (?, ?, ?)")
    .run(name.trim(), category.trim(), (area ?? "").trim());
  return Response.json({ id: Number(r.lastInsertRowid) });
}
