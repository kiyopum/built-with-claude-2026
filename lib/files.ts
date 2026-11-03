// 写真・録音ファイルの保存（data/ の下。GitHub には上げない）
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import type { Photo } from "@/lib/claude";

export const PHOTO_DIR = path.join(process.cwd(), "data", "photos");
const AUDIO_DIR = path.join(process.cwd(), "data", "audio");
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

// FormData から写真を取り出す（画面側で縮小済みの JPEG を想定）
export async function photosFromForm(form: FormData): Promise<Photo[]> {
  const files = form.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.some((f) => f.size > MAX_PHOTO_BYTES)) throw new Error("写真が大きすぎます（1枚8MBまで）");
  if (files.some((f) => !/^image\/(jpeg|png)$/.test(f.type))) throw new Error("写真は JPEG か PNG にしてください");
  return Promise.all(files.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()), mime: f.type })));
}

export function savePhotos(draftId: number, photos: Photo[]) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
  const ins = getDb().prepare("INSERT INTO product_photos (draft_id, file, mime, sort) VALUES (?, ?, ?, ?)");
  photos.forEach((p, i) => {
    const file = `draft-${draftId}-${i + 1}-${Date.now()}.${p.mime === "image/png" ? "png" : "jpg"}`;
    fs.writeFileSync(path.join(PHOTO_DIR, file), p.data);
    ins.run(draftId, file, p.mime, i);
  });
}

// 写真を丸ごと入れ替える（パートナーの修正画面から）
export function replacePhotos(draftId: number, photos: Photo[]) {
  const db = getDb();
  const old = db.prepare("SELECT file FROM product_photos WHERE draft_id = ?").all(draftId) as { file: string }[];
  db.prepare("DELETE FROM product_photos WHERE draft_id = ?").run(draftId);
  for (const o of old) fs.rmSync(path.join(PHOTO_DIR, o.file), { force: true });
  savePhotos(draftId, photos);
}

export function loadPhotos(draftId: number): Photo[] {
  const rows = getDb().prepare("SELECT file, mime FROM product_photos WHERE draft_id = ? ORDER BY sort").all(draftId) as {
    file: string;
    mime: string;
  }[];
  return rows
    .filter((r) => fs.existsSync(path.join(PHOTO_DIR, r.file)))
    .map((r) => ({ data: fs.readFileSync(path.join(PHOTO_DIR, r.file)), mime: r.mime }));
}

export function photoUrls(draftId: number): string[] {
  const rows = getDb().prepare("SELECT file FROM product_photos WHERE draft_id = ? ORDER BY sort").all(draftId) as { file: string }[];
  return rows.map((r) => `/api/photos/${r.file}`);
}

export async function saveAudios(form: FormData, prefix: string): Promise<{ file: string; mime: string; bytes: number }[]> {
  const audios = form.getAll("audio").filter((f): f is File => f instanceof File && f.size > 0);
  if (audios.some((f) => f.size > MAX_AUDIO_BYTES)) throw new Error("録音ファイルが大きすぎます（1件50MBまで）");
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const out = [];
  for (const [i, f] of audios.entries()) {
    const ext = f.type.includes("mp4") ? "m4a" : f.type.includes("webm") ? "webm" : "bin";
    const file = `${prefix}-${i + 1}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(AUDIO_DIR, file), Buffer.from(await f.arrayBuffer()));
    out.push({ file, mime: f.type, bytes: f.size });
  }
  return out;
}
