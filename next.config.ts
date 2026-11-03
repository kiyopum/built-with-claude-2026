import type { NextConfig } from "next";
import os from "node:os";

// この Mac の今のネットワークのアドレス（iPhone 実機テスト用）
const lanIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((n) => n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

const nextConfig: NextConfig = {
  /* config options here */
  // iPhone 実機テスト用：同じ Wi-Fi の中からの表示を許可（開発時のみ有効）
  allowedDevOrigins: lanIps,
  // サーバー（VPS）に置くときだけ、動かすのに要るファイルだけをまとめる（YAOBIZ_STANDALONE=1 でビルド）
  output: process.env.YAOBIZ_STANDALONE ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
