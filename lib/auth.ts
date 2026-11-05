// ログイン（名前を選んで暗証番号4桁）。店主はログインしない。
//   暗証番号はそのまま保存せず、scrypt で変換した値だけを持つ
//   5回続けて間違えたら5分待ってもらう（4桁は総当たりされやすいため）
//   ログイン状態は、ブラウザから読めないクッキー（httpOnly）に入れた合言葉で持つ
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type Shop } from "@/lib/db";
import { thisMonth } from "@/lib/checkin";

export type User = { id: number; name: string; role: "partner" | "admin"; code: string };
const COOKIE = "yaobiz_session";
const SESSION_DAYS = 30;

export const isPin = (pin: unknown): pin is string => typeof pin === "string" && /^\d{4}$/.test(pin);

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function checkPin(pin: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(pin, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

// パートナー番号は自動で付ける（P01, P02 …）。紹介リンクの ?ref= に使う
export const codeOf = (id: number) => `P${String(id).padStart(2, "0")}`;
export const idOfCode = (code: string) => (/^P\d+$/.test(code) ? Number(code.slice(1)) : null);

export function toUser(r: { id: number; name: string; role: string }): User {
  return { id: r.id, name: r.name, role: r.role === "admin" ? "admin" : "partner", code: codeOf(r.id) };
}

// 暗証番号を確かめる（間違いの回数と待ち時間つき）。成功したらクッキーを付ける
export async function login(userId: number, pin: string): Promise<{ user?: User; error?: string }> {
  const db = getDb();
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND active = 1").get(userId) as
    | { id: number; name: string; role: string; pin_hash: string; failed: number; locked_until: string | null }
    | undefined;
  if (!u) return { error: "この名前ではログインできません" };
  if (u.locked_until && new Date(u.locked_until) > new Date()) {
    return { error: "暗証番号を何回も間違えたので、5分ほど待ってからもう一度どうぞ" };
  }
  if (!isPin(pin) || !checkPin(pin, u.pin_hash)) {
    const failed = u.failed + 1;
    const lock = failed >= 5 ? new Date(Date.now() + 5 * 60_000).toISOString() : null;
    db.prepare("UPDATE users SET failed = ?, locked_until = ? WHERE id = ?").run(lock ? 0 : failed, lock, u.id);
    return { error: lock ? "5回間違えたので、5分ほど待ってからもう一度どうぞ" : "暗証番号がちがいます" };
  }
  db.prepare("UPDATE users SET failed = 0, locked_until = NULL WHERE id = ?").run(u.id);
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, u.id, expires.toISOString());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires });
  return { user: toUser(u) };
}

export async function logout() {
  const jar = await cookies();
  const t = jar.get(COOKIE)?.value;
  if (t) getDb().prepare("DELETE FROM sessions WHERE token = ?").run(t);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  const r = getDb()
    .prepare("SELECT u.id, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.active = 1")
    .get(t, new Date().toISOString()) as { id: number; name: string; role: string } | undefined;
  return r ? toUser(r) : null;
}

// API の入口で使う：ログインしていなければ 401 を返す
export async function requireUser(): Promise<User | Response> {
  const u = await currentUser();
  return u ?? Response.json({ error: "ログインしてください" }, { status: 401 });
}
export async function requireAdmin(): Promise<User | Response> {
  const u = await currentUser();
  if (!u) return Response.json({ error: "ログインしてください" }, { status: 401 });
  return u.role === "admin" ? u : Response.json({ error: "YMM の管理者だけが使えます" }, { status: 403 });
}

// そのお店を触ってよいか（担当パートナーか管理者）
//   見守りの人（担当がお休みの間に YMM 管理が決めた人）も触れる
export function canEditShop(u: User, shop: Pick<Shop, "partner_id"> & Partial<Pick<Shop, "cover_partner_id">>): boolean {
  if (u.role === "admin" || shop.partner_id === u.id) return true;
  // 見守りは、担当がお休みの月の間だけ（もどったら自然に外れる）
  if (shop.cover_partner_id == null || shop.cover_partner_id !== u.id || shop.partner_id == null) return false;
  const p = getDb().prepare("SELECT rest_month FROM users WHERE id = ?").get(shop.partner_id) as { rest_month: string | null } | undefined;
  return p?.rest_month === thisMonth();
}

// お店の暗証番号（店主が決めた4桁）を確かめる。リリースと届け先を見るときに使う
//   5回続けて間違えたら5分待ってもらう。失敗の理由は文で返す（成功は ""）
export function shopPinError(shop: Pick<Shop, "id" | "release_pin_hash">, pin: unknown): string {
  if (!shop.release_pin_hash) return "先にお店のページで、店主さんの暗証番号を決めてください";
  const db = getDb();
  const row = db.prepare("SELECT pin_failed, pin_locked_until FROM shops WHERE id = ?").get(shop.id) as { pin_failed: number; pin_locked_until: string | null };
  if (row.pin_locked_until && new Date(row.pin_locked_until) > new Date()) return "暗証番号を何回も間違えたので、5分ほど待ってからもう一度どうぞ";
  if (isPin(pin) && checkPin(pin, shop.release_pin_hash)) {
    db.prepare("UPDATE shops SET pin_failed = 0, pin_locked_until = NULL WHERE id = ?").run(shop.id);
    return "";
  }
  const failed = row.pin_failed + 1;
  const lock = failed >= 5 ? new Date(Date.now() + 5 * 60_000).toISOString() : null;
  db.prepare("UPDATE shops SET pin_failed = ?, pin_locked_until = ? WHERE id = ?").run(lock ? 0 : failed, lock, shop.id);
  return lock ? "5回間違えたので、5分ほど待ってからもう一度どうぞ" : "店主さんの暗証番号がちがいます";
}

// お店の API の入口：ログイン＋そのお店の担当か管理者か
export async function guardShop(shopId: number | string): Promise<{ user: User; shop: Shop } | Response> {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const shop = getDb().prepare("SELECT * FROM shops WHERE id = ?").get(Number(shopId)) as Shop | undefined;
  if (!shop) return Response.json({ error: "お店が見つかりません" }, { status: 404 });
  if (!canEditShop(user, shop)) return Response.json({ error: "担当していないお店です" }, { status: 403 });
  return { user, shop };
}

// 商品の API の入口：商品のお店で確かめる
export async function guardDraft(draftId: number | string): Promise<{ user: User; shop: Shop } | Response> {
  const row = getDb().prepare("SELECT shop_id FROM drafts WHERE id = ?").get(Number(draftId)) as { shop_id: number } | undefined;
  if (!row) return Response.json({ error: "商品が見つかりません" }, { status: 404 });
  return guardShop(row.shop_id);
}
