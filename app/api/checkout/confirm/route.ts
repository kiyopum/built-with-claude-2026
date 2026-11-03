import { stripe, recordOrder } from "@/lib/stripe";

// 決済完了ページから呼ぶ。Stripe に支払い状況を問い合わせて、払われていれば注文を記録する。
// （本番は Webhook で記録する。手元の Mac には Stripe から Webhook が届かないので、こちらでも同じ記録をする。二重にはならない）
export async function POST(req: Request) {
  const { sessionId } = (await req.json()) as { sessionId: string };
  if (!sessionId?.startsWith("cs_")) return Response.json({ error: "決済の番号が正しくありません" }, { status: 400 });
  try {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    const r = recordOrder(session);
    return Response.json({ paid: session.payment_status === "paid", amount: session.amount_total, created: r.created });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "支払いを確認できませんでした" }, { status: 500 });
  }
}
