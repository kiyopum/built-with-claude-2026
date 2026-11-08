// アプリの外から見たアドレス（決済の戻り先・メールのリンクに使う）
//   Origin ヘッダーは送る側が自由に書けるので使わない（偽のアドレスで事業者さん専用ページのリンクを作られるため）。
//   サーバーに置くときは .env の APP_BASE_URL（例 https://例.example.com）。無ければ、この要求のアドレス（手元で動かすとき）
export function appOrigin(req: Request): string {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (base && /^https?:\/\//.test(base)) return base;
  return new URL(req.url).origin;
}
