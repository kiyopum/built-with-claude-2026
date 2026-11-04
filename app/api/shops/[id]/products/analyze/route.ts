import { guardShop } from "@/lib/auth";
import { after } from "next/server";
import { getDb, type Shop } from "@/lib/db";
import { analyzeProductPhotos, analyzeService } from "@/lib/claude";
import { photosFromForm } from "@/lib/files";
import { getResearch } from "@/lib/research";

// 商品の写真を Claude に見せる → ラベルの読み取り＋足りないことだけの質問
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const shop = getDb().prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  after(() => getResearch(shop).catch((e) => console.error("法律の調査に失敗", e)));
  try {
    const form = await req.formData();
    const photos = await photosFromForm(form);
    // サービス（ライブ配信・講座など）は写真がなくてもよい
    if (form.get("kind") === "service") return Response.json(await analyzeService(shop, photos));
    if (!photos.length) return Response.json({ error: "写真がありません" }, { status: 400 });
    return Response.json(await analyzeProductPhotos(shop, photos));
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "写真を読み取れませんでした" }, { status: 500 });
  }
}
