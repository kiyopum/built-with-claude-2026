import { guardShop } from "@/lib/auth";
import { after } from "next/server";
import { getDb, type Shop } from "@/lib/db";
import { analyzeProductPhotos, analyzeService } from "@/lib/claude";
import { photosFromForm } from "@/lib/files";
import { getResearch } from "@/lib/research";
import { proposalFromForm, proposalText } from "@/lib/proposals";

// 商品の写真を Claude に見せる → ラベルの読み取り＋足りないことだけの質問
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const shop = getDb().prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "事業者が見つかりません" }, { status: 404 });
  after(() => getResearch(shop).catch((e) => console.error("法律の調査に失敗", e)));
  try {
    const form = await req.formData();
    const photos = await photosFromForm(form);
    // サービス（ライブ配信・講座など）は写真がなくてもよい
    if (form.get("kind") === "service") {
      // パートナーの提案から始めたときは、その案を手がかりに質問を作る（案はサーバーに残してあるものを番号で引く）
      const seed = proposalFromForm(shop, form.get("seed"));
      return Response.json(await analyzeService(shop, photos, seed ? proposalText(seed) : undefined));
    }
    if (!photos.length) return Response.json({ error: "写真がありません" }, { status: 400 });
    return Response.json(await analyzeProductPhotos(shop, photos));
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "写真を読み取れませんでした" }, { status: 500 });
  }
}
