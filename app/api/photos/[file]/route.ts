import fs from "node:fs";
import path from "node:path";
import { PHOTO_DIR } from "@/lib/files";

// 商品の写真を返す（ファイル名は英数字と記号だけ受け付け、フォルダの外は読ませない）
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[\w.-]+\.(jpg|png)$/.test(file)) return new Response("not found", { status: 404 });
  const full = path.join(PHOTO_DIR, file);
  if (!fs.existsSync(full)) return new Response("not found", { status: 404 });
  return new Response(fs.readFileSync(full), {
    headers: { "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
