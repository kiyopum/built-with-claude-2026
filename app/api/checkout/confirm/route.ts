import { stripe, recordOrder, letterTokenForSession } from "@/lib/stripe";
import { notifyOrder } from "@/lib/notify";
import { appOrigin } from "@/lib/origin";

// 決済完了ページから呼ぶ。Stripe に支払い状況を問い合わせて、払われていれば注文を記録する。
// （本番は Webhook で記録する。手元の Mac には Stripe から Webhook が届かないので、こちらでも同じ記録をする。二重にはならない）
export async function POST(req: Request) {
  const { sessionId } = (await req.json()) as { sessionId: string };
  if (!sessionId?.startsWith("cs_")) return Response.json({ error: "決済の番号が正しくありません" }, { status: 400 });
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const r = recordOrder(session);
    // 売れた知らせ（Webhook が先に記録していれば created=false なので二重には送らない）
    if (r.created && r.orderId) await notifyOrder(r.orderId, appOrigin(req)).catch((e) => console.error(e));
    const paid = session.payment_status === "paid";
    // 事業者さんに一言送るページの合言葉（払われた注文だけ）
    const letter = paid ? letterTokenForSession(session.id) : null;
    return Response.json({ paid, amount: session.amount_total, created: r.created, letter });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "支払いを確認できませんでした" }, { status: 500 });
  }
}
