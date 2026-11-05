import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { reframeVoice } from "@/lib/claude";

// ありがとうの往復便（お客さま向け・ログインなし）：カードの QR の合言葉で開く
//   お客さまに見せるのは、自分が書いた言葉とお店の返事だけ（住所や金額は見せない）
const MAX_PER_ORDER = 3;

function orderOf(token: string) {
  if (!/^[A-Za-z0-9_-]{16}$/.test(token)) return null;
  return getDb()
    .prepare(
      `SELECT o.id, o.shop_id, s.name AS shop_name, s.partner_id, d.name AS product_name, d.kind
       FROM orders o JOIN shops s ON s.id = o.shop_id JOIN drafts d ON d.id = o.draft_id WHERE o.letter_token = ?`,
    )
    .get(token) as { id: number; shop_id: number; shop_name: string; partner_id: number | null; product_name: string; kind: string } | undefined;
}

function lettersOf(orderId: number) {
  return getDb().prepare("SELECT id, original, owner_reply, replied_at, created_at FROM letters WHERE order_id = ? ORDER BY id").all(orderId);
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  await connection();
  const o = orderOf((await ctx.params).token);
  if (!o) return Response.json({ error: "このカードは見つかりませんでした" }, { status: 404 });
  const letters = lettersOf(o.id);
  return Response.json({ shop_name: o.shop_name, product_name: o.product_name, kind: o.kind, letters, can_write: letters.length < MAX_PER_ORDER });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const o = orderOf((await ctx.params).token);
  if (!o) return Response.json({ error: "このカードは見つかりませんでした" }, { status: 404 });
  const db = getDb();
  if (lettersOf(o.id).length >= MAX_PER_ORDER) return Response.json({ error: `1つの注文から送れるのは${MAX_PER_ORDER}通までです` }, { status: 429 });
  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  const t = String(text ?? "").trim();
  if (!t) return Response.json({ error: "一言を入れてください" }, { status: 400 });
  if (t.length > 1000) return Response.json({ error: "長すぎます（1000字まで）" }, { status: 400 });
  // みんなの声にも載せる（Claude が「もっと未来のために」の形に整え、名前や連絡先を消す）。
  //   書いた人の欄は、お店の担当パートナー（いなければ YMM 管理）。画面では「お客さまのお便り」と出す
  const holder =
    o.partner_id ?? (db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1").get() as { id: number } | undefined)?.id;
  let voiceId: number | null = null;
  if (holder) {
    try {
      const v = await reframeVoice({ source: "customer", shopName: o.shop_name, text: t });
      voiceId = Number(
        db
          .prepare("INSERT INTO voices (user_id, shop_id, source, kind, original, title, message, step, via) VALUES (?, ?, 'customer', ?, ?, ?, ?, ?, 'letter')")
          .run(holder, o.shop_id, v.kind, t, v.title, v.message, v.step).lastInsertRowid,
      );
    } catch (e) {
      // 整えるのに失敗しても、お店へのお便りは届ける（みんなの声には載らない）
      console.error(e);
    }
  }
  db.prepare("INSERT INTO letters (order_id, shop_id, original, voice_id) VALUES (?, ?, ?, ?)").run(o.id, o.shop_id, t, voiceId);
  return Response.json({ ok: true, letters: lettersOf(o.id) });
}
