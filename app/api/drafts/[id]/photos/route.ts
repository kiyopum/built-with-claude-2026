import { getDb } from "@/lib/db";
import { photosFromForm, replacePhotos } from "@/lib/files";

// パートナーの修正画面：商品の写真を入れ替える（並び順＝送った順。1枚目がメイン）
// このあと画面から edit を呼び、新しい写真で法律チェックをやり直す
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const d = getDb().prepare("SELECT id FROM drafts WHERE id = ?").get(Number(id)) as { id: number } | undefined;
  if (!d) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  try {
    const photos = await photosFromForm(await req.formData());
    if (!photos.length) return Response.json({ error: "写真を1枚以上入れてください" }, { status: 400 });
    replacePhotos(d.id, photos);
    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "写真を保存できませんでした" }, { status: 500 });
  }
}
