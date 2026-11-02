import fs from "node:fs";
import path from "node:path";
import { getDb, type Shop } from "@/lib/db";
import { generateDrafts } from "@/lib/claude";

const AUDIO_DIR = path.join(process.cwd(), "data", "audio");
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 1件 50MB まで

// ヒアリング内容を保存し、Claude に商品ドラフトを2〜3件作らせる
export async function POST(req: Request) {
  // 文字（transcript）と録音ファイル（audio、何件でも）を FormData で受け取る
  const form = await req.formData();
  const shopId = Number(form.get("shopId"));
  const transcript = String(form.get("transcript") ?? "");
  const audios = form.getAll("audio").filter((f): f is File => f instanceof File && f.size > 0);
  if (audios.some((f) => f.size > MAX_AUDIO_BYTES)) {
    return Response.json({ error: "録音ファイルが大きすぎます（1件50MBまで）" }, { status: 400 });
  }
  const db = getDb();
  const shop = db.prepare("SELECT * FROM shops WHERE id = ?").get(shopId) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  if (!transcript?.trim()) return Response.json({ error: "ヒアリング内容が空です" }, { status: 400 });

  try {
    const products = await generateDrafts(shop, transcript.trim());
    const hearingId = Number(
      db.prepare("INSERT INTO hearings (shop_id, transcript) VALUES (?, ?)").run(shop.id, transcript.trim()).lastInsertRowid,
    );
    // 録音ファイルを保存（文字起こしの聞き間違いを、あとで元の音で確かめられるように）
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const insAudio = db.prepare("INSERT INTO hearing_audio (hearing_id, file, mime, bytes) VALUES (?, ?, ?, ?)");
    for (const [i, f] of audios.entries()) {
      const ext = f.type.includes("mp4") ? "m4a" : f.type.includes("webm") ? "webm" : "bin";
      const file = `hearing-${hearingId}-${i + 1}.${ext}`;
      fs.writeFileSync(path.join(AUDIO_DIR, file), Buffer.from(await f.arrayBuffer()));
      insAudio.run(hearingId, file, f.type, f.size);
    }

    const ins = db.prepare(
      `INSERT INTO drafts (hearing_id, shop_id, name, description, price_yen, recommend_reason, target_customer)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const p of products) {
      ins.run(hearingId, shop.id, p.name, p.description, p.price_yen, p.recommend_reason, p.target_customer);
    }
    return Response.json({ hearingId, count: products.length, audioCount: audios.length });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "ドラフトを作れませんでした" }, { status: 500 });
  }
}
