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
      // API は「いつ・何秒で・どう終わったか」も記録（iPhone で止まって見えたとき、サーバーが返したかを確かめるため）
      if (req.url?.startsWith("/api/")) {
        const t0 = Date.now();
        res.on("finish", () => console.log(`[res] ${new Date().toTimeString().slice(0, 8)} ${req.method} ${req.url} ${res.statusCode} ${((Date.now() - t0) / 1000).toFixed(1)}秒`));
        res.on("close", () => {
          if (!res.writableFinished) console.log(`[res] ${req.method} ${req.url} 途中で切れた（端末側が切った）`);
        });
      }
      // 作り直すたびにファイル名が変わるので、iPhone に古いページを覚えさせない（古いページは見た目が崩れて 404 になる）
      if (!req.url?.startsWith("/_next/static/")) res.setHeader("Cache-Control", "no-store, must-revalidate");
      return handle(req, res);
    },
  )
  .listen(port, "0.0.0.0", () => console.log(`ready on https://0.0.0.0:${port}`));

// iPhone Safari は使い終わったつながりを使い回す。サーバーが先に閉じたつながりに送ると、その送信が届かずに止まる。
// サーバー側は長めに開けておき、閉じるのは端末側に任せる（Node の既定は5秒）。
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 0; // Claude の作業（長くて2分ほど）を途中で切らない

// つながりかけて証明書などで断られたものも記録する
server.on("tlsClientError", (err, socket) => console.log(`[tls-error] ${socket.remoteAddress} ${err.code ?? ""} ${err.message}`));
server.on("connection", (socket) => {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(socket.remoteAddress ?? "")) console.log(`[connect] ${socket.remoteAddress}`);
});
