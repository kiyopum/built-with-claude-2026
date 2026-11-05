// YaoBiz のデータベース（SQLite）。ファイルは data/yaobiz.db（GitHub には上げない）。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

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

    -- みんなの声（2026-11-05 きよさん）：店主さん・お客さまからのお褒めと要望を、スタッフみんなで分け合う。
    --   original は聞いたままの言葉（書いた人と YMM 管理だけが見る）。message は Claude が「もっと未来のために」の形に整えた、みんなに見せる文
    CREATE TABLE IF NOT EXISTS voices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      shop_id INTEGER REFERENCES shops(id),
      source TEXT NOT NULL,          -- owner（店主さん）/ customer（お客さま）/ other
      kind TEXT NOT NULL,            -- praise（お褒め）/ request（要望）
      original TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      step TEXT NOT NULL DEFAULT '', -- 次の小さな一歩
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS voice_thanks (
      voice_id INTEGER NOT NULL REFERENCES voices(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (voice_id, user_id)
    );

    -- 月1のふり返り（2026-11-05 きよさん）：事業や理念についての問いと、本人の気持ちのたしかめ。
    --   答えは本人と山崎（YMM 管理）だけが読む（画面で本人にそう伝える）。ほかのパートナーには見せない
    CREATE TABLE IF NOT EXISTS checkin_months (
      month TEXT PRIMARY KEY,        -- 2026-11
      questions_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      month TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      reply TEXT NOT NULL,           -- 本人への返事
      care_level TEXT NOT NULL,      -- 元気 / 気にかける / 早めに話す
      care_summary TEXT NOT NULL,    -- 山崎向けのまとめ
      talk_points TEXT NOT NULL,     -- 面談で聞くとよいこと（JSON）
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE (user_id, month)
    );

    -- ありがとうの往復便（2026-11-05 きよさん）：箱に入れたカードの QR から、お客さまがお店に一言送る。店主さんが返事をする。
    --   返事はメールでは送らない。お客さまが同じ QR を開くと読める（お客さまの連絡先を増やさない）
    --   original はお客さまが書いたそのままの言葉。みんなの声には Claude が整えた文（voice_id）が載る
    CREATE TABLE IF NOT EXISTS letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      shop_id INTEGER NOT NULL REFERENCES shops(id),
      original TEXT NOT NULL,
      voice_id INTEGER REFERENCES voices(id),
      owner_reply TEXT,
      replied_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
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
    -- サービス（ライブ配信・講座・体験など）の YMM の取り分の既定（2026-11-05 きよさん：5割。講師（お店）5割、残りから手数料を引いて YMM とパートナーで半分ずつ）
    INSERT OR IGNORE INTO settings (key, value) VALUES ('ymm_rate_service', '0.50');
    -- 売れなくても責めない伴走（2026-11-05 きよさん）：公開からこの日数、注文がない商品に「次の小さな一歩」を出す
    INSERT OR IGNORE INTO settings (key, value) VALUES ('nudge_days', '30');
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
  // お店のホームページ（あれば Claude が読んで、お店のヒアリングの土台にする。ヒアリングは補足になる）
  if (!scols.includes("website_url")) db.exec("ALTER TABLE shops ADD COLUMN website_url TEXT");
  // お店の言葉の本（Claude がまとめたもの・作った日）
  if (!scols.includes("book_json")) db.exec("ALTER TABLE shops ADD COLUMN book_json TEXT");
  if (!scols.includes("book_at")) db.exec("ALTER TABLE shops ADD COLUMN book_at TEXT");
  if (!scols.includes("website_notes")) db.exec("ALTER TABLE shops ADD COLUMN website_notes TEXT");
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
  // 種類：goods（もの）/ service（ライブ配信・講座・体験など。送らない）。ymm_rate：この商品だけの YMM の取り分（空なら種類ごとの既定。変えられるのは YMM 管理だけ）
  if (!cols.includes("kind")) db.exec("ALTER TABLE drafts ADD COLUMN kind TEXT NOT NULL DEFAULT 'goods'");
  if (!cols.includes("ymm_rate")) db.exec("ALTER TABLE drafts ADD COLUMN ymm_rate REAL");
  // 公開した日（updated_at は修正で動くので別に持つ）・次の小さな一歩（Claude が考えたもの・考えた日）
  if (!cols.includes("published_at")) {
    db.exec("ALTER TABLE drafts ADD COLUMN published_at TEXT");
    db.exec("UPDATE drafts SET published_at = updated_at WHERE status = 'published'");
  }
  if (!cols.includes("nudge_json")) db.exec("ALTER TABLE drafts ADD COLUMN nudge_json TEXT");
  if (!cols.includes("nudge_at")) db.exec("ALTER TABLE drafts ADD COLUMN nudge_at TEXT");
  if (!scols.includes("prefecture")) db.exec("ALTER TABLE shops ADD COLUMN prefecture TEXT");
  // ネットで宛名ラベルを作る送り方（クリックポスト）を使うか。初めは使わない（IT が苦手なお店でも出せる送り方だけにする）
  if (!scols.includes("online_label")) db.exec("ALTER TABLE shops ADD COLUMN online_label INTEGER NOT NULL DEFAULT 0");
  // 発送する曜日（2026-11-05 きよさん：近所のお店で出す日をそろえると、集荷が1回で済む）。"2,5" のように 0=日〜6=土
  if (!scols.includes("ship_days")) db.exec("ALTER TABLE shops ADD COLUMN ship_days TEXT");
  if (!scols.includes("pickup_ok")) db.exec("ALTER TABLE shops ADD COLUMN pickup_ok INTEGER NOT NULL DEFAULT 0");
  for (const [c, t] of [
    ["ship_pref", "TEXT"],
    ["ship_method", "TEXT"],
    ["pickup", "INTEGER NOT NULL DEFAULT 0"],
    // 決済画面で入れた住所が、先に選んだ届け先の都道府県と違うとき（送料が違うので、店主さんと YMM が確かめる）
    ["ship_warning", "TEXT"],
    // お客さまのメールアドレス（サービスの案内＝配信の URL などを講師がメールで送るため）
    ["customer_email", "TEXT"],
    // ありがとうの往復便の合言葉（QR に入れる。注文ごとに1つ）
    ["letter_token", "TEXT"],
  ] as const) {
    if (!ocols.includes(c)) db.exec(`ALTER TABLE orders ADD COLUMN ${c} ${t}`);
  }

  // 休んでいい仕組み（2026-11-05 きよさん）：rest_month＝お休みする月（2026-11）。翌月には自然に戻る。
  //   お休みの間、担当のお店は見守りの人（cover_partner_id。空なら YMM 管理）が見る。担当・取り分・記録は変えない
  //   career_json：わたしの歩み（できるようになったこと）を Claude がまとめたもの
  const ucols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
  for (const c of ["rest_month", "career_json", "career_at"]) if (!ucols.includes(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} TEXT`);
  if (!scols.includes("cover_partner_id")) db.exec("ALTER TABLE shops ADD COLUMN cover_partner_id INTEGER REFERENCES users(id)");

  // みんなの声が、お客さまのお便り（QR から）で届いたものか
  const vcols = (db.prepare("PRAGMA table_info(voices)").all() as { name: string }[]).map((c) => c.name);
  if (!vcols.includes("via")) db.exec("ALTER TABLE voices ADD COLUMN via TEXT");

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
  website_url: string | null;
  website_notes: string | null;
  seller_name: string | null;
  seller_rep: string | null;
  seller_address: string | null;
  seller_phone: string | null;
  seller_email: string | null;
  partner_id: number | null;
  cover_partner_id: number | null;
  release_pin_hash: string | null;
  shipping_yen: number | null;
  prefecture: string | null;
  pickup_ok: number;
  online_label: number;
  ship_days: string | null;
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
  kind?: "goods" | "service";
  ymm_rate?: number | null;
  created_at: string;
  updated_at: string;
};

export function getText(key: "payment_terms"): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

export function getSetting(key: "ymm_rate" | "ymm_rate_service" | "partner_share" | "stripe_fee_rate" | "nudge_days"): number {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return Number(row?.value ?? 0);
}

// この商品の YMM の取り分（商品だけの設定 → なければ種類ごとの既定）
export function ymmRateOf(d: Pick<Draft, "kind" | "ymm_rate">): number {
  if (d.ymm_rate != null) return d.ymm_rate;
  return getSetting(d.kind === "service" ? "ymm_rate_service" : "ymm_rate");
}

// ありがとうの往復便の合言葉（注文ごと）。なければ作る
export function letterTokenOf(orderId: number): string {
  const db = getDb();
  const row = db.prepare("SELECT letter_token FROM orders WHERE id = ?").get(orderId) as { letter_token: string | null } | undefined;
  if (!row) throw new Error("注文が見つかりません");
  if (row.letter_token) return row.letter_token;
  const t = randomBytes(12).toString("base64url");
  db.prepare("UPDATE orders SET letter_token = ? WHERE id = ?").run(t, orderId);
  return t;
}
