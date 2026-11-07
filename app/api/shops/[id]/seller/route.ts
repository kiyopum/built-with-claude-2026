import { guardShop } from "@/lib/auth";
import { getDb, SELLER_KEYS } from "@/lib/db";

// 販売者の情報を保存する（手入力、または名刺の読み取り結果を手で直したもの）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const body = (await req.json()) as Record<string, unknown>;
  const db = getDb();
  if (!db.prepare("SELECT id FROM shops WHERE id = ?").get(Number(id))) {
    return Response.json({ error: "事業者が見つかりません" }, { status: 404 });
  }
  const values = sellerValues(body);
  db.prepare(`UPDATE shops SET ${SELLER_KEYS.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...values, Number(id));
  return Response.json({ ok: true });
}

function sellerValues(body: Record<string, unknown>): (string | null)[] {
  return SELLER_KEYS.map((k) => {
    const v = String(body[k] ?? "").trim().slice(0, 200);
    return v || null;
  });
}
