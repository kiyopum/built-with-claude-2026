// 八百ビズのデータベース（SQLite）。ファイルは data/yaobiz.db（GitHub には上げない）。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

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
  `);

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

export type Shop = { id: number; name: string; category: string; area: string };
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
  created_at: string;
  updated_at: string;
};
