import { getDb, type Shop } from "@/lib/db";
import { generateDrafts } from "@/lib/claude";

// ヒアリング内容を保存し、Claude に商品ドラフトを2〜3件作らせる
export async function POST(req: Request) {
  const { shopId, transcript } = (await req.json()) as { shopId: number; transcript: string };
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(shopId) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  if (!transcript?.trim()) return Response.json({ error: "ヒアリング内容が空です" }, { status: 400 });

  try {
    const products = await generateDrafts(shop, transcript.trim());
    const hearingId = Number(
      db.prepare("INSERT INTO hearings (shop_id, transcript) VALUES (?, ?)").run(shop.id, transcript.trim()).lastInsertRowid,
    );
    const ins = db.prepare(
      `INSERT INTO drafts (hearing_id, shop_id, name, description, price_yen, recommend_reason, target_customer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of products) {
      ins.run(hearingId, shop.id, p.name, p.description, p.price_yen, p.recommend_reason, p.target_customer);
    }
    return Response.json({ hearingId, count: products.length });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "ドラフトを作れませんでした" }, { status: 500 });
  }
}
