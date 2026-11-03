// iPhone 実機テスト・デモ撮影用：本番ビルドを https で動かす（自動更新なし・同じ Wi-Fi 内だけ）
import https from "node:https";
import fs from "node:fs";
import next from "next";

const port = Number(process.env.PORT || 3100);
const app = next({ dev: false });
const handle = app.getRequestHandler();
await app.prepare();
const server = https
  .createServer(
    { key: fs.readFileSync("certificates/lan-key.pem"), cert: fs.readFileSync("certificates/lan.pem") },
    (req, res) => {
      // どの端末から何が来たかを記録（iPhone からつながっているかの確認用）
      if (!req.url?.startsWith("/_next/")) console.log(`[req] ${req.socket.remoteAddress} ${req.method} ${req.url}`);
      // 作り直すたびにファイル名が変わるので、iPhone に古いページを覚えさせない（古いページは見た目が崩れて 404 になる）
      if (!req.url?.startsWith("/_next/static/")) res.setHeader("Cache-Control", "no-store, must-revalidate");
      return handle(req, res);
    },
  )
  .listen(port, "0.0.0.0", () => console.log(`ready on https://0.0.0.0:${port}`));

// つながりかけて証明書などで断られたものも記録する
server.on("tlsClientError", (err, socket) => console.log(`[tls-error] ${socket.remoteAddress} ${err.code ?? ""} ${err.message}`));
server.on("connection", (socket) => {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socket.remoteAddress ?? "")) console.log(`[connect] ${socket.remoteAddress}`);
});
