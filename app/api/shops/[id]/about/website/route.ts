import { guardShop } from "@/lib/auth";
import { getDb, type Shop } from "@/lib/db";
import { readShopWebsite } from "@/lib/claude";

// SNS は中身がログインの向こうにあって読めないので、今までどおりヒアリングで聞く
const SNS_HOSTS = ["instagram.com", "facebook.com", "x.com", "twitter.com", "tiktok.com", "line.me", "threads.net"];

// お店のホームページを Claude に読んでもらう（あれば。ヒアリングは補足になる）
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const g = await guardShop(id);
  if (g instanceof Response) return g;
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(Number(id)) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { url?: string; clear?: boolean };
  if (body.clear) {
    db.prepare("UPDATE shops SET website_url = NULL, website_notes = NULL WHERE id = ?").run(shop.id);
    return Response.json({ ok: true });
  }
  let raw = String(body.url ?? "").trim();
  if (raw && !/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return Response.json({ error: "ホームページのアドレス（https://〜）を入れてください" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) {
    return Response.json({ error: "ホームページのアドレス（https://〜）を入れてください" }, { status: 400 });
  }
  const host = url.hostname.replace(/^www\./, "");
  if (SNS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return Response.json(
      { error: "Instagram などの SNS は、ログインしないと中身が読めません。SNS だけのお店は、今までどおりヒアリングでお話を聞いてください。" },
      { status: 400 },
    );
  }
  try {
    const r = await readShopWebsite(shop, url.toString());
    const notes = `${r.notes}\n\n（読んだページ：${r.pages.join(" ／ ")}）`;
    db.prepare("UPDATE shops SET website_url = ?, website_notes = ? WHERE id = ?").run(url.toString(), notes, shop.id);
    return Response.json({ ok: true, website_url: url.toString(), website_notes: notes });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "ホームページを読めませんでした" }, { status: 500 });
  }
}
