// iPhone 実機テスト・デモ撮影用：本番ビルドを https で動かす（自動更新なし・同じ Wi-Fi 内だけ）
import https from "node:https";
import fs from "node:fs";
import next from "next";

const port = Number(process.env.PORT || 3100);
const app = next({ dev: false });
const handle = app.getRequestHandler();
await app.prepare();
https
  .createServer(
    { key: fs.readFileSync("certificates/lan-key.pem"), cert: fs.readFileSync("certificates/lan.pem") },
    (req, res) => handle(req, res),
  )
  .listen(port, "0.0.0.0", () => console.log(`ready on https://0.0.0.0:${port}`));
