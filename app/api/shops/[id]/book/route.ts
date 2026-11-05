import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { guardShop } from "@/lib/auth";
import { makeShopBook } from "@/lib/claude";

// お店の言葉の本：作ったものを見る（GET）／今ある記録から作る・作り直す（POST）
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await connection();
  const g = await guardShop((await ctx.params).id);
  if (g instanceof Response) return g;
  const s = g.shop as typeof g.shop & { book_json: string | null; book_at: string | null };
  return Response.json({ shop_name: s.name, book: s.book_json ? JSON.parse(s.book_json) : null, book_at: s.book_at });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardShop((await ctx.params).id);
  if (g instanceof Response) return g;
  const db = getDb();
  const shop = g.shop;
  const hearings = (db.prepare("SELECT transcript FROM hearings WHERE shop_id = ? AND length(transcript) > 0 ORDER BY id").all(shop.id) as { transcript: string }[]).map((h) => h.transcript);
  const ownerWords = [shop.philosophy_transcript ?? "", ...hearings].filter((t) => t.trim()).map((t) => t.slice(0, 6000));
  const products = db
    .prepare("SELECT name, recommend_reason AS reason, description FROM drafts WHERE shop_id = ? AND status = 'published' ORDER BY id")
    .all(shop.id) as { name: string; reason: string; description: string }[];
  const voices = (db.prepare("SELECT title, message FROM voices WHERE shop_id = ? ORDER BY id DESC LIMIT 20").all(shop.id) as { title: string; message: string }[]).map(
    (v) => `- ${v.title}: ${v.message}`,
  );
  const replies = (db.prepare("SELECT owner_reply FROM letters WHERE shop_id = ? AND owner_reply IS NOT NULL ORDER BY id").all(shop.id) as { owner_reply: string }[]).map((r) => r.owner_reply);
  if (!ownerWords.length && !shop.website_notes && !shop.philosophy_text && !products.length) {
    return Response.json({ error: "まだ材料がありません。先にお店のヒアリングか、ホームページの読みこみをしてください" }, { status: 400 });
  }
  try {
    const book = await makeShopBook({ shop, ownerWords, products, voices, replies });
    db.prepare("UPDATE shops SET book_json = ?, book_at = datetime('now','localtime') WHERE id = ?").run(JSON.stringify(book), shop.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "本をまとめられませんでした" }, { status: 500 });
  }
}
