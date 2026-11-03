// YaoBiz のデータベース（SQLite）。ファイルは data/yaobiz.db（GitHub には上げない）。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// テストのときだけ YAOBIZ_DATA_DIR で別の場所に向ける（本物のデータを汚さない）
const DATA_DIR = process.env.YAOBIZ_DATA_DIR || path.join(process.cwd(), "data");

declare global {
  var __yaobizDb: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "yaobiz.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      area TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS hearings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      transcript TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS hearing_audio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hearing_id INTEGER NOT NULL REFERENCES hearings(id),
      file TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hearing_id INTEGER NOT NULL REFERENCES hearings(id),
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price_yen INTEGER NOT NULL,
      recommend_reason TEXT NOT NULL,
      target_customer TEXT NOT NULL,
      -- draft（確認待ち）/ published（公開）/ rejected（却下）
      status TEXT NOT NULL DEFAULT 'draft',
      revision_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- 商品の写真（1枚目がメイン）
    CREATE TABLE IF NOT EXISTS product_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id INTEGER NOT NULL REFERENCES drafts(id),
      file TEXT NOT NULL,
      mime TEXT NOT NULL,
      sort INTEGER NOT NULL DEFAULT 0
    );

    -- 売れた記録。Stripe の決済セッションID で二重登録を防ぐ
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stripe_session_id TEXT NOT NULL UNIQUE,
      draft_id INTEGER NOT NULL REFERENCES drafts(id),
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      quantity INTEGER NOT NULL,
      amount_yen INTEGER NOT NULL,      -- 売上（税込）
      owner_yen INTEGER NOT NULL,       -- 店主の取り分
      ymm_yen INTEGER NOT NULL,         -- YMM の取り分（パートナー分を引いた残り）
      partner_yen INTEGER NOT NULL,     -- パートナーの取り分
      fee_yen INTEGER NOT NULL DEFAULT 0, -- 決済手数料（YMM の1割の中から払う）
      ymm_rate REAL NOT NULL,           -- 計算に使った料率（あとで料率を変えても過去の注文は変わらない）
      partner_share REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    -- ログインする人（パートナーと YMM 管理者）。店主はログインしない（リリースのときだけお店の暗証番号）
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'partner', -- partner / admin
      pin_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      failed INTEGER NOT NULL DEFAULT 0,      -- 暗証番号を続けて間違えた回数
      locked_until TEXT,                      -- 5回間違えたら少し待ってもらう
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    );

    -- 料率などの設定
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    -- 分け方（2026-11-03 きよさん決定・C案）：売上の1割が YMM。そこから決済手数料を先に引き、残りをパートナーと YMM で分ける
    INSERT OR IGNORE INTO settings (key, value) VALUES ('ymm_rate', '0.10');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('stripe_fee_rate', '0.036');
    -- 手数料を引いた残りのうちパートナーに回す割合。金額設定は練り直し中（三方良しになる値を検討）
    INSERT OR IGNORE INTO settings (key, value) VALUES ('partner_share', '0.50');
    -- パートナーへの支払期日（フリーランス新法で明示が必要）。YMM が管理画面で入れる。推測で埋めない
    INSERT OR IGNORE INTO settings (key, value) VALUES ('payment_terms', '');
  `);

  // 後から足した列（すでにある DB にも足す）
  const cols = (db.prepare("PRAGMA table_info(drafts)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("stripe_product_id")) db.exec("ALTER TABLE drafts ADD COLUMN stripe_product_id TEXT");
  if (!cols.includes("stripe_price_id")) db.exec("ALTER TABLE drafts ADD COLUMN stripe_price_id TEXT");
  if (!cols.includes("legal_json")) db.exec("ALTER TABLE drafts ADD COLUMN legal_json TEXT");
  // SNS 投稿（Claude が作った文と、その法律チェック）
  if (!cols.includes("sns_json")) db.exec("ALTER TABLE drafts ADD COLUMN sns_json TEXT");
  const hcols = (db.prepare("PRAGMA table_info(hearings)").all() as { name: string }[]).map((c) => c.name);
  if (!hcols.includes("legal_research")) db.exec("ALTER TABLE hearings ADD COLUMN legal_research TEXT");
  const scols = (db.prepare("PRAGMA table_info(shops)").all() as { name: string }[]).map((c) => c.name);
  if (!scols.includes("legal_research")) db.exec("ALTER TABLE shops ADD COLUMN legal_research TEXT");
  // 担当パートナー・リリース用のお店の暗証番号・送料（全国一律、商品代とは別）
  if (!scols.includes("partner_id")) db.exec("ALTER TABLE shops ADD COLUMN partner_id INTEGER REFERENCES users(id)");
  if (!scols.includes("release_pin_hash")) db.exec("ALTER TABLE shops ADD COLUMN release_pin_hash TEXT");
  if (!scols.includes("shipping_yen")) db.exec("ALTER TABLE shops ADD COLUMN shipping_yen INTEGER");
  // 店主さんの暗証番号も、続けて間違えたら少し待ってもらう（パートナーが総当たりできないように）
  if (!scols.includes("pin_failed")) db.exec("ALTER TABLE shops ADD COLUMN pin_failed INTEGER NOT NULL DEFAULT 0");
  if (!scols.includes("pin_locked_until")) db.exec("ALTER TABLE shops ADD COLUMN pin_locked_until TEXT");
  if (!scols.includes("legal_researched_at")) db.exec("ALTER TABLE shops ADD COLUMN legal_researched_at TEXT");
  // お店のヒアリング（理念・思い）。status: none（まだ）/ draft（店主の確認待ち）/ approved（公開OK）
  if (!scols.includes("philosophy_transcript")) db.exec("ALTER TABLE shops ADD COLUMN philosophy_transcript TEXT");
  if (!scols.includes("philosophy_text")) db.exec("ALTER TABLE shops ADD COLUMN philosophy_text TEXT");
  if (!scols.includes("philosophy_points")) db.exec("ALTER TABLE shops ADD COLUMN philosophy_points TEXT");
  if (!scols.includes("philosophy_status")) db.exec("ALTER TABLE shops ADD COLUMN philosophy_status TEXT NOT NULL DEFAULT 'none'");
  // 販売者の情報（特定商取引法の表示用）。ヒアリングでは聞かず、名刺の写真か手入力で登録する
  for (const c of ["seller_name", "seller_rep", "seller_address", "seller_phone", "seller_email"]) {
    if (!scols.includes(c)) db.exec(`ALTER TABLE shops ADD COLUMN ${c} TEXT`);
  }
  if (!hcols.includes("label_read")) db.exec("ALTER TABLE hearings ADD COLUMN label_read TEXT");
  const ocols = (db.prepare("PRAGMA table_info(orders)").all() as { name: string }[]).map((c) => c.name);
  // どのパートナーのシェアから売れたか（シェア用リンクの ?ref=）
  if (!ocols.includes("ref")) db.exec("ALTER TABLE orders ADD COLUMN ref TEXT");
  // 送料（商品代とは別。店主に渡り、その手数料も送料から引く）・届け先・パートナーの分け方（担当と紹介者）
  for (const [c, t] of [
    ["shipping_yen", "INTEGER NOT NULL DEFAULT 0"],
    ["shipping_fee_yen", "INTEGER NOT NULL DEFAULT 0"],
    ["ship_name", "TEXT"],
    ["ship_address", "TEXT"],
    ["owner_partner_id", "INTEGER"],
    ["owner_partner_yen", "INTEGER NOT NULL DEFAULT 0"],
    ["referrer_id", "INTEGER"],
    ["referrer_yen", "INTEGER NOT NULL DEFAULT 0"],
  ] as const) {
    if (!ocols.includes(c)) db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
  }
  if (!ocols.includes("fee_yen")) db.exec("ALTER TABLE orders ADD COLUMN fee_yen INTEGER NOT NULL DEFAULT 0");
  // 送料込みの値段（2026-11-04 物流の社長さんの助言：大きさと重さで一番安い送り方を選ぶ・距離で送料を変える）
  //   商品：大きさ（絵で選ぶ区分）と重さ。両方あれば「送料込み」、なければ今までどおりお店の全国一律の送料
  //   お店：送り出す都道府県（地域ごとの料金に要る）・お店での受け取り
  //   注文：買う人が選んだ届け先の都道府県・送り方・受け取り
  if (!cols.includes("size_class")) db.exec("ALTER TABLE drafts ADD COLUMN size_class TEXT");
  if (!cols.includes("weight_g")) db.exec("ALTER TABLE drafts ADD COLUMN weight_g INTEGER");
  // 1箱にいくつ入るか（2個目からの送料を安くするため。お店が決める。初めは1）
  if (!cols.includes("per_box")) db.exec("ALTER TABLE drafts ADD COLUMN per_box INTEGER NOT NULL DEFAULT 1");
  if (!scols.includes("prefecture")) db.exec("ALTER TABLE shops ADD COLUMN prefecture TEXT");
  if (!scols.includes("pickup_ok")) db.exec("ALTER TABLE shops ADD COLUMN pickup_ok INTEGER NOT NULL DEFAULT 0");
  for (const [c, t] of [
    ["ship_pref", "TEXT"],
    ["ship_method", "TEXT"],
    ["pickup", "INTEGER NOT NULL DEFAULT 0"],
    // 決済画面で入れた住所が、先に選んだ届け先の都道府県と違うとき（送料が違うので、店主さんと YMM が確かめる）
    ["ship_warning", "TEXT"],
  ] as const) {
    if (!ocols.includes(c)) db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
  }

  // デモ用のダミーの店（架空）。1件もなければ入れる。
  const count = db.prepare("SELECT COUNT(*) AS n FROM shops").get() as { n: number };
  if (count.n === 0) {
    db.prepare("INSERT INTO shops (name, category, area) VALUES (?, ?, ?)").run(
      "みどりの台所（架空）",
      "地域の商品を集めたセレクトショップ形式の健康食品店",
      "埼玉県東部（架空）",
    );
  }
  return db;
}

// 開発中の再読み込みで接続が増えないよう、1つを使い回す
export function getDb(): DatabaseSync {
  if (!globalThis.__yaobizDb) globalThis.__yaobizDb = open();
  return globalThis.__yaobizDb;
}

export type Shop = {
  id: number;
  name: string;
  category: string;
  area: string;
  philosophy_transcript: string | null;
  philosophy_text: string | null;
  philosophy_points: string | null;
  philosophy_status: "none" | "draft" | "approved";
  seller_name: string | null;
  seller_rep: string | null;
  seller_address: string | null;
  seller_phone: string | null;
  seller_email: string | null;
  partner_id: number | null;
  release_pin_hash: string | null;
  shipping_yen: number | null;
  prefecture: string | null;
  pickup_ok: number;
};
export const SELLER_KEYS = ["seller_name", "seller_rep", "seller_address", "seller_phone", "seller_email"] as const;
export type Draft = {
  id: number;
  hearing_id: number;
  shop_id: number;
  shop_name?: string;
  name: string;
  description: string;
  price_yen: number;
  recommend_reason: string;
  target_customer: string;
  status: "draft" | "published" | "rejected";
  revision_note: string;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  legal_json: string | null;
  sns_json?: string | null;
  size_class?: string | null;
  weight_g?: number | null;
  per_box?: number;
  created_at: string;
  updated_at: string;
};

export function getText(key: "payment_terms"): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

export function getSetting(key: "ymm_rate" | "partner_share" | "stripe_fee_rate"): number {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return Number(row?.value ?? 0);
}
