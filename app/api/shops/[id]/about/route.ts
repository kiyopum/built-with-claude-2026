import { guardShop } from "@/lib/auth";
import { getDb, type Shop } from "@/lib/db";
import { summarizeShop } from "@/lib/claude";
import { saveAudios } from "@/lib/files";

// お店のヒアリングを送る → Claude が「このお店について」を書く → 店主の確認待ちにする
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  const form = await req.formData();
  const transcript = String(form.get("transcript") ?? "").trim();
  // ホームページを読んであれば、ヒアリングは補足（空でもよい）
  if (!transcript && !shop.website_notes) return Response.json({ error: "ヒアリング内容が空です" }, { status: 400 });
  try {
    await saveAudios(form, `shop-${shop.id}`);
    const s = await summarizeShop(shop, transcript);
    db.prepare(
      "UPDATE shops SET philosophy_transcript = ?, philosophy_text = ?, philosophy_points = ?, philosophy_status = 'draft' WHERE id = ?",
    ).run(transcript, s.intro, JSON.stringify(s.points), shop.id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "お店の紹介を作れませんでした" }, { status: 500 });
  }
}
