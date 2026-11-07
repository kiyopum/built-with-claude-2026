import { guardShop } from "@/lib/auth";
import { after } from "next/server";
import { getDb, type Shop } from "@/lib/db";
import { generateShopQuestions } from "@/lib/claude";
import { getResearch } from "@/lib/research";

// 事業者のヒアリング（理念・思い）の質問を作る
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const shop = getDb().prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "事業者が見つかりません" }, { status: 404 });
  // 事務局が先に調べてあれば、その質問を使う（Claude を呼ばない）
  if (shop.prep_questions) return Response.json({ questions: JSON.parse(shop.prep_questions), prepared: true });
  // ヒアリングしているあいだに、裏で法律を調べておく
  after(() => getResearch(shop).catch((e) => console.error("法律の調査に失敗", e)));
  try {
    return Response.json(await generateShopQuestions(shop));
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "質問を作れませんでした" }, { status: 500 });
  }
}
