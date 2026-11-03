import { readBusinessCard } from "@/lib/claude";
import { photosFromForm } from "@/lib/files";

// 名刺の写真を読み取って返す（保存はしない。画面で手で直してから保存する）
// 名刺の写真そのものはサーバーに残さない
export async function POST(req: Request) {
  try {
    const photos = await photosFromForm(await req.formData());
    if (!photos.length) return Response.json({ error: "名刺の写真がありません" }, { status: 400 });
    return Response.json(await readBusinessCard(photos));
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "名刺を読み取れませんでした" }, { status: 500 });
  }
}
