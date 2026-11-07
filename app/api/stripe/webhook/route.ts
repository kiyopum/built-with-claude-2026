import { stripe, recordOrder } from "@/lib/stripe";
import { notifyOrder } from "@/lib/notify";

// Stripe からの「決済が終わった」知らせ（Webhook）。署名を確かめてから注文を記録する
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "STRIPE_WEBHOOK_SECRET が未設定です" }, { status: 500 });
  const body = await req.text(); // 署名の確認には、受け取ったままの本文が必要
  const sig = req.headers.get("stripe-signature") ?? "";
  let event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return Response.json({ error: "署名が正しくありません" }, { status: 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try {
      const r = recordOrder(event.data.object);
      // 売れた知らせ（メールが送れなくても注文は記録済み。ここで失敗しても 200 を返す＝Stripe に再送させない）
      if (r.created && r.orderId) await notifyOrder(r.orderId, new URL(req.url).origin).catch((e) => console.error(e));
    } catch (e) {
      console.error(e);
      return Response.json({ error: "注文を記録できませんでした" }, { status: 500 });
    }
  }
  return Response.json({ received: true });
}
