import { getDb, type Shop } from "@/lib/db";
import { after } from "next/server";
import { generateQuestions } from "@/lib/claude";
import { getResearch } from "@/lib/research";

export async function POST(req: Request) {
  const { shopId } = (await req.json()) as { shopId: number };
  const shop = getDb().prepare("SELECT * FROM shops WHERE id = ?").get(shopId) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  // ヒアリングしているあいだに、裏で法律を調べておく（送信後の待ち時間を短くするため）
  after(() => getResearch(shop).catch((e) => console.error("法律の調査に失敗", e)));
  try {
    return Response.json(await generateQuestions(shop));
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "質問を作れませんでした" }, { status: 500 });
  }
}
