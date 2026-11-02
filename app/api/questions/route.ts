import { getDb, type Shop } from "@/lib/db";
import { generateQuestions } from "@/lib/claude";

export async function POST(req: Request) {
  const { shopId } = (await req.json()) as { shopId: number };
  const shop = getDb().prepare("SELECT * FROM shops WHERE id = ?").get(shopId) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  try {
    return Response.json(await generateQuestions(shop));
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "質問を作れませんでした" }, { status: 500 });
  }
}
