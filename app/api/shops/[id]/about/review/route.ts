import { shopPinError, guardShop } from "@/lib/auth";
import { getDb, type Shop } from "@/lib/db";
import { summarizeShop } from "@/lib/claude";

// 店主が「このお店について」を確認する：approve（公開OK）/ edit（手で直す）/ revise（AIに作り直してもらう）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const { action, text, note, shopPin } = (await req.json()) as { action: string; text?: string; note?: string; shopPin?: string };
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop?.philosophy_text) return Response.json({ error: "お店の紹介がまだありません" }, { status: 404 });

  if (action === "approve") {
    // 公開OKは店主さんだけ（お店の暗証番号）
    const pinErr = shopPinError(g.shop, shopPin);
    if (pinErr) return Response.json({ error: pinErr }, { status: 403 });
    db.prepare("UPDATE shops SET philosophy_status = 'approved' WHERE id = ?").run(shop.id);
    return Response.json({ ok: true });
  }
  if (action === "edit") {
    if (!text?.trim()) return Response.json({ error: "紹介文が空です" }, { status: 400 });
    db.prepare("UPDATE shops SET philosophy_text = ?, philosophy_status = 'draft' WHERE id = ?").run(text.trim(), shop.id);
    return Response.json({ ok: true });
  }
  if (action === "revise") {
    if (!note?.trim()) return Response.json({ error: "直してほしいことを一言入れてください" }, { status: 400 });
    try {
      const s = await summarizeShop(shop, shop.philosophy_transcript ?? "", shop.philosophy_text, note.trim());
      db.prepare("UPDATE shops SET philosophy_text = ?, philosophy_points = ?, philosophy_status = 'draft' WHERE id = ?").run(
        s.intro,
        JSON.stringify(s.points),
        shop.id,
      );
      return Response.json({ ok: true });
    } catch (e) {
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "作り直せませんでした" }, { status: 500 });
    }
  }
  return Response.json({ error: "不明な操作です" }, { status: 400 });
}
