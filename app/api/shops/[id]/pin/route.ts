import { getDb } from "@/lib/db";
import { guardShop, hashPin, isPin } from "@/lib/auth";

// 店主さんの暗証番号（リリース用）を決める。まだ決まっていないお店だけ。変えるときは YMM の管理画面で
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  if (g.shop.release_pin_hash) return Response.json({ error: "暗証番号はもう決まっています。変えるときは YMM に連絡してください" }, { status: 400 });
  const { pin } = (await req.json()) as { pin?: string };
  if (!isPin(pin)) return Response.json({ error: "数字4けたで入れてください" }, { status: 400 });
  getDb().prepare("UPDATE shops SET release_pin_hash = ? WHERE id = ?").run(hashPin(pin), g.shop.id);
  return Response.json({ ok: true });
}
